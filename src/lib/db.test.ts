import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Each test gets its own data dir and a fresh module graph, since db.ts reads
// SORTIE_DATA_DIR at import and caches the connection on globalThis.
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "sortie-test-"));
  process.env.SORTIE_DATA_DIR = dir;
  vi.resetModules();
});

afterEach(() => {
  const g = globalThis as { sortieDb?: DatabaseSync };
  g.sortieDb?.close();
  delete g.sortieDb;
  delete process.env.SORTIE_DATA_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

const version = (db: DatabaseSync) => (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;

describe("database migrations", () => {
  it("creates a fresh database at the latest version with defaults", async () => {
    const { getDb } = await import("./db");
    const store = await import("./store");
    expect(version(getDb())).toBe(2);
    expect(store.searchesStore.get().updatedAt).toBeNull();
    expect(store.searchesStore.get().value).toHaveLength(1);
    expect(store.answersStore.get().value.salaryFallback).toBe("Negotiable");
  });

  it("moves v1 profile and preferences into settings and turns old role filters into a search", async () => {
    const v1 = new DatabaseSync(path.join(dir, "sortie.db"));
    v1.exec(`
      CREATE TABLE profile (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE preferences (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE documents (id TEXT PRIMARY KEY, kind TEXT NOT NULL, filename TEXT NOT NULL, path TEXT NOT NULL, mime TEXT NOT NULL, created_at TEXT NOT NULL);
      PRAGMA user_version = 1;
    `);
    const profile = {
      contact: { fullName: "Old", email: "", phone: "", location: "", links: [] },
      headline: "",
      summary: "",
      skills: [],
      experience: [],
      projects: [],
      education: [],
      certifications: [],
    };
    const oldPrefs = {
      targetRoles: ["Backend Engineer"],
      seniority: ["mid"],
      yearsOfExperience: 3,
      employmentTypes: ["full-time"],
      workModes: ["remote"],
      countries: ["India"],
      cities: [],
      willingToRelocate: false,
      authorizedCountries: ["India"],
      needsSponsorshipElsewhere: true,
      minSalary: null,
      noticePeriodDays: 30,
      excludeCompanies: ["Acme"],
      excludeKeywords: ["unpaid"],
      maxPerCompany: 2,
      dailyLimit: 10,
      autoSubmitThreshold: 85,
      discovery: false,
    };
    v1.prepare("INSERT INTO profile VALUES (1, ?, 't1')").run(JSON.stringify(profile));
    v1.prepare("INSERT INTO preferences VALUES (1, ?, 't2')").run(JSON.stringify(oldPrefs));
    v1.close();

    const { getDb } = await import("./db");
    const store = await import("./store");
    const db = getDb();
    expect(version(db)).toBe(2);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name IN ('profile','preferences')").all()).toEqual([]);

    expect(store.getProfile().value.contact.fullName).toBe("Old");
    const prefs = store.preferencesStore.get();
    expect(prefs.value).toMatchObject({ countries: ["India"], maxPerCompany: 2, excludeCompanies: ["Acme"] });
    expect(prefs.value).not.toHaveProperty("targetRoles");

    const searches = store.searchesStore.get();
    expect(searches.updatedAt).toBe("t2");
    expect(searches.value).toEqual([
      expect.objectContaining({
        titles: ["Backend Engineer"],
        seniority: ["mid"],
        excludeKeywords: ["unpaid"],
        minMatch: 85,
        mode: "review",
      }),
    ]);
  });
});
