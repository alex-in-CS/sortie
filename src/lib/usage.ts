import "server-only";
import { getDb } from "./db";

// What every AI call used, and roughly what it cost (R-08, D-059). Costs are
// estimates at list price; models not in the table are counted but not priced.

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };

// US dollars per million tokens. Cache writes are the 5-minute rate (1.25x input).
type Rate = { input: number; output: number; cacheRead: number; cacheWrite: number };
const PRICES: Record<string, Rate> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};
// Haiku 5.5 has a second rate card for prompts over 100K tokens.
const HAIKU_LONG: Rate = { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 };

export function costOf(model: string, u: Usage): number | null {
  let rate = PRICES[model];
  if (!rate) return null;
  if (model === "claude-haiku-5-5" && u.input + u.cacheRead + u.cacheWrite > 100_000) rate = HAIKU_LONG;
  return (u.input * rate.input + u.output * rate.output + u.cacheRead * rate.cacheRead + u.cacheWrite * rate.cacheWrite) / 1e6;
}

// Never lets bookkeeping break the call it describes.
export function recordUsage(task: string, model: string, u: Usage) {
  try {
    getDb()
      .prepare(
        `INSERT INTO llm_usage (at, task, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(new Date().toISOString(), task, model, u.input, u.output, u.cacheRead, u.cacheWrite, costOf(model, u));
  } catch (err) {
    console.error("couldn't record AI usage", err);
  }
}

export type Spend = { calls: number; cost: number; unpriced: number; byTask: { task: string; calls: number; cost: number }[] };

export function spendSince(since: Date): Spend {
  const rows = getDb()
    .prepare(
      `SELECT task, COUNT(*) AS calls, COALESCE(SUM(cost_usd), 0) AS cost, SUM(cost_usd IS NULL) AS unpriced
       FROM llm_usage WHERE at >= ? GROUP BY task ORDER BY cost DESC`,
    )
    .all(since.toISOString()) as { task: string; calls: number; cost: number; unpriced: number }[];
  return {
    calls: rows.reduce((n, r) => n + r.calls, 0),
    cost: rows.reduce((n, r) => n + r.cost, 0),
    unpriced: rows.reduce((n, r) => n + r.unpriced, 0),
    byTask: rows.map(({ task, calls, cost }) => ({ task, calls, cost })),
  };
}

// Since local midnight, and over the last 30 days.
export function spendSummary(now = new Date()) {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return { today: spendSince(midnight), month: spendSince(new Date(now.getTime() - 30 * 86_400_000)) };
}
