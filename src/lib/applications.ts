import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, getDb } from "./db";
import { plain, tx } from "./jobs";
import type { FillResult, PlannedField } from "./apply/types";
import type { ApplicationStatus, TailoredResume, TruthReport } from "./schema";
import type { Provider } from "./sources/types";

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
  // What a tailored resume should bring forward, when the one you uploaded
  // undersells you for this job; null when it already makes the case (D-058).
  resumeAdvice: string | null;
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
      `INSERT INTO reviews (job_id, search_id, score, verdict, reasons, gaps, dealbreaker, resume_advice, model, input_hash, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(job_id, search_id) DO UPDATE SET score = excluded.score, verdict = excluded.verdict,
         reasons = excluded.reasons, gaps = excluded.gaps, dealbreaker = excluded.dealbreaker,
         resume_advice = excluded.resume_advice, model = excluded.model,
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
      review.resumeAdvice,
      model,
      inputHash,
      new Date().toISOString(),
    );
}

type ReviewRow = Omit<Review, "reasons" | "gaps" | "resumeAdvice"> & {
  job_id: number;
  reasons: string;
  gaps: string;
  resume_advice: string | null;
  reviewed_at: string;
};
export type StoredReview = Review & { job_id: number; reviewed_at: string };

const toReview = ({ resume_advice, ...r }: ReviewRow): StoredReview => ({
  ...r,
  reasons: JSON.parse(r.reasons),
  gaps: JSON.parse(r.gaps),
  resumeAdvice: resume_advice,
});

// Reviews for a set of jobs in one search, keyed by job id.
export function reviewsFor(searchId: string, jobIds: number[]) {
  if (!jobIds.length) return new Map<number, StoredReview>();
  const rows = getDb()
    .prepare(
      `SELECT job_id, score, verdict, reasons, gaps, dealbreaker, resume_advice, reviewed_at FROM reviews
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
  // Phase 4: the form step (D-056).
  apply_url: string | null;
  plan: PlannedField[] | null;
  fill: FillResult[] | null;
  screenshot: string | null;
  submitted_at: string | null;
  submitted_by: "sortie" | "you" | null;
};

type ApplicationRow = Omit<Application, "resume" | "truth" | "plan" | "fill"> & {
  resume: string | null;
  truth: string | null;
  plan: string | null;
  fill: string | null;
};

const toApplication = (r: ApplicationRow): Application => ({
  ...plain<ApplicationRow>(r),
  resume: r.resume ? JSON.parse(r.resume) : null,
  truth: r.truth ? JSON.parse(r.truth) : null,
  plan: r.plan ? JSON.parse(r.plan) : null,
  fill: r.fill ? JSON.parse(r.fill) : null,
});

// The cover letter sits next to the resume: …/Name-Resume.docx → …/Name-Cover-Letter.pdf.
export const coverLetterFile = (resumeFile: string) => resumeFile.replace(/Resume\.\w+$/, "Cover-Letter.pdf");

export const hasCoverLetter = (app: Pick<Application, "resume_file">) =>
  !!app.resume_file && fs.existsSync(path.join(DATA_DIR, coverLetterFile(app.resume_file)));

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
  logEvent(id, "ready", `Tailored resume; ${n ? `truth check fixed ${n} item${n === 1 ? "" : "s"}` : "truth check passed"}`);
}

// Your uploaded resume, as is: no tailoring, no truth report (D-058).
export function saveAsIs(id: number, resumeFile: string) {
  getDb()
    .prepare(
      `UPDATE applications SET status = 'ready', resume = NULL, truth = NULL, resume_file = ?, error = NULL, updated_at = ?
       WHERE id = ?`,
    )
    .run(resumeFile, new Date().toISOString(), id);
  logEvent(id, "ready", "Your resume as uploaded");
}

