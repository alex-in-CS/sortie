import "server-only";
import type * as z from "zod";
import { getDb } from "./db";
import {
  Answers,
  Preferences,
  Profile,
  Searches,
  defaultAnswers,
  defaultPreferences,
  emptyProfile,
  newSearch,
} from "./schema";

type Row = { data: string; updated_at: string };

// Single-document settings, stored as validated JSON under a key.
function setting<S extends z.ZodType>(key: string, schema: S, fallback: () => z.infer<S>) {
  return {
    get(): { value: z.infer<S>; updatedAt: string | null } {
      const row = getDb().prepare("SELECT data, updated_at FROM settings WHERE key = ?").get(key) as Row | undefined;
      if (!row) return { value: fallback(), updatedAt: null };
      return { value: schema.parse(JSON.parse(row.data)), updatedAt: row.updated_at };
    },
    save(value: z.infer<S>): string {
      const now = new Date().toISOString();
      getDb()
        .prepare(
          `INSERT INTO settings (key, data, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
        )
        .run(key, JSON.stringify(schema.parse(value)), now);
      return now;
    },
  };
}

export const profileStore = setting("profile", Profile, emptyProfile);
export const preferencesStore = setting("preferences", Preferences, defaultPreferences);
export const searchesStore = setting("searches", Searches, () => [newSearch()]);
export const answersStore = setting("answers", Answers, defaultAnswers);

export const getProfile = profileStore.get;
export const saveProfile = profileStore.save;

export type StoredDocument = {
  id: string;
  kind: string;
  filename: string;
  path: string;
  mime: string;
  created_at: string;
};

export function addDocument(doc: Omit<StoredDocument, "created_at">) {
  getDb()
    .prepare("INSERT INTO documents (id, kind, filename, path, mime, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(doc.id, doc.kind, doc.filename, doc.path, doc.mime, new Date().toISOString());
}

export function latestDocument(kind: string) {
  return getDb()
    .prepare("SELECT * FROM documents WHERE kind = ? ORDER BY created_at DESC LIMIT 1")
    .get(kind) as StoredDocument | undefined;
}
