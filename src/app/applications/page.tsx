import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ApplicationActions } from "@/components/application-actions";
import { Empty, Loading, PageHeader, Section } from "@/components/ui";
import { applicationCounts, listApplications, type ApplicationView } from "@/lib/applications";
import { profileGaps } from "@/lib/autopilot";
import { formatDateTime } from "@/lib/format";
import { lastTask } from "@/lib/jobs";
import { hasApiKey } from "@/lib/llm";
import type { ApplicationStatus } from "@/lib/schema";
import { preferencesStore, profileStore, searchesStore } from "@/lib/store";

const GROUPS: { status: ApplicationStatus[]; title: string; hint: string }[] = [
  { status: ["needs_you"], title: "Needs you", hint: "Tailoring failed three times. The error is shown; try again or skip." },
  {
    status: ["ready"],
    title: "Ready to apply",
    hint: "Tailored and fact-checked. Applying arrives in the next phase; until then, open the PDFs and apply by hand if you like.",
  },
  { status: ["queued", "tailoring"], title: "Being prepared", hint: "Picked and waiting for the worker to tailor them." },
  { status: ["skipped"], title: "Skipped", hint: "You said no to these. They don't count toward your limits." },
];

export default function ApplicationsPage() {
  return (
    <>
      <PageHeader title="Applications">
        Jobs Sortie picked for you, or that you picked yourself. Each gets a resume and cover letter tailored from your
        profile, then a truth check that removes anything your profile doesn&apos;t back up.
      </PageHeader>
      <Suspense fallback={<Loading />}>
        <ApplicationsData />
      </Suspense>
    </>
  );
}

async function ApplicationsData() {
  await connection();
  const apps = listApplications();
  const counts = applicationCounts();
  const prefs = preferencesStore.get().value;
  const searches = new Map(searchesStore.get().value.map((s) => [s.id, s.name]));
  const gaps = profileGaps(profileStore.get().value);
  const last = lastTask("fetch", "done");
  const blocked = !hasApiKey()
    ? "Add ANTHROPIC_API_KEY to .env.local and restart the worker. Until then Sortie picks jobs by the rule score alone and can't tailor."
    : gaps.length
      ? `Add ${gaps.join(", ")} to your profile. Tailoring waits until it can say something true about you.`
      : null;

  return (
    <>
      <p className="mb-4 text-xs text-muted">
        Limits: {prefs.maxPerCompany} per company in 30 days, {prefs.dailyLimit} a day (
        <Link href="/preferences" className="underline">
          change
        </Link>
        ){last?.finished_at ? ` · last cycle ${formatDateTime(last.finished_at)}` : ""}
      </p>
      {blocked && <p className="mb-5 rounded-md border border-warn bg-warn-soft px-4 py-3 text-sm">{blocked}</p>}
      {!apps.length ? (
        <Empty>
          Nothing picked yet. After the next cycle, jobs that clear a search&apos;s bar land here, or press Apply on any
          job in <Link href="/jobs" className="underline">Jobs</Link>.
        </Empty>
      ) : (
        GROUPS.map((g) => {
          const list = apps.filter((a) => g.status.includes(a.status));
          if (!list.length) return null;
          const n = g.status.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
          return (
            <Section key={g.title} title={`${g.title} (${n})`} hint={g.hint}>
              <ul className="space-y-3">
                {list.map((a) => (
                  <ApplicationCard key={a.id} app={a} searchName={searches.get(a.search_id)} />
                ))}
              </ul>
            </Section>
          );
        })
      )}
    </>
  );
}

const VERDICT_TONE = { strong: "text-accent", good: "text-ink", stretch: "text-warn", poor: "text-danger" } as const;

function ApplicationCard({ app: a, searchName }: { app: ApplicationView; searchName?: string }) {
  const issues = a.truth?.issues ?? [];
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line bg-panel px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <span className="w-9 shrink-0 pt-0.5 text-right font-mono text-lg font-semibold tabular-nums">{a.score}</span>
        <div className="min-w-0 flex-1">
          <a href={a.url} target="_blank" rel="noreferrer" className="font-medium underline-offset-2 hover:underline">
            {a.title}
          </a>
          <p className="mt-0.5 text-xs text-muted">
            {a.company} · {a.location || "Location not given"} · {searchName ?? "deleted search"} ·{" "}
            {a.origin === "manual" ? "picked by you" : "picked by Sortie"} · {a.mode} mode · {a.status === "tailoring" ? "tailoring now" : `updated ${formatDateTime(a.updated_at)}`}
          </p>
          {a.review && (
            <div className="mt-2 text-xs">
              <p>
                <span className={`font-medium ${VERDICT_TONE[a.review.verdict]}`}>
                  Claude: {a.review.score}, {a.review.verdict}
                </span>
                {a.review.reasons.length > 0 && <span className="text-muted"> · {a.review.reasons.join(" ")}</span>}
              </p>
              {a.review.gaps.length > 0 && <p className="mt-0.5 text-faint">Gaps: {a.review.gaps.join(" · ")}</p>}
            </div>
          )}
          {a.error && a.status === "needs_you" && <p className="mt-1.5 text-xs text-danger">{a.error}</p>}
          {a.resume_file && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <a href={`/api/applications/${a.id}/files/resume`} target="_blank" rel="noreferrer" className="font-medium text-accent underline-offset-2 hover:underline">
                Resume PDF
              </a>
              {a.resume?.coverLetter && (
                <a href={`/api/applications/${a.id}/files/cover-letter`} target="_blank" rel="noreferrer" className="font-medium text-accent underline-offset-2 hover:underline">
                  Cover letter PDF
                </a>
              )}
              <span className="text-faint">
                {issues.length
                  ? `Truth check fixed ${issues.length} item${issues.length === 1 ? "" : "s"}`
                  : "Truth check passed with nothing to fix"}
              </span>
            </div>
          )}
          {issues.length > 0 && (
            <details className="mt-1.5 text-xs">
              <summary className="cursor-pointer text-muted">What the truth check changed</summary>
              <ul className="mt-1.5 space-y-1">
                {issues.map((i, n) => (
                  <li key={n} className="text-muted">
                    <span className="font-medium text-ink">{i.action === "reverted" ? "Reverted" : "Removed"}</span> in {i.where}: “{i.text}”{" "}
                    <span className="text-faint">({i.reason})</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
      <ApplicationActions id={a.id} status={a.status} />
    </li>
  );
}
