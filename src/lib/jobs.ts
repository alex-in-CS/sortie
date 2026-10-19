import "server-only";
import { createHash } from "node:crypto";
import { getDb } from "./db";
import type { MatchResult } from "./match";
import type { Provider, Salary, SourceJob } from "./sources/types";

// Storage for phase 2: companies, jobs, matches and the worker's tasks.

export type Company = {
  id: number;
  name: string;
  provider: Provider;
  board: string;
  origin: "registry" | "manual" | "discovered";
  careers_url: string | null;
  enabled: number;
  added_at: string;
  last_fetched_at: string | null;
  last_job_count: number | null;
  last_error: string | null;
};

export type RegistryEntry = { name: string; provider: Provider; board: string; careersUrl?: string | null };

type JobRow = {
  id: number;
  company_id: number;
  provider_job_id: string;
  title: string;
  location: string;
  country_codes: string;
  work_mode: SourceJob["workMode"];
  employment_type: SourceJob["employmentType"];
  department: string | null;
  level: string | null;
  description: string | null;
  url: string;
  apply_url: string | null;
  salary: string | null;
  posted_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  closed_at: string | null;
  hash: string;
};

export type Job = Omit<JobRow, "country_codes" | "salary"> & { country_codes: string[]; salary: Salary | null };

const toJob = (r: JobRow): Job => ({
  ...r,
  country_codes: JSON.parse(r.country_codes),
  salary: r.salary ? JSON.parse(r.salary) : null,
});

// node:sqlite rows have a null prototype, which React refuses to pass to
// client components; everything leaving this module is a plain object.
export const plain = <T>(row: unknown) => ({ ...(row as object) }) as T;

export const sha1 = (...parts: unknown[]) => createHash("sha1").update(JSON.stringify(parts)).digest("hex");

export const tx = <T>(fn: () => T): T => {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
};

// ---------- companies ----------

// Adds new registry entries and refreshes names/links. Never touches `enabled`,
// so companies the owner switched off stay off.
export function syncRegistry(entries: RegistryEntry[]) {
  const now = new Date().toISOString();
  const stmt = getDb().prepare(
    `INSERT INTO companies (name, provider, board, origin, careers_url, added_at) VALUES (?, ?, ?, 'registry', ?, ?)
     ON CONFLICT(provider, board) DO UPDATE SET name = excluded.name, careers_url = COALESCE(excluded.careers_url, companies.careers_url)`,
  );
  tx(() => {
    for (const e of entries) stmt.run(e.name, e.provider, e.board, e.careersUrl ?? null, now);
  });
}

export const listCompanies = () =>
  getDb().prepare("SELECT * FROM companies ORDER BY name COLLATE NOCASE").all().map((r) => plain<Company>(r));

export const enabledCompanies = () =>
  getDb()
    .prepare("SELECT * FROM companies WHERE enabled = 1 ORDER BY name COLLATE NOCASE")
    .all()
    .map((r) => plain<Company>(r));

