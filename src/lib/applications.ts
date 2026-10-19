import "server-only";
import { getDb } from "./db";
import { plain, tx } from "./jobs";
import type { ApplicationStatus, TailoredResume, TruthReport } from "./schema";

// Storage for phase 3: Claude's reviews of (job, search) pairs, the jobs Sortie
// chose to apply to, and each application's step history.

// ---------- reviews ----------

export type Verdict = "strong" | "good" | "stretch" | "poor";

export type Review = {
  score: number;
  verdict: Verdict;
  reasons: string[];
  gaps: string[];
  dealbreaker: string | null;
};

export type ReviewCandidate = {
  job_id: number;
  search_id: string;
  rule_score: number;
  title: string;
  company: string;
  location: string;
  work_mode: string | null;
  description: string;
  job_hash: string;
  review_hash: string | null;
};

// Jobs that passed the rules for a search and scored within `margin` of its bar,
// best first, that have a description and no application yet.
export function reviewCandidates(searchId: string, floor: number, limit: number) {
  return getDb()
    .prepare(
      `SELECT m.job_id, m.search_id, m.score AS rule_score, j.title, c.name AS company, j.location, j.work_mode,
         j.description, j.hash AS job_hash, r.input_hash AS review_hash
       FROM matches m JOIN jobs j ON j.id = m.job_id JOIN companies c ON c.id = j.company_id
       LEFT JOIN reviews r ON r.job_id = m.job_id AND r.search_id = m.search_id
       WHERE m.search_id = ? AND m.rejected IS NULL AND m.score >= ? AND j.closed_at IS NULL AND c.enabled = 1
         AND j.description IS NOT NULL AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id = m.job_id)
       ORDER BY m.score DESC, j.first_seen_at DESC LIMIT ?`,
    )
    .all(searchId, floor, limit)
    .map((r) => plain<ReviewCandidate>(r));
}

export function saveReview(jobId: number, searchId: string, review: Review, model: string, inputHash: string) {
  getDb()
    .prepare(
      `INSERT INTO reviews (job_id, search_id, score, verdict, reasons, gaps, dealbreaker, model, input_hash, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(job_id, search_id) DO UPDATE SET score = excluded.score, verdict = excluded.verdict,
         reasons = excluded.reasons, gaps = excluded.gaps, dealbreaker = excluded.dealbreaker, model = excluded.model,
         input_hash = excluded.input_hash, reviewed_at = excluded.reviewed_at`,
    )
    .run(
      jobId,
      searchId,
      review.score,
      review.verdict,
      JSON.stringify(review.reasons),
      JSON.stringify(review.gaps),
      review.dealbreaker,
      model,
      inputHash,
      new Date().toISOString(),
    );
}

type ReviewRow = Omit<Review, "reasons" | "gaps"> & { job_id: number; reasons: string; gaps: string; reviewed_at: string };
export type StoredReview = Review & { job_id: number; reviewed_at: string };

const toReview = (r: ReviewRow): StoredReview => ({ ...r, reasons: JSON.parse(r.reasons), gaps: JSON.parse(r.gaps) });

// Reviews for a set of jobs in one search, keyed by job id.
export function reviewsFor(searchId: string, jobIds: number[]) {
  if (!jobIds.length) return new Map<number, StoredReview>();
  const rows = getDb()
    .prepare(
      `SELECT job_id, score, verdict, reasons, gaps, dealbreaker, reviewed_at FROM reviews
       WHERE search_id = ? AND job_id IN (${jobIds.map(() => "?").join(",")})`,
    )
    .all(searchId, ...jobIds) as ReviewRow[];
  return new Map(rows.map((r) => [r.job_id, toReview(plain<ReviewRow>(r))]));
}

export const pruneReviews = (searchIds: string[]) =>
  getDb()
    .prepare(`DELETE FROM reviews WHERE search_id NOT IN (${searchIds.map(() => "?").join(",") || "''"})`)
    .run(...searchIds);

// ---------- selection inputs ----------

export type SelectionCandidate = {
  job_id: number;
  search_id: string;
  company_id: number;
  company: string;
  title: string;
  rule_score: number;
  review_score: number | null;
  verdict: Verdict | null;
  dealbreaker: string | null;
  first_seen_at: string;
};

// Every open job that passed the rules for one of the given searches and has no
// application yet, with its review if it has one.
export function selectionCandidates(searchIds: string[]) {
  if (!searchIds.length) return [];
  return getDb()
    .prepare(
      `SELECT m.job_id, m.search_id, j.company_id, c.name AS company, j.title, m.score AS rule_score,
         r.score AS review_score, r.verdict, r.dealbreaker, j.first_seen_at
       FROM matches m JOIN jobs j ON j.id = m.job_id JOIN companies c ON c.id = j.company_id
       LEFT JOIN reviews r ON r.job_id = m.job_id AND r.search_id = m.search_id
       WHERE m.search_id IN (${searchIds.map(() => "?").join(",")}) AND m.rejected IS NULL
         AND j.closed_at IS NULL AND c.enabled = 1
         AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id = m.job_id)`,
    )
    .all(...searchIds)
    .map((r) => plain<SelectionCandidate>(r));
}

