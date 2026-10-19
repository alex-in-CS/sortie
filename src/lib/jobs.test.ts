import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SourceJob } from "./sources/types";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "sortie-jobs-"));
  vi.stubEnv("SORTIE_DATA_DIR", dir);
  vi.resetModules();
});

afterEach(() => {
  const g = globalThis as { sortieDb?: DatabaseSync };
  g.sortieDb?.close();
  delete g.sortieDb;
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

const sj = (id: string, over: Partial<SourceJob> = {}): SourceJob => ({
  providerJobId: id,
  title: "Software Engineer",
  location: "Bengaluru, India",
  countryCodes: [],
  workMode: null,
  employmentType: null,
  department: null,
  level: null,
  description: "TypeScript and React.",
  url: `https://example.com/${id}`,
  applyUrl: null,
  postedAt: "2026-10-18T00:00:00.000Z",
  salary: null,
  ...over,
});

describe("jobs store", () => {
  it("syncs the registry without re-enabling companies", async () => {
    const jobs = await import("./jobs");
    jobs.syncRegistry([{ name: "Stripe", provider: "greenhouse", board: "stripe" }]);
    const [c] = jobs.listCompanies();
    jobs.setCompanyEnabled(c.id, false);
    jobs.syncRegistry([{ name: "Stripe Inc", provider: "greenhouse", board: "stripe", careersUrl: "https://stripe.com/jobs" }]);
    expect(jobs.listCompanies()).toMatchObject([{ name: "Stripe Inc", enabled: 0, careers_url: "https://stripe.com/jobs" }]);
    // React can only pass plain objects to client components; node:sqlite rows have a null prototype.
    expect(Object.getPrototypeOf(jobs.listCompanies()[0])).toBe(Object.prototype);
  });

  it("adds, updates, closes and reopens jobs", async () => {
    const jobs = await import("./jobs");
    jobs.syncRegistry([{ name: "Acme", provider: "greenhouse", board: "acme" }]);
    const [c] = jobs.listCompanies();

    expect(jobs.saveBoard(c.id, [sj("1"), sj("2"), sj("2")], true)).toMatchObject({ added: 2, closed: 0, seen: 2 });
    await new Promise((r) => setTimeout(r, 5));
    expect(jobs.saveBoard(c.id, [sj("1", { title: "Senior Software Engineer" })], true)).toMatchObject({
      added: 0,
      changed: 1,
      closed: 1,
    });
    expect(jobs.openJobs().map((j) => j.title)).toEqual(["Senior Software Engineer"]);

    // A partial fetch (capped board) never closes anything.
    await new Promise((r) => setTimeout(r, 5));
    expect(jobs.saveBoard(c.id, [sj("2")], false)).toMatchObject({ reopened: 1, closed: 0 });
    expect(jobs.openJobs()).toHaveLength(2);
  });

  it("keeps a fetched description and the first posted date when the list omits them", async () => {
    const jobs = await import("./jobs");
    jobs.syncRegistry([{ name: "Big", provider: "workday", board: "big.wd1/Ext" }]);
    const [c] = jobs.listCompanies();
    jobs.saveBoard(c.id, [sj("A", { description: null })], true);
    const [missing] = jobs.jobsMissingDescription(c.id);
    jobs.saveDetail(missing.id, { description: "Full text", countryCodes: ["IN"] });
    jobs.saveBoard(c.id, [sj("A", { description: null, postedAt: "2026-10-19T00:00:00.000Z" })], true);
    const job = jobs.getJob(missing.id)!;
    expect(job.description).toBe("Full text");
    expect(job.country_codes).toEqual(["IN"]);
    expect(job.posted_at).toBe("2026-10-18T00:00:00.000Z");
    expect(jobs.jobsMissingDescription(c.id)).toHaveLength(0);
  });

  it("queues one task per type and retries failures with backoff", async () => {
    const jobs = await import("./jobs");
    expect(jobs.enqueue("fetch").created).toBe(true);
    expect(jobs.enqueue("fetch").created).toBe(false);
    const t = jobs.claimTask()!;
    expect(t).toMatchObject({ type: "fetch", status: "running", attempts: 1 });
    expect(jobs.claimTask()).toBeUndefined();
    jobs.failTask(t, "boom");
    expect(jobs.lastTask("fetch")).toMatchObject({ status: "queued", last_error: "boom" });
    expect(jobs.claimTask()).toBeUndefined(); // backoff: run_after is in the future
  });

  it("logs one-off runs and blocks a parallel queued run of the same type", async () => {
    const jobs = await import("./jobs");
    const t = jobs.startTask("fetch", { once: true });
    expect(t).toMatchObject({ status: "running", attempts: 1 });
    expect(jobs.enqueue("fetch")).toEqual({ id: t.id, created: false });
    jobs.finishTask(t.id, { added: 1 });
    expect(jobs.lastTask("fetch", "done")).toMatchObject({ id: t.id, result: '{"added":1}' });
    // A queued task outranks a newer finished one, so the fetch button shows live work.
    const queued = jobs.enqueue("fetch");
    jobs.finishTask(jobs.startTask("other").id, {});
    jobs.finishTask(jobs.startTask("fetch", { once: true }).id, {});
    expect(jobs.lastTask("fetch")).toMatchObject({ id: queued.id, status: "queued" });
  });

  it("abandons a task left running by a dead process", async () => {
    const jobs = await import("./jobs");
    const { getDb } = await import("./db");
    const t = jobs.startTask("fetch", { once: true });
    getDb().prepare("UPDATE tasks SET started_at = '2026-01-01T00:00:00Z' WHERE id = ?").run(t.id);
    const done = jobs.startTask("fetch");
    jobs.finishTask(done.id, {});
    expect(jobs.lastTask("fetch")).toMatchObject({ id: done.id }); // the stale one isn't shown as live
    const next = jobs.enqueue("fetch");
    expect(next.created).toBe(true);
    expect(getDb().prepare("SELECT status FROM tasks WHERE id = ?").get(t.id)).toMatchObject({ status: "failed" });
  });
});

describe("coolingDown", () => {
  it("rests a rate-limited board for a while", async () => {
    const { coolingDown } = await import("./pipeline");
    const now = new Date("2026-10-19T12:00:00Z");
    expect(coolingDown({ last_error: "HTTP 429 from x", last_fetched_at: "2026-10-19T06:00:00Z" }, now)).toBe(true);
    expect(coolingDown({ last_error: "HTTP 429 from x", last_fetched_at: "2026-10-18T20:00:00Z" }, now)).toBe(false);
    expect(coolingDown({ last_error: "HTTP 500 from x", last_fetched_at: "2026-10-19T11:00:00Z" }, now)).toBe(false);
    expect(coolingDown({ last_error: null, last_fetched_at: "2026-10-19T11:00:00Z" }, now)).toBe(false);
  });
});

describe("matchAll", () => {
  it("scores open jobs per enabled search and skips unchanged ones", async () => {
    const store = await import("./store");
    const schema = await import("./schema");
    const jobs = await import("./jobs");
    const { matchAll } = await import("./pipeline");

    store.profileStore.save({
      ...schema.emptyProfile(),
      skills: [{ id: "1", name: "TypeScript", category: "language", level: "strong", years: null, source: "manual" }],
    });
    store.preferencesStore.save({ ...schema.defaultPreferences(), countries: ["India"] });
    const s = { ...schema.newSearch(), minMatch: 0 };
    store.searchesStore.save([s, { ...schema.newSearch("Paused"), enabled: false }]);

    jobs.syncRegistry([{ name: "Acme", provider: "greenhouse", board: "acme" }]);
    const [c] = jobs.listCompanies();
    jobs.saveBoard(c.id, [sj("1"), sj("2", { title: "Account Executive" }), sj("3", { location: "Berlin, Germany" })], true);

    const now = new Date("2026-10-19T00:00:00Z");
    expect(matchAll(now)).toMatchObject({ searches: 1, jobs: 3, scored: 3, skipped: 0, qualified: 1 });
    expect(matchAll(now)).toMatchObject({ scored: 0, skipped: 3 });

    const [top] = jobs.listMatches(s.id, "qualified", s.minMatch);
    expect(top).toMatchObject({ title: "Software Engineer", company: "Acme", matched: ["TypeScript"] });
    expect(jobs.matchSummary(s.id, s.minMatch)).toMatchObject({ scored: 3, qualified: 1, below: 0, rejected: 2 });
    expect(jobs.listMatches(s.id, "rejected", s.minMatch).map((m) => m.rejected).sort()).toEqual([
      "In Berlin, Germany, outside your countries",
      "Not a software role",
    ]);
  });
});
