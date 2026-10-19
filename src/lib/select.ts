import type { Preferences, Search } from "./schema";

// Picks which jobs to apply to this cycle (D-050). Pure, so the caps are easy to
// test: the caller passes in what's already been used.

export type Candidate = {
  jobId: number;
  searchId: string;
  companyId: number;
  company: string;
  title: string;
  ruleScore: number;
  reviewScore: number | null;
  verdict: "strong" | "good" | "stretch" | "poor" | null;
  dealbreaker: string | null;
  firstSeenAt: string;
};

export type Selection = { jobId: number; searchId: string; score: number; mode: Search["mode"]; reason: string };

export type Usage = { perCompany: Map<number, number>; today: number };

export function selectJobs(
  candidates: Candidate[],
  searches: Search[],
  prefs: Pick<Preferences, "maxPerCompany" | "dailyLimit">,
  usage: Usage,
  // With an API key, a job must be reviewed by Claude before it's picked.
  requireReview: boolean,
): { picks: Selection[]; waiting: number; capped: { company: number; daily: number } } {
  const bySearch = new Map(searches.filter((s) => s.enabled).map((s) => [s.id, s]));
  const scored = candidates
    .map((c) => ({ c, search: bySearch.get(c.searchId), score: c.reviewScore ?? c.ruleScore }))
    .filter(
      (x): x is { c: Candidate; search: Search; score: number } =>
        !!x.search && x.score >= x.search.minMatch && !x.c.dealbreaker && x.c.verdict !== "poor",
    );
  const waiting = requireReview ? scored.filter((x) => x.c.reviewScore === null).length : 0;
  const ready = (requireReview ? scored.filter((x) => x.c.reviewScore !== null) : scored).sort(
    (a, b) => b.score - a.score || b.c.firstSeenAt.localeCompare(a.c.firstSeenAt),
  );

  const perCompany = new Map(usage.perCompany);
  let today = usage.today;
  const taken = new Set<number>();
  const picks: Selection[] = [];
  const capped = { company: 0, daily: 0 };
  for (const { c, search, score } of ready) {
    if (taken.has(c.jobId)) continue; // the same job via another search: the best one already won
    if (today >= prefs.dailyLimit) {
      capped.daily++;
      continue;
    }
    if ((perCompany.get(c.companyId) ?? 0) >= prefs.maxPerCompany) {
      capped.company++;
      continue;
    }
    taken.add(c.jobId);
    perCompany.set(c.companyId, (perCompany.get(c.companyId) ?? 0) + 1);
    today++;
    picks.push({
      jobId: c.jobId,
      searchId: c.searchId,
      score,
      mode: search.mode,
      reason: `${search.name}: ${c.reviewScore !== null ? `the AI review scored ${score}` : `rules scored ${score}`} (bar ${search.minMatch})`,
    });
  }
  return { picks, waiting, capped };
}
