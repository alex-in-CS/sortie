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

const MIGRATIONS: string[] = [
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
        db.exec(MIGRATIONS[v]);
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