// Applications counted against the caps: anything not skipped, including ones
// you picked by hand (those are never blocked, but they use up room). Per
// company over the last 30 days; per day since local midnight.
export function capUsage(now = new Date()) {
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const db = getDb();
  const perCompany = new Map(
    (
      db
        .prepare(
          `SELECT j.company_id, COUNT(*) AS n FROM applications a JOIN jobs j ON j.id = a.job_id
           WHERE a.status != 'skipped' AND a.created_at >= ? GROUP BY j.company_id`,
        )
        .all(since) as { company_id: number; n: number }[]
    ).map((r) => [r.company_id, r.n]),
  );
  const today = (
    db
      .prepare("SELECT COUNT(*) AS n FROM applications WHERE status != 'skipped' AND created_at >= ?")
      .get(midnight.toISOString()) as { n: number }
  ).n;
  return { perCompany, today };
}

// ---------- applications ----------

export type Application = {
  id: number;
  job_id: number;
  search_id: string;
  origin: "auto" | "manual";
  status: ApplicationStatus;
  score: number;
  mode: "auto" | "review";
  resume: TailoredResume | null;
  truth: TruthReport | null;
  resume_file: string | null;
  error: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
};

type ApplicationRow = Omit<Application, "resume" | "truth"> & { resume: string | null; truth: string | null };

const toApplication = (r: ApplicationRow): Application => ({
  ...plain<ApplicationRow>(r),
  resume: r.resume ? JSON.parse(r.resume) : null,
  truth: r.truth ? JSON.parse(r.truth) : null,
});

export function logEvent(applicationId: number, kind: string, detail: string | null = null) {
  getDb()
    .prepare("INSERT INTO application_events (application_id, at, kind, detail) VALUES (?, ?, ?, ?)")
    .run(applicationId, new Date().toISOString(), kind, detail);
}