export function setCompanyEnabled(id: number, enabled: boolean) {
  return getDb().prepare("UPDATE companies SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id).changes > 0;
}

export function recordFetch(id: number, result: { count: number } | { error: string }) {
  const now = new Date().toISOString();
  if ("error" in result)
    getDb().prepare("UPDATE companies SET last_fetched_at = ?, last_error = ? WHERE id = ?").run(now, result.error, id);
  else
    getDb()
      .prepare("UPDATE companies SET last_fetched_at = ?, last_job_count = ?, last_error = NULL WHERE id = ?")
      .run(now, result.count, id);
}

// ---------- jobs ----------

const jobHash = (j: SourceJob) => sha1(j.title, j.location, j.workMode, j.employmentType, j.description, j.salary);

// Upserts one board's postings. Jobs not seen in this fetch are closed, unless
// the fetch was partial (capped or narrowed), where absence proves nothing.
export function saveBoard(companyId: number, jobs: SourceJob[], complete: boolean) {
  const now = new Date().toISOString();
  const db = getDb();
  const existing = new Map(
    (
      db.prepare("SELECT provider_job_id, hash, closed_at FROM jobs WHERE company_id = ?").all(companyId) as {
        provider_job_id: string;
        hash: string;
        closed_at: string | null;
      }[]
    ).map((r) => [r.provider_job_id, r]),
  );
  // A description fetched by detail() is kept when the list omits it again;
  // the first posted date is kept because Workday's are relative ("30+ days ago").
  const upsert = db.prepare(
    `INSERT INTO jobs (company_id, provider_job_id, title, location, country_codes, work_mode, employment_type,
       department, level, description, url, apply_url, salary, posted_at, first_seen_at, last_seen_at, hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(company_id, provider_job_id) DO UPDATE SET
       title = excluded.title, location = excluded.location,
       country_codes = CASE WHEN excluded.country_codes = '[]' THEN jobs.country_codes ELSE excluded.country_codes END,
       work_mode = COALESCE(excluded.work_mode, jobs.work_mode),
       employment_type = COALESCE(excluded.employment_type, jobs.employment_type),
       department = COALESCE(excluded.department, jobs.department), level = COALESCE(excluded.level, jobs.level),
       description = COALESCE(excluded.description, jobs.description),
       url = CASE WHEN jobs.description IS NOT NULL AND excluded.description IS NULL THEN jobs.url ELSE excluded.url END,
       apply_url = COALESCE(excluded.apply_url, jobs.apply_url), salary = COALESCE(excluded.salary, jobs.salary),
       posted_at = COALESCE(jobs.posted_at, excluded.posted_at),
       last_seen_at = excluded.last_seen_at, closed_at = NULL,
       hash = CASE WHEN excluded.description IS NULL AND jobs.description IS NOT NULL THEN jobs.hash ELSE excluded.hash END`,
  );
  let added = 0;
  let changed = 0;
  let reopened = 0;
  const seen = new Set<string>();
  return tx(() => {
    for (const j of jobs) {
      if (seen.has(j.providerJobId)) continue;
      seen.add(j.providerJobId);
      const hash = jobHash(j);
      const prev = existing.get(j.providerJobId);
      if (!prev) added++;
      else {
        if (prev.closed_at) reopened++;
        if (prev.hash !== hash && j.description !== null) changed++;
      }
      upsert.run(
        companyId,
        j.providerJobId,
        j.title,
        j.location,
        JSON.stringify(j.countryCodes),
        j.workMode,
        j.employmentType,
        j.department,
        j.level,
        j.description,
        j.url,
        j.applyUrl,
        j.salary ? JSON.stringify(j.salary) : null,
        j.postedAt,
        now,
        now,
        hash,
      );
    }
    const closed = complete
      ? Number(
          db
            .prepare("UPDATE jobs SET closed_at = ? WHERE company_id = ? AND closed_at IS NULL AND last_seen_at < ?")
            .run(now, companyId, now).changes,
        )
      : 0;
    return { added, changed, reopened, closed, seen: seen.size };
  });
}

export const jobsMissingDescription = (companyId: number) =>
  (
    getDb()
      .prepare("SELECT * FROM jobs WHERE company_id = ? AND closed_at IS NULL AND description IS NULL")
      .all(companyId) as JobRow[]
  ).map(toJob);

export function saveDetail(id: number, d: Partial<SourceJob>) {
  getDb()
    .prepare(
      `UPDATE jobs SET description = COALESCE(?, description), location = COALESCE(?, location),
         country_codes = COALESCE(?, country_codes), work_mode = COALESCE(?, work_mode),
         employment_type = COALESCE(?, employment_type), url = COALESCE(?, url), apply_url = COALESCE(?, apply_url),
         hash = ?
       WHERE id = ?`,
    )
    .run(
      d.description ?? null,
      d.location ?? null,
      d.countryCodes?.length ? JSON.stringify(d.countryCodes) : null,
      d.workMode ?? null,
      d.employmentType ?? null,
      d.url ?? null,
      d.applyUrl ?? null,
      sha1("detail", d.description ?? null),
      id,
    );
}

export type OpenJob = Job & { company: string };

export const openJobs = () =>
  (
    getDb()
      .prepare(
        `SELECT jobs.*, companies.name AS company FROM jobs JOIN companies ON companies.id = jobs.company_id
         WHERE jobs.closed_at IS NULL AND companies.enabled = 1`,
      )
      .all() as (JobRow & { company: string })[]
  ).map((r) => ({ ...toJob(r), company: r.company }));

export function getJob(id: number) {
  const r = getDb()
    .prepare("SELECT jobs.*, companies.name AS company FROM jobs JOIN companies ON companies.id = jobs.company_id WHERE jobs.id = ?")
    .get(id) as (JobRow & { company: string }) | undefined;
  return r ? { ...toJob(r), company: r.company } : undefined;
}

export function jobCounts() {
  return getDb()
    .prepare(
      `SELECT COUNT(*) AS total, SUM(closed_at IS NULL) AS open,
         SUM(closed_at IS NULL AND description IS NULL) AS without_description FROM jobs`,
    )
    .get() as { total: number; open: number | null; without_description: number | null };
}

// ---------- matches ----------

export const matchHashes = (searchId: string) =>
  new Map(
    (
      getDb().prepare("SELECT job_id, input_hash FROM matches WHERE search_id = ?").all(searchId) as {
        job_id: number;
        input_hash: string;
      }[]
    ).map((r) => [r.job_id, r.input_hash]),
  );

export function saveMatches(searchId: string, rows: { jobId: number; inputHash: string; result: MatchResult }[]) {
  const now = new Date().toISOString();
  const stmt = getDb().prepare(
    `INSERT INTO matches (job_id, search_id, score, rejected, seniority, matched, missing, notes, input_hash, scored_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(job_id, search_id) DO UPDATE SET score = excluded.score, rejected = excluded.rejected,
       seniority = excluded.seniority, matched = excluded.matched, missing = excluded.missing, notes = excluded.notes,
       input_hash = excluded.input_hash, scored_at = excluded.scored_at`,
  );
  tx(() => {
    for (const { jobId, inputHash, result: r } of rows)
      stmt.run(
        jobId,
        searchId,
        r.score,
        r.rejected,
        r.seniority,
        JSON.stringify(r.matched),
        JSON.stringify(r.missing),
        JSON.stringify(r.notes),
        inputHash,
        now,
      );
  });
}

// Matches for searches that no longer exist are dead weight.
export function pruneMatches(searchIds: string[]) {
  const db = getDb();
  if (!searchIds.length) return Number(db.prepare("DELETE FROM matches").run().changes);
  return Number(
    db.prepare(`DELETE FROM matches WHERE search_id NOT IN (${searchIds.map(() => "?").join(",")})`).run(...searchIds)
      .changes,
  );
}

export type MatchRow = {
  job_id: number;
  search_id: string;
  score: number;
  rejected: string | null;
  seniority: string;
  matched: string[];
  missing: string[];
  notes: string[];
  scored_at: string;
  title: string;
  company: string;
  location: string;
  work_mode: string | null;
  url: string;
  posted_at: string | null;
  first_seen_at: string;
};

export type MatchView = "qualified" | "below" | "rejected";

// qualified: passed the filters and cleared the search's bar; below: passed the
// filters but scored under it; rejected: failed a hard filter (with the reason).
export function listMatches(searchId: string, view: MatchView, minScore: number, limit = 200) {
  const where = {
    qualified: "m.rejected IS NULL AND m.score >= ?",
    below: "m.rejected IS NULL AND m.score < ?",
    rejected: "m.rejected IS NOT NULL AND ? IS NOT NULL",
  }[view];
  const rows = getDb()
    .prepare(
      `SELECT m.job_id, m.search_id, m.score, m.rejected, m.seniority, m.matched, m.missing, m.notes, m.scored_at,
         j.title, j.location, j.work_mode, j.url, j.posted_at, j.first_seen_at, c.name AS company
       FROM matches m JOIN jobs j ON j.id = m.job_id JOIN companies c ON c.id = j.company_id
       WHERE m.search_id = ? AND j.closed_at IS NULL AND c.enabled = 1 AND ${where}
       ORDER BY ${view === "rejected" ? "m.rejected, c.name" : "m.score DESC, j.first_seen_at DESC"} LIMIT ?`,
    )
    .all(searchId, minScore, limit) as (Omit<MatchRow, "matched" | "missing" | "notes"> & {
    matched: string;
    missing: string;
    notes: string;
  })[];
  return rows.map(
    (r): MatchRow => ({ ...r, matched: JSON.parse(r.matched), missing: JSON.parse(r.missing), notes: JSON.parse(r.notes) }),
  );
}

export function matchSummary(searchId: string, minScore: number) {
  return getDb()
    .prepare(
      `SELECT COUNT(*) AS scored, SUM(m.rejected IS NULL AND m.score >= ?1) AS qualified,
         SUM(m.rejected IS NULL AND m.score < ?1) AS below, SUM(m.rejected IS NOT NULL) AS rejected
       FROM matches m JOIN jobs j ON j.id = m.job_id JOIN companies c ON c.id = j.company_id
       WHERE m.search_id = ?2 AND j.closed_at IS NULL AND c.enabled = 1`,
    )
    .get(minScore, searchId) as { scored: number; qualified: number | null; below: number | null; rejected: number | null };
}

// ---------- tasks ----------

export type Task = {
  id: number;
  type: string;
  payload: string;
  status: "queued" | "running" | "done" | "failed";
  attempts: number;
  run_after: string;
  started_at: string | null;
  finished_at: string | null;
  result: string | null;
  last_error: string | null;
  created_at: string;
};

// One queued or running task per type is enough; asking twice returns the existing one.
// A task "running" for longer than this lost its process (a killed `npm run
// fetch`, a crash with no worker restart since). A full cycle takes minutes.
const STALE_MS = 3 * 3_600_000;
const staleCutoff = () => new Date(Date.now() - STALE_MS).toISOString();

export function enqueue(type: string, payload: object = {}, runAfter = new Date()) {
  const db = getDb();
  return tx(() => {
    db.prepare(
      `UPDATE tasks SET status = 'failed', finished_at = ?, last_error = 'Abandoned: the process running it stopped'
       WHERE type = ? AND status = 'running' AND started_at < ?`,
    ).run(new Date().toISOString(), type, staleCutoff());
    const open = db.prepare("SELECT id FROM tasks WHERE type = ? AND status IN ('queued', 'running')").get(type) as
      | { id: number }
      | undefined;
    if (open) return { id: open.id, created: false };
    const now = new Date().toISOString();
    const r = db
      .prepare("INSERT INTO tasks (type, payload, run_after, created_at) VALUES (?, ?, ?, ?)")
      .run(type, JSON.stringify(payload), runAfter.toISOString(), now);
    return { id: Number(r.lastInsertRowid), created: true };
  });
}

export function claimTask(): Task | undefined {
  const now = new Date().toISOString();
  const row = getDb()
    .prepare(
      `UPDATE tasks SET status = 'running', started_at = ?, attempts = attempts + 1
       WHERE id = (SELECT id FROM tasks WHERE status = 'queued' AND run_after <= ? ORDER BY run_after LIMIT 1)
       RETURNING *`,
    )
    .get(now, now);
  return row ? plain<Task>(row) : undefined;
}

export function finishTask(id: number, result: object) {
  getDb()
    .prepare("UPDATE tasks SET status = 'done', finished_at = ?, result = ?, last_error = NULL WHERE id = ?")
    .run(new Date().toISOString(), JSON.stringify(result), id);
}

export function failTask(task: Task, error: string, maxAttempts = 3) {
  const now = new Date();
  const retry = task.attempts < maxAttempts;
  getDb()
    .prepare("UPDATE tasks SET status = ?, finished_at = ?, last_error = ?, run_after = ? WHERE id = ?")
    .run(
      retry ? "queued" : "failed",
      retry ? null : now.toISOString(),
      error,
      new Date(now.getTime() + 60_000 * 5 ** task.attempts).toISOString(),
      task.id,
    );
}

// For one-off runs outside the queue (npm run fetch), so they show up in the run log too.
export function startTask(type: string, payload: object = {}): Task {
  const now = new Date().toISOString();
  const row = getDb()
    .prepare(
      `INSERT INTO tasks (type, payload, status, attempts, run_after, started_at, created_at)
       VALUES (?, ?, 'running', 1, ?, ?, ?) RETURNING *`,
    )
    .get(type, JSON.stringify(payload), now, now, now);
  return plain<Task>(row);
}

// A crash leaves tasks "running" forever; the worker requeues them on start.
export const requeueStale = () =>
  Number(getDb().prepare("UPDATE tasks SET status = 'queued' WHERE status = 'running'").run().changes);

// Without a status, a queued or running task wins over newer finished ones, so the UI shows live work.
export function lastTask(type: string, status?: Task["status"]) {
  const order = status ? "id DESC" : "(status = 'queued' OR (status = 'running' AND started_at >= ?)) DESC, id DESC";
  const row = getDb()
    .prepare(`SELECT * FROM tasks WHERE type = ? ${status ? "AND status = ?" : ""} ORDER BY ${order} LIMIT 1`)
    .get(...(status ? [type, status] : [type, staleCutoff()]));
  return row ? plain<Task>(row) : undefined;
}
