import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AI usage bookkeeping (D-059): the price table and the totals the overview shows.

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "sortie-usage-"));
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

const u = (input: number, output: number, cacheRead = 0, cacheWrite = 0) => ({ input, output, cacheRead, cacheWrite });

describe("AI usage", () => {
  it("prices calls at list rates, Haiku's long-prompt card included", async () => {
    const { costOf } = await import("./usage");
    expect(costOf("claude-opus-5-5", u(1_000_000, 1_000_000))).toBeCloseTo(24);
    expect(costOf("claude-sonnet-5-5", u(4000, 500, 2000, 1000))).toBeCloseTo((4000 * 2 + 500 * 10 + 2000 * 0.2 + 1000 * 2.5) / 1e6);
    expect(costOf("claude-haiku-5-5", u(4000, 500))).toBeCloseTo((4000 * 0.1 + 500 * 0.5) / 1e6);
    expect(costOf("claude-haiku-5-5", u(150_000, 1000))).toBeCloseTo((150_000 * 0.5 + 1000 * 2.5) / 1e6);
    expect(costOf("gemini-4-argon", u(1000, 1000))).toBeNull();
  });

  it("totals spend by task since a date, counting unpriced calls apart", async () => {
    const { recordUsage, spendSince } = await import("./usage");
    recordUsage("review this job", "claude-haiku-5-5", u(4000, 500));
    recordUsage("review this job", "claude-haiku-5-5", u(4000, 500));
    recordUsage("tailor the resume", "claude-opus-5-5", u(6000, 5000));
    recordUsage("read this file", "gemini-4-argon", u(5000, 3000));

    const s = spendSince(new Date(Date.now() - 60_000));
    expect(s.calls).toBe(4);
    expect(s.unpriced).toBe(1);
    expect(s.cost).toBeCloseTo(2 * 0.00065 + 0.124);
    expect(s.byTask.map((t) => [t.task, t.calls])).toEqual([
      ["tailor the resume", 1],
      ["review this job", 2],
      ["read this file", 1],
    ]);
    expect(spendSince(new Date(Date.now() + 60_000)).calls).toBe(0);
  });
});
