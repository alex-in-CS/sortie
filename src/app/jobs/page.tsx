import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ApplyButton } from "@/components/apply-button";
import { Empty, Loading, PageHeader } from "@/components/ui";
import { applicationsForJobs, reviewsFor, type StoredReview } from "@/lib/applications";
import { formatCount, formatDate } from "@/lib/format";
import { jobCounts, listMatches, matchSummary, type MatchRow, type MatchView } from "@/lib/jobs";
import { matchAll } from "@/lib/pipeline";
import type { ApplicationStatus } from "@/lib/schema";
import { searchesStore } from "@/lib/store";

const VIEWS: { key: MatchView; label: string }[] = [
  { key: "qualified", label: "Qualifying" },
  { key: "below", label: "Below your bar" },
  { key: "rejected", label: "Filtered out" },
];

export default function JobsPage(props: PageProps<"/jobs">) {
  return (
    <>
      <PageHeader title="Jobs">
        Open roles from your companies, scored against your skills for each search. The big number is the quick rule
        score; jobs near or above your bar also get a closer read by Claude, shown under the title.
      </PageHeader>
      <Suspense fallback={<Loading />}>
        <JobsData searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function JobsData({ searchParams }: Pick<PageProps<"/jobs">, "searchParams">) {
  await connection();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  // Matching is cheap and skips anything unchanged, so the page is never stale
  // after an edit to the profile, a search or the preferences.
  matchAll();

  const counts = jobCounts();
  const searches = searchesStore.get().value.filter((s) => s.enabled);
  if (!counts.total)
    return (
      <Empty>
        No jobs yet. Open <Link href="/companies" className="underline">Companies</Link> and press Fetch now (with{" "}
        <code className="font-mono">npm run worker</code> running), or run <code className="font-mono">npm run fetch</code>.
      </Empty>
    );
  if (!searches.length)
    return (
      <Empty>
        No search is switched on. Turn one on in <Link href="/searches" className="underline">Searches</Link>.
      </Empty>
    );

  const search = searches.find((s) => s.id === one(params.search)) ?? searches[0];
  const view = VIEWS.find((v) => v.key === one(params.view))?.key ?? "qualified";
  const summary = matchSummary(search.id, search.minMatch);
  const rows = listMatches(search.id, view, search.minMatch);
  const ids = rows.map((r) => r.job_id);
  const reviews = reviewsFor(search.id, ids);
  const applied = applicationsForJobs(ids);
  const href = (s: string, v: MatchView) => `/jobs?search=${encodeURIComponent(s)}&view=${v}`;

  return (
    <>
      <p className="mb-4 text-xs text-muted">
        {formatCount(counts.open)} open jobs from your companies
        {counts.without_description ? ` · ${formatCount(counts.without_description)} still waiting for their full description` : ""}
      </p>

      {searches.length > 1 && (
        <nav className="mb-3 flex flex-wrap gap-1" aria-label="Searches">
          {searches.map((s) => (
            <Link
              key={s.id}
              href={href(s.id, view)}
              aria-current={s.id === search.id ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm ${s.id === search.id ? "bg-sunken font-medium" : "text-muted hover:bg-sunken"}`}
            >
              {s.name}
            </Link>
          ))}
        </nav>
      )}

      <nav className="mb-5 flex flex-wrap gap-1 border-b border-line" aria-label="View">
        {VIEWS.map((v) => {
          const n = summary[v.key] ?? 0;
          const active = v.key === view;
          return (
            <Link
              key={v.key}
              href={href(search.id, v.key)}
              aria-current={active ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${active ? "border-accent font-medium" : "border-transparent text-muted hover:text-ink"}`}
            >
              {v.label} <span className="ml-1 font-mono text-xs text-faint">{formatCount(n)}</span>
            </Link>
          );
        })}
        <span className="ml-auto self-center pb-1 text-xs text-faint">bar: {search.minMatch}</span>
      </nav>

      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((r) => (
            <JobRow
              key={r.job_id}
              row={r}
              review={reviews.get(r.job_id) ?? null}
              application={applied.get(r.job_id)?.status ?? null}
            />
          ))}
        </ul>
      ) : (
        <Empty>
          {view === "qualified"
            ? "Nothing clears this search's bar yet. Check “Below your bar”, add skills to your profile, or lower the selectivity."
            : "Nothing here."}
        </Empty>
      )}
      {rows.length === 200 && <p className="mt-3 text-xs text-faint">Showing the first 200.</p>}
    </>
  );
}

const VERDICT_TONE = { strong: "text-accent", good: "text-ink", stretch: "text-warn", poor: "text-danger" } as const;

function JobRow({
  row: r,
  review,
  application,
}: {
  row: MatchRow;
  review: StoredReview | null;
  application: ApplicationStatus | null;
}) {
  const tone = r.score >= 80 ? "text-accent" : r.score >= 60 ? "text-ink" : "text-muted";
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line bg-panel px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span className={`w-9 shrink-0 pt-0.5 text-right font-mono text-lg font-semibold tabular-nums ${r.rejected ? "text-faint" : tone}`}>
          {r.rejected ? "–" : r.score}
        </span>
        <div className="min-w-0 flex-1">
          <a href={r.url} target="_blank" rel="noreferrer" className="font-medium underline-offset-2 hover:underline">
            {r.title}
          </a>
          <p className="mt-0.5 text-xs text-muted">
            {r.company} · {r.location || "Location not given"}
            {r.work_mode ? ` · ${r.work_mode}` : ""} · {r.seniority}
            {r.posted_at ? ` · posted ${formatDate(r.posted_at)}` : ""}
          </p>
          {r.rejected && <p className="mt-1.5 text-xs text-danger">{r.rejected}</p>}
          {review && !r.rejected && (
            <p className="mt-1.5 text-xs">
              <span className={`font-medium ${VERDICT_TONE[review.verdict]}`}>
                Claude: {review.score}, {review.verdict}
              </span>
              {review.dealbreaker ? (
                <span className="text-danger"> · {review.dealbreaker}</span>
              ) : (
                review.reasons[0] && <span className="text-muted"> · {review.reasons[0]}</span>
              )}
              {review.gaps.length > 0 && <span className="text-faint"> · gaps: {review.gaps.slice(0, 3).join(", ")}</span>}
            </p>
          )}
          {(r.matched.length > 0 || r.missing.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {r.matched.map((s) => (
                <span key={s} className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[11px] text-ink">
                  {s}
                </span>
              ))}
              {r.missing.slice(0, 8).map((s) => (
                <span key={s} className="rounded border border-dashed border-line px-1.5 py-0.5 font-mono text-[11px] text-faint" title="Mentioned in the posting, not in your profile">
                  {s}
                </span>
              ))}
            </div>
          )}
          {r.notes.length > 0 && <p className="mt-1.5 text-xs text-faint">{r.notes.join(" · ")}</p>}
        </div>
      </div>
      {!r.rejected && <ApplyButton jobId={r.job_id} searchId={r.search_id} existing={application} />}
    </li>
  );
}
