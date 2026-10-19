import "server-only";
import {
  type Company,
  enabledCompanies,
  jobsMissingDescription,
  matchHashes,
  openJobs,
  pruneMatches,
  recordFetch,
  saveBoard,
  saveDetail,
  saveMatches,
  sha1,
  syncRegistry,
} from "./jobs";
import { prepare, type PrepareResult } from "./autopilot";
import { isSoftwareRole, MATCH_RULES_VERSION, matchJob } from "./match";
import { registryEntries } from "./registry";
import type { Search } from "./schema";
import { SOURCES } from "./sources";
import { preferencesStore, profileStore, searchesStore } from "./store";

// Phase 2 pipeline: registry → fetch every enabled board → store and close →
// fill missing descriptions for plausible jobs → deterministic match per search.

const COMPANY_CONCURRENCY = 4;
const QUERY_LIMIT = 200; // per query on boards that support server-side search
const DETAILS_PER_COMPANY = 100; // detail calls per board per cycle; the rest wait for the next one

type Log = (line: string) => void;

// Big boards (Workday, SmartRecruiters) are searched server-side with each
// search's titles, or "software" when a search lets skills decide.
export function boardQueries(searches: Search[]) {
  const q = new Set<string>();
  for (const s of searches.filter((x) => x.enabled)) {
    if (!s.titles.length) q.add("software");
    for (const t of s.titles) if (t.trim()) q.add(t.trim().toLowerCase());
  }
  return q.size ? [...q] : ["software"];
}

const plausible = (title: string, searches: Search[]) =>
  isSoftwareRole(title) ||
  searches.some((s) => s.enabled && s.titles.some((t) => t.trim() && title.toLowerCase().includes(t.trim().toLowerCase())));

export async function fetchCompany(c: Company, searches: Search[]) {
  const source = SOURCES[c.provider];
  let jobs;
  let complete = true;
  if (source.detail) {
    const lists = [];
    for (const query of boardQueries(searches)) {
      const found = await source.list(c.board, { query, limit: QUERY_LIMIT });
      if (found.length >= QUERY_LIMIT) complete = false;
      lists.push(...found);
    }
    jobs = lists;
  } else jobs = await source.list(c.board);

  const stats = saveBoard(c.id, jobs, complete);

  let details = 0;
  let detailErrors = 0;
  if (source.detail) {
    for (const job of jobsMissingDescription(c.id).filter((j) => plausible(j.title, searches)).slice(0, DETAILS_PER_COMPANY)) {
      try {
        const d = await source.detail(c.board, {
          providerJobId: job.provider_job_id,
          title: job.title,
          location: job.location,
          countryCodes: job.country_codes,
          workMode: job.work_mode,
          employmentType: job.employment_type,
          department: job.department,
          level: job.level,
          description: null,
          url: job.url,
          applyUrl: job.apply_url,
          postedAt: job.posted_at,
          salary: job.salary,
        });
        saveDetail(job.id, d);
        details++;
      } catch {
        detailErrors++;
      }
    }
  }
  recordFetch(c.id, { count: stats.seen });
  return { ...stats, complete, details, detailErrors };
}

export type CycleResult = {
  companies: number;
  failed: { company: string; error: string }[];
  resting: string[];
  added: number;
  changed: number;
  closed: number;
  details: number;
  match: ReturnType<typeof matchAll>;
  prepare: PrepareResult;
  seconds: number;
};

// A board that rate-limited us is left alone for a while instead of being hit again
// every cycle; its stored jobs stay open until a real fetch says otherwise.
export const RATE_LIMIT_COOLDOWN_HOURS = 12;

export function coolingDown(c: Pick<Company, "last_error" | "last_fetched_at">, now = new Date()) {
  if (!c.last_error?.startsWith("HTTP 429") || !c.last_fetched_at) return false;
  return now.getTime() - Date.parse(c.last_fetched_at) < RATE_LIMIT_COOLDOWN_HOURS * 3_600_000;
}

export async function runCycle(log: Log = () => {}): Promise<CycleResult> {
  const started = Date.now();
  syncRegistry(registryEntries());
  const searches = searchesStore.get().value;
  const enabled = enabledCompanies();
  const companies = enabled.filter((c) => !coolingDown(c));
  const resting = enabled.filter((c) => coolingDown(c));
  log(`Fetching ${companies.length} boards…`);
  for (const c of resting) log(`  ${c.name}: skipped, rate-limited at ${c.last_fetched_at}; retrying after ${RATE_LIMIT_COOLDOWN_HOURS} h`);

  const totals = { added: 0, changed: 0, closed: 0, details: 0 };
  const failed: CycleResult["failed"] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: COMPANY_CONCURRENCY }, async () => {
      while (next < companies.length) {
        const c = companies[next++];
        try {
          const r = await fetchCompany(c, searches);
          totals.added += r.added;
          totals.changed += r.changed;
          totals.closed += r.closed;
          totals.details += r.details;
          log(
            `  ${c.name}: ${r.seen} open, +${r.added} new, ${r.closed} closed` +
              (r.details ? `, ${r.details} details` : "") +
              (r.detailErrors ? `, ${r.detailErrors} detail errors` : "") +
              (r.complete ? "" : " (capped, nothing closed)"),
          );
        } catch (err) {
          const error = (err as Error).message;
          recordFetch(c.id, { error });
          failed.push({ company: c.name, error });
          log(`  ${c.name}: FAILED ${error}`);
        }
      }
    }),
  );

  const match = matchAll();
  log(`Matched: ${match.scored} scored, ${match.skipped} unchanged, ${match.qualified} qualify across ${match.searches} searches`);
  const prepared = await prepare(log);
  return { companies: companies.length, failed, resting: resting.map((c) => c.name), ...totals, match, prepare: prepared, seconds: Math.round((Date.now() - started) / 1000) };
}

// Re-scores only what changed: the input hash covers the rules version, the job,
// the search, the profile's skills and roles, the preferences, and today's date (freshness).
export function matchAll(now = new Date()) {
  const profile = profileStore.get().value;
  const prefs = preferencesStore.get().value;
  const searches = searchesStore.get().value;
  pruneMatches(searches.map((s) => s.id));

  const jobs = openJobs();
  const day = now.toISOString().slice(0, 10);
  const base = sha1(MATCH_RULES_VERSION, profile.skills, profile.experience.map((e) => e.title), prefs, day);
  let scored = 0;
  let skipped = 0;
  let qualified = 0;
  for (const search of searches.filter((s) => s.enabled)) {
    const known = matchHashes(search.id);
    const key = sha1(base, { ...search, name: "", mode: "" });
    const rows = [];
    for (const job of jobs) {
      const inputHash = sha1(key, job.hash);
      if (known.get(job.id) === inputHash) {
        skipped++;
        continue;
      }
      const result = matchJob(
        {
          company: job.company,
          title: job.title,
          location: job.location,
          countryCodes: job.country_codes,
          workMode: job.work_mode,
          employmentType: job.employment_type,
          level: job.level,
          description: job.description,
          postedAt: job.posted_at,
          salary: job.salary,
        },
        search,
        profile,
        prefs,
        now,
      );
      if (!result.rejected && result.score >= search.minMatch) qualified++;
      rows.push({ jobId: job.id, inputHash, result });
    }
    saveMatches(search.id, rows);
    scored += rows.length;
  }
  return { searches: searches.filter((s) => s.enabled).length, jobs: jobs.length, scored, skipped, qualified };
}