// A cover letter written for a form that requires one. Its truth check joins
// the resume's, if the resume was tailored too.
export function saveCoverLetter(id: number, truth: TruthReport) {
  const app = getApplication(id)!;
  const merged: TruthReport = app.truth ? { ...truth, issues: [...app.truth.issues, ...truth.issues] } : truth;
  getDb().prepare("UPDATE applications SET truth = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(merged), new Date().toISOString(), id);
  const n = truth.issues.length;
  logEvent(id, "cover_letter", `The form requires a cover letter; ${n ? `truth check fixed ${n} item${n === 1 ? "" : "s"}` : "truth check passed"}`);
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

// ---------- the form step ----------

// Atomically takes the next application whose documents are done.
export function claimForApplying(): Application | undefined {
  const row = getDb()
    .prepare(
      `UPDATE applications SET status = 'applying', updated_at = ?
       WHERE id = (SELECT id FROM applications WHERE status = 'ready' ORDER BY origin = 'manual' DESC, score DESC, id LIMIT 1)
       RETURNING *`,
    )
    .get(new Date().toISOString()) as ApplicationRow | undefined;
  if (!row) return undefined;
  logEvent(row.id, "applying");
  return toApplication(row);
}

// The next application you asked to open in Chrome.
export function nextHandoff(): Application | undefined {
  const row = getDb()
    .prepare("SELECT * FROM applications WHERE status = 'submitting' ORDER BY updated_at, id LIMIT 1")
    .get() as ApplicationRow | undefined;
  return row ? toApplication(row) : undefined;
}

export const hasHandoffs = () =>
  Boolean(getDb().prepare("SELECT 1 FROM applications WHERE status = 'submitting' LIMIT 1").get());

export type FormOutcome = {
  status: Extract<ApplicationStatus, "held" | "needs_you" | "submitted" | "skipped">;
  detail: string;
  applyUrl?: string | null;
  plan?: PlannedField[] | null;
  fill?: FillResult[] | null;
  screenshot?: string | null;
  error?: string | null;
};

// Records what the form step found. Fields not given keep their value.
export function saveFormOutcome(id: number, o: FormOutcome) {
  const now = new Date().toISOString();
  const keep = (v: unknown) => (v === undefined ? undefined : v === null ? null : typeof v === "string" ? v : JSON.stringify(v));
  const sets: string[] = ["status = ?", "updated_at = ?", "error = ?"];
  const args: (string | null)[] = [o.status, now, o.error ?? null];
  for (const [col, v] of [
    ["apply_url", o.applyUrl],
    ["plan", o.plan],
    ["fill", o.fill],
    ["screenshot", o.screenshot],
  ] as const) {
    const k = keep(v);
    if (k === undefined) continue;
    sets.push(`${col} = ?`);
    args.push(k);
  }
  if (o.status === "submitted") {
    sets.push("submitted_at = ?", "submitted_by = 'sortie'");
    args.push(now);
  }
  getDb().prepare(`UPDATE applications SET ${sets.join(", ")} WHERE id = ?`).run(...args, id);
  logEvent(id, o.status, o.detail);
}

// The form step interrupted by a crash or restart: filling starts over, and a
// Chrome window that was open goes back to waiting for you.
export function requeueApplying() {
  const db = getDb();
  const filling = Number(db.prepare("UPDATE applications SET status = 'ready' WHERE status = 'applying'").run().changes);
  const open = Number(db.prepare("UPDATE applications SET status = 'held' WHERE status = 'submitting'").run().changes);
  return filling + open;
}

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
  last_detail: string | null; // the latest step note: why it is held, what failed
  provider: Provider;
};

export function listApplications(statuses?: ApplicationStatus[]) {
  const where = statuses?.length ? `WHERE a.status IN (${statuses.map(() => "?").join(",")})` : "";
  const rows = getDb()
    .prepare(
      `SELECT a.*, j.title, c.name AS company, c.provider, j.location, j.url,
         (SELECT e.detail FROM application_events e WHERE e.application_id = a.id ORDER BY e.id DESC LIMIT 1) AS last_detail,
         r.score AS r_score, r.verdict AS r_verdict, r.reasons AS r_reasons, r.gaps AS r_gaps,
         r.dealbreaker AS r_dealbreaker, r.resume_advice AS r_resume_advice, r.reviewed_at AS r_reviewed_at
       FROM applications a JOIN jobs j ON j.id = a.job_id JOIN companies c ON c.id = j.company_id
       LEFT JOIN reviews r ON r.job_id = a.job_id AND r.search_id = a.search_id
       ${where} ORDER BY a.updated_at DESC`,
    )
    .all(...(statuses ?? [])) as (ApplicationRow & {
    title: string;
    company: string;
    location: string;
    url: string;
    provider: Provider;
    last_detail: string | null;
    r_score: number | null;
    r_verdict: Verdict | null;
    r_reasons: string | null;
    r_gaps: string | null;
    r_dealbreaker: string | null;
    r_resume_advice: string | null;
    r_reviewed_at: string | null;
  })[];
  return rows.map((r): ApplicationView => {
    const { r_score, r_verdict, r_reasons, r_gaps, r_dealbreaker, r_resume_advice, r_reviewed_at, ...rest } = plain<typeof r>(r);
    return {
      ...toApplication(rest),
      title: rest.title,
      company: rest.company,
      location: rest.location,
      url: rest.url,
      last_detail: rest.last_detail,
      provider: rest.provider,
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
              resumeAdvice: r_resume_advice,
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

export const APPLICATION_ACTIONS = ["skip", "restore", "retailor", "refill", "open", "submitted"] as const;
export type ApplicationAction = (typeof APPLICATION_ACTIONS)[number];

// The owner's controls on the Applications page. Returns the new status, or an
// error when the action doesn't fit the current one.
//   skip / restore   take it out of the run, or put it back
//   retailor         make the documents again (your latest resume, tailored
//                    if its review says so; a cover letter when a form asks)
//   refill           read and fill the form again (after you answered questions)
//   open             open the filled form in Chrome for you to submit
//   submitted        you sent it yourself
export function actOnApplication(id: number, action: ApplicationAction): { status: ApplicationStatus } | { error: string; code: number } {
  const app = getApplication(id);
  if (!app) return { error: "No such application.", code: 404 };
  if (app.status === "tailoring" || app.status === "applying")
    return { error: "Sortie is working on it right now. Try again in a minute.", code: 409 };
  if (app.status === "submitted") return { error: "It has already been submitted.", code: 409 };
  if (action === "submitted") {
    const now = new Date().toISOString();
    getDb()
      .prepare("UPDATE applications SET status = 'submitted', submitted_at = ?, submitted_by = 'you', updated_at = ? WHERE id = ?")
      .run(now, now, id);
    logEvent(id, "submitted", "Marked as submitted by you");
    return { status: "submitted" };
  }
  if (app.status === "submitting" && action !== "skip")
    return { error: "It's open in Chrome. Submit it there, or close the window first.", code: 409 };
  if (action === "refill" || action === "open") {
    if (!app.resume_file) return { error: "The resume isn't ready yet.", code: 409 };
    if (action === "open" && !app.plan) return { error: "Sortie hasn't read this form yet.", code: 409 };
    const status: ApplicationStatus = action === "open" ? "submitting" : "ready";
    setStatus(id, status, action === "open" ? "Opening in Chrome for you" : "Filling the form again, as you asked");
    return { status };
  }
  if (action === "skip") {
    if (app.status === "skipped") return { status: "skipped" };
    setStatus(id, "skipped", "Skipped by you");
    return { status: "skipped" };
  }
  if (action === "restore") {
    if (app.status !== "skipped") return { error: "Only a skipped application can be restored.", code: 409 };
    const status: ApplicationStatus = app.resume_file ? "ready" : "queued";
    setStatus(id, status, "Restored by you");
    return { status };
  }
  getDb()
    .prepare("UPDATE applications SET status = 'queued', attempts = 0, error = NULL, updated_at = ? WHERE id = ?")
    .run(new Date().toISOString(), id);
  logEvent(id, "queued", "New documents requested by you");
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
