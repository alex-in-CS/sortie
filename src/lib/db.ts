import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// Everything personal (the database, uploaded resumes) lives under data/,
// which is gitignored. SORTIE_DATA_DIR moves it somewhere else.
export const DATA_DIR = process.env.SORTIE_DATA_DIR
  ? path.resolve(/*turbopackIgnore: true*/ process.env.SORTIE_DATA_DIR)
  : path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

type Migration = string | ((db: DatabaseSync) => void);

const MIGRATIONS: Migration[] = [
  // v1: profile, preferences, uploaded documents
  `
  CREATE TABLE profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE preferences (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    mime TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
  // v2: one keyed table for single-document settings (profile, preferences,
  // searches, answers). Role filters moved from preferences into a search.
  (db) => {
    db.exec(`CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    db.exec(`INSERT INTO settings (key, data, updated_at)
      SELECT 'profile', data, updated_at FROM profile
      UNION ALL SELECT 'preferences', data, updated_at FROM preferences`);

    const old = db.prepare("SELECT data, updated_at FROM preferences").get() as
      | { data: string; updated_at: string }
      | undefined;
    if (old) {
      const p = JSON.parse(old.data);
      const search = {
        id: crypto.randomUUID(),
        name: "Software engineering",
        enabled: true,
        titles: p.targetRoles ?? [],
        seniority: p.seniority ?? ["entry", "mid"],
        employmentTypes: p.employmentTypes ?? ["full-time"],
        excludeKeywords: p.excludeKeywords ?? [],
        minMatch: p.autoSubmitThreshold ?? 70,
        mode: "review",
      };
      db.prepare("INSERT INTO settings (key, data, updated_at) VALUES ('searches', ?, ?)").run(
        JSON.stringify([search]),
        old.updated_at,
      );
    }
    db.exec("DROP TABLE profile; DROP TABLE preferences;");
  },
  // v3: phase 2. The company registry, normalised jobs, one match row per
  // (job, search), and the worker's task queue, which doubles as the run log.
  `
  CREATE TABLE companies (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    board TEXT NOT NULL,
    origin TEXT NOT NULL DEFAULT 'registry',
    careers_url TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    added_at TEXT NOT NULL,
    last_fetched_at TEXT,
    last_job_count INTEGER,
    last_error TEXT,
    UNIQUE (provider, board)
  );
  CREATE TABLE jobs (
    id INTEGER PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    provider_job_id TEXT NOT NULL,
    title TEXT NOT NULL,
    location TEXT NOT NULL,
    country_codes TEXT NOT NULL DEFAULT '[]',
    work_mode TEXT,
    employment_type TEXT,
    department TEXT,
    level TEXT,
    description TEXT,
    url TEXT NOT NULL,
    apply_url TEXT,
    salary TEXT,
    posted_at TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    closed_at TEXT,
    hash TEXT NOT NULL,
    UNIQUE (company_id, provider_job_id)
  );
  CREATE INDEX jobs_open ON jobs (closed_at, company_id);
  CREATE TABLE matches (
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    search_id TEXT NOT NULL,
    score INTEGER NOT NULL,
    rejected TEXT,
    seniority TEXT NOT NULL,
    matched TEXT NOT NULL,
    missing TEXT NOT NULL,
    notes TEXT NOT NULL,
    llm_score INTEGER,
    llm_reasons TEXT,
    input_hash TEXT NOT NULL,
    scored_at TEXT NOT NULL,
    PRIMARY KEY (job_id, search_id)
  );
  CREATE INDEX matches_search ON matches (search_id, rejected, score);
  CREATE TABLE tasks (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'queued',
    attempts INTEGER NOT NULL DEFAULT 0,
    run_after TEXT NOT NULL,
    started_at TEXT,
    finished_at TEXT,
    result TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX tasks_due ON tasks (status, run_after);
  `,
  // v4: phase 3. Claude's review of a (job, search) lives apart from the rule
  // score, so the daily rule re-score never throws a paid review away. An
  // application is one job Sortie chose (or you chose) to apply to, with its
  // tailored resume and truth report; events are its step history.
  `
  ALTER TABLE matches DROP COLUMN llm_score;
  ALTER TABLE matches DROP COLUMN llm_reasons;
  CREATE TABLE reviews (
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    search_id TEXT NOT NULL,
    score INTEGER NOT NULL,
    verdict TEXT NOT NULL,
    reasons TEXT NOT NULL,
    gaps TEXT NOT NULL,
    dealbreaker TEXT,
    model TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    reviewed_at TEXT NOT NULL,
    PRIMARY KEY (job_id, search_id)
  );
  CREATE TABLE applications (
    id INTEGER PRIMARY KEY,
    job_id INTEGER NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    search_id TEXT NOT NULL,
    origin TEXT NOT NULL,
    status TEXT NOT NULL,
    score INTEGER NOT NULL,
    mode TEXT NOT NULL,
    resume TEXT,
    truth TEXT,
    resume_file TEXT,
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX applications_status ON applications (status, created_at);
  CREATE TABLE application_events (
    id INTEGER PRIMARY KEY,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    at TEXT NOT NULL,
    kind TEXT NOT NULL,
    detail TEXT
  );
  CREATE INDEX application_events_app ON application_events (application_id, id);
  `,
  // v5: phase 4. The form step keeps what it planned for each question, what
  // it read back after filling, a screenshot, and when (and by whom) the
  // application went out.
  `
  ALTER TABLE applications ADD COLUMN apply_url TEXT;
  ALTER TABLE applications ADD COLUMN plan TEXT;
  ALTER TABLE applications ADD COLUMN fill TEXT;
  ALTER TABLE applications ADD COLUMN screenshot TEXT;
  ALTER TABLE applications ADD COLUMN submitted_at TEXT;
  ALTER TABLE applications ADD COLUMN submitted_by TEXT;
  `,
  // v6: applications go out with your own resume (D-058). A review says when
  // that resume, as written, undersells you for the job; only then is it tailored.
  `
  ALTER TABLE reviews ADD COLUMN resume_advice TEXT;
  `,
];

const userVersion = (db: DatabaseSync) =>
  (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;

function open(): DatabaseSync {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  // Several processes (build workers, the future background worker) can open
  // the file at once, so wait on locks instead of failing.
  const db = new DatabaseSync(path.join(DATA_DIR, "sortie.db"), { timeout: 10_000 });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

  // IMMEDIATE takes the write lock up front; re-read the version under it in
  // case another process migrated while we waited.
  while (userVersion(db) < MIGRATIONS.length) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const v = userVersion(db);
      if (v < MIGRATIONS.length) {
        const step = MIGRATIONS[v];
        if (typeof step === "string") db.exec(step);
        else step(db);
        db.exec(`PRAGMA user_version = ${v + 1}`);
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
  return db;
}

// Opened on first use, not at import, so builds never touch the database.
// Dev hot reload re-evaluates modules; keep one connection per process.
const globalForDb = globalThis as unknown as { sortieDb?: DatabaseSync };
export const getDb = () => (globalForDb.sortieDb ??= open());