// One application per job, ever: a second request for the same job returns the
// existing one.
export function createApplication(a: {
  jobId: number;
  searchId: string;
  origin: Application["origin"];
  score: number;
  mode: Application["mode"];
  reason: string;
}) {
  return tx(() => {
    const db = getDb();
    const existing = db.prepare("SELECT id FROM applications WHERE job_id = ?").get(a.jobId) as { id: number } | undefined;
    if (existing) return { id: existing.id, created: false };
    const now = new Date().toISOString();
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO applications (job_id, search_id, origin, status, score, mode, created_at, updated_at)
         VALUES (?, ?, ?, 'queued', ?, ?, ?, ?)`,
      )
      .run(a.jobId, a.searchId, a.origin, a.score, a.mode, now, now);
    const id = Number(lastInsertRowid);
    logEvent(id, "selected", a.reason);
    return { id, created: true };
  });
}

export function setStatus(id: number, status: ApplicationStatus, detail: string | null = null) {
  getDb()
    .prepare("UPDATE applications SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, new Date().toISOString(), id);
  logEvent(id, status, detail);
}

// Atomically takes the oldest queued application for tailoring.
export function claimForTailoring(): Application | undefined {
  const row = getDb()
    .prepare(
      `UPDATE applications SET status = 'tailoring', attempts = attempts + 1, updated_at = ?
       WHERE id = (SELECT id FROM applications WHERE status = 'queued' ORDER BY origin = 'manual' DESC, score DESC, id LIMIT 1)
       RETURNING *`,
    )
    .get(new Date().toISOString()) as ApplicationRow | undefined;
  if (!row) return undefined;
  logEvent(row.id, "tailoring");
  return toApplication(row);
}

export function saveTailored(id: number, resume: TailoredResume, truth: TruthReport, resumeFile: string) {
  getDb()
    .prepare(
      `UPDATE applications SET status = 'ready', resume = ?, truth = ?, resume_file = ?, error = NULL, updated_at = ?
       WHERE id = ?`,
    )
    .run(JSON.stringify(resume), JSON.stringify(truth), resumeFile, new Date().toISOString(), id);
  const n = truth.issues.length;
  logEvent(id, "ready", n ? `Truth check fixed ${n} item${n === 1 ? "" : "s"}` : "Truth check passed");
}

// A failed tailoring goes back to the queue until it has had three tries.
export function failTailoring(app: Application, error: string, maxAttempts = 3) {
  const status: ApplicationStatus = app.attempts >= maxAttempts ? "needs_you" : "queued";
  getDb()
    .prepare("UPDATE applications SET status = ?, error = ?, updated_at = ? WHERE id = ?")
    .run(status, error, new Date().toISOString(), app.id);
  logEvent(app.id, status === "queued" ? "retry" : "needs_you", error);
}

// Tailoring interrupted by a crash or restart goes back to the queue.
export const requeueTailoring = () =>
  getDb().prepare("UPDATE applications SET status = 'queued' WHERE status = 'tailoring'").run();

export function getApplication(id: number) {
  const row = getDb().prepare("SELECT * FROM applications WHERE id = ?").get(id) as ApplicationRow | undefined;
  return row ? toApplication(row) : undefined;
}

export type ApplicationView = Application & {
  title: string;
  company: string;
  location: string;
  url: string;
  search_name?: string;
  review: StoredReview | null;
};

export function listApplications(statuses?: ApplicationStatus[]) {
  const where = statuses?.length ? `WHERE a.status IN (${statuses.map(() => "?").join(",")})` : "";
  const rows = getDb()
    .prepare(
      `SELECT a.*, j.title, c.name AS company, j.location, j.url,
         r.score AS r_score, r.verdict AS r_verdict, r.reasons AS r_reasons, r.gaps AS r_gaps,
         r.dealbreaker AS r_dealbreaker, r.reviewed_at AS r_reviewed_at
       FROM applications a JOIN jobs j ON j.id = a.job_id JOIN companies c ON c.id = j.company_id
       LEFT JOIN reviews r ON r.job_id = a.job_id AND r.search_id = a.search_id
       ${where} ORDER BY a.updated_at DESC`,
    )
    .all(...(statuses ?? [])) as (ApplicationRow & {
    title: string;
    company: string;
    location: string;
    url: string;
    r_score: number | null;
    r_verdict: Verdict | null;
    r_reasons: string | null;
    r_gaps: string | null;
    r_dealbreaker: string | null;
    r_reviewed_at: string | null;
  })[];
  return rows.map((r): ApplicationView => {
    const { r_score, r_verdict, r_reasons, r_gaps, r_dealbreaker, r_reviewed_at, ...rest } = plain<typeof r>(r);
    return {
      ...toApplication(rest),
      title: rest.title,
      company: rest.company,
      location: rest.location,
      url: rest.url,
      review:
        r_score === null
          ? null
          : {
              job_id: rest.job_id,
              score: r_score,
              verdict: r_verdict!,
              reasons: JSON.parse(r_reasons!),
              gaps: JSON.parse(r_gaps!),
              dealbreaker: r_dealbreaker,
              reviewed_at: r_reviewed_at!,
            },
    };
  });
}

export function applicationEvents(id: number) {
  return getDb()
    .prepare("SELECT at, kind, detail FROM application_events WHERE application_id = ? ORDER BY id")
    .all(id)
    .map((r) => plain<{ at: string; kind: string; detail: string | null }>(r));
}

export function applicationCounts() {
  const rows = getDb().prepare("SELECT status, COUNT(*) AS n FROM applications GROUP BY status").all() as {
    status: ApplicationStatus;
    n: number;
  }[];
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<ApplicationStatus, number>>;
}

export const APPLICATION_ACTIONS = ["skip", "restore", "retailor"] as const;
export type ApplicationAction = (typeof APPLICATION_ACTIONS)[number];

// The owner's controls on the Applications page. Returns the new status, or an
// error when the action doesn't fit the current one.
export function actOnApplication(id: number, action: ApplicationAction): { status: ApplicationStatus } | { error: string; code: number } {
  const app = getApplication(id);
  if (!app) return { error: "No such application.", code: 404 };
  if (app.status === "tailoring") return { error: "It's being tailored right now. Try again in a minute.", code: 409 };
  if (action === "skip") {
    if (app.status === "skipped") return { status: "skipped" };
    setStatus(id, "skipped", "Skipped by you");
    return { status: "skipped" };
  }
  if (action === "restore") {
    if (app.status !== "skipped") return { error: "Only a skipped application can be restored.", code: 409 };
    const status: ApplicationStatus = app.resume ? "ready" : "queued";
    setStatus(id, status, "Restored by you");
    return { status };
  }
  getDb()
    .prepare("UPDATE applications SET status = 'queued', attempts = 0, error = NULL, updated_at = ? WHERE id = ?")
    .run(new Date().toISOString(), id);
  logEvent(id, "queued", "Re-tailoring requested by you");
  return { status: "queued" };
}

// The rule score of an open job in one search, or undefined if it isn't there.
export const openMatchScore = (jobId: number, searchId: string) =>
  (
    getDb()
      .prepare(
        "SELECT m.score FROM matches m JOIN jobs j ON j.id = m.job_id WHERE m.job_id = ? AND m.search_id = ? AND j.closed_at IS NULL",
      )
      .get(jobId, searchId) as { score: number } | undefined
  )?.score;

// Which of these jobs already have an application, and in what state.
export function applicationsForJobs(jobIds: number[]) {
  if (!jobIds.length) return new Map<number, { id: number; status: ApplicationStatus }>();
  const rows = getDb()
    .prepare(`SELECT id, job_id, status FROM applications WHERE job_id IN (${jobIds.map(() => "?").join(",")})`)
    .all(...jobIds) as { id: number; job_id: number; status: ApplicationStatus }[];
  return new Map(rows.map((r) => [r.job_id, { id: r.id, status: r.status }]));
}
