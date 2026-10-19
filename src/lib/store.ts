import "server-only";
import { getDb } from "./db";
import {
  Preferences,
  Profile,
  defaultPreferences,
  emptyProfile,
} from "./schema";

type Row = { data: string; updated_at: string };

function readSingleton<T>(table: "profile" | "preferences", parse: (v: unknown) => T, fallback: () => T) {
  const row = getDb().prepare(`SELECT data, updated_at FROM ${table} WHERE id = 1`).get() as Row | undefined;
  if (!row) return { value: fallback(), updatedAt: null as string | null };
  return { value: parse(JSON.parse(row.data)), updatedAt: row.updated_at };
}

function writeSingleton(table: "profile" | "preferences", value: unknown) {
  const now = new Date().toISOString();
  getDb().prepare(
    `INSERT INTO ${table} (id, data, updated_at) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(JSON.stringify(value), now);
  return now;
}

export const getProfile = () => readSingleton("profile", (v) => Profile.parse(v), emptyProfile);
export const saveProfile = (p: Profile) => writeSingleton("profile", Profile.parse(p));

export const getPreferences = () =>
  readSingleton("preferences", (v) => Preferences.parse(v), defaultPreferences);
export const savePreferences = (p: Preferences) => writeSingleton("preferences", Preferences.parse(p));

export type StoredDocument = {
  id: string;
  kind: string;
  filename: string;
  path: string;
  mime: string;
  created_at: string;
};

export function addDocument(doc: Omit<StoredDocument, "created_at">) {
  getDb().prepare(
    "INSERT INTO documents (id, kind, filename, path, mime, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(doc.id, doc.kind, doc.filename, doc.path, doc.mime, new Date().toISOString());
}

export function latestDocument(kind: string) {
  return getDb()
    .prepare("SELECT * FROM documents WHERE kind = ? ORDER BY created_at DESC LIMIT 1")
    .get(kind) as StoredDocument | undefined;
}
