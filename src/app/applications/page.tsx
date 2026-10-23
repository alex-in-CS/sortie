import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ApplicationActions } from "@/components/application-actions";
import { ApplicationQuestions } from "@/components/application-questions";
import { Empty, Loading, PageHeader, Section } from "@/components/ui";
import { aiAnswersAllowed, autoSubmitEnabled } from "@/lib/apply/gate";
import { unresolved } from "@/lib/apply/plan";
import { APPLY_PROVIDERS } from "@/lib/apply/types";
import { applicationCounts, hasCoverLetter, listApplications, type ApplicationView } from "@/lib/applications";
import { profileGaps } from "@/lib/autopilot";
import { formatDateTime } from "@/lib/format";
import { lastTask } from "@/lib/jobs";
import { AI, hasApiKey, KEY_NAME } from "@/lib/llm";
import type { ApplicationStatus } from "@/lib/schema";
import { preferencesStore, profileStore, searchesStore } from "@/lib/store";

const GROUPS: { status: ApplicationStatus[]; title: string; hint: string }[] = [
  {
    status: ["needs_you"],
    title: "Needs you",
    hint: "A question only you can answer, a form Sortie can't fill, or something that failed. Each says what it needs.",
  },
  {
    status: ["held", "submitting"],
    title: "Ready to submit",
    hint: "Filled and checked: every value was read back from the form. Open one in Chrome, look it over, and press Submit there. Sortie notices the confirmation page.",
  },
  {
    status: ["queued", "tailoring", "ready", "applying"],
    title: "Being prepared",
    hint: "Picked and waiting for the worker to get the documents ready and fill the form.",
  },
  { status: ["submitted"], title: "Submitted", hint: "Sent, by Sortie or by you." },
  { status: ["skipped"], title: "Skipped", hint: "You said no to these. They don't count toward your limits." },
];

export default function ApplicationsPage() {
  return (
    <>
      <PageHeader title="Applications">
        Jobs Sortie picked for you, or that you picked yourself. Each goes out with the resume you uploaded. When{" "}
        {AI}&apos;s review finds that resume undersells you for a job, Sortie tailors one from your profile, and it
        writes a cover letter only when a form requires one; both pass a truth check that removes anything your profile
        doesn&apos;t back up. Then Sortie fills the application form from your stored answers and holds it for you to
        submit.
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
    ? `Add ${KEY_NAME} to .env.local and restart the worker. Until then Sortie picks jobs by the rule score alone, sends your resume as uploaded and can't write cover letters.`
    : gaps.length
      ? `Add ${gaps.join(", ")} to your profile before Sortie can apply.`
      : null;

  return (
    <>
      <p className="mb-4 text-xs text-muted">
        Limits: {prefs.maxPerCompany} per company in 30 days, {prefs.dailyLimit} a day (
        <Link href="/preferences" className="underline">
          change
        </Link>
        ){last?.finished_at ? ` · last cycle ${formatDateTime(last.finished_at)}` : ""} · auto-submit{" "}
        {!autoSubmitEnabled()
          ? "off (you submit everything)"
          : aiAnswersAllowed()
            ? "on for searches in auto mode, Claude's answers included · every sent application is saved in data/applied"
            : "on for searches in auto mode"}
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
            {a.origin === "manual" ? "picked by you" : "picked by Sortie"} · {a.mode} mode · {a.status === "tailoring" ? "preparing documents now" : `updated ${formatDateTime(a.updated_at)}`}
          </p>
          {a.review && (
            <div className="mt-2 text-xs">
              <p>
                <span className={`font-medium ${VERDICT_TONE[a.review.verdict]}`}>
                  {AI}: {a.review.score}, {a.review.verdict}
                </span>
                {a.review.reasons.length > 0 && <span className="text-muted"> · {a.review.reasons.join(" ")}</span>}
              </p>
              {a.review.gaps.length > 0 && <p className="mt-0.5 text-faint">Gaps: {a.review.gaps.join(" · ")}</p>}
            </div>
          )}
          {a.status === "needs_you" && (a.error || lastWord(a)) && <p className="mt-1.5 text-xs text-danger">{a.error ?? lastWord(a)}</p>}
          {a.status === "held" && <p className="mt-1.5 text-xs text-muted">{lastWord(a)}</p>}
          {a.status === "submitting" && <p className="mt-1.5 text-xs text-accent">Opening in Chrome on this computer. Submit it there; the worker must be running.</p>}
          {a.status === "submitted" && a.submitted_at && (
            <p className="mt-1.5 text-xs text-muted">
              Submitted {formatDateTime(a.submitted_at)} by {a.submitted_by === "sortie" ? "Sortie" : "you"}
            </p>
          )}
          {a.resume_file && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <a href={`/api/applications/${a.id}/files/resume`} target="_blank" rel="noreferrer" className="font-medium text-accent underline-offset-2 hover:underline">
                {a.resume ? "Tailored resume (PDF)" : "Your resume, as uploaded"}
              </a>
              {hasCoverLetter(a) && (
                <a href={`/api/applications/${a.id}/files/cover-letter`} target="_blank" rel="noreferrer" className="font-medium text-accent underline-offset-2 hover:underline">
                  Cover letter PDF
                </a>
              )}
              {a.truth && (
                <span className="text-faint">
                  {issues.length
                    ? `Truth check fixed ${issues.length} item${issues.length === 1 ? "" : "s"}`
                    : "Truth check passed with nothing to fix"}
                </span>
              )}
            </div>
          )}
          {a.resume && a.review?.resumeAdvice && (
            <p className="mt-1 text-xs text-faint">Tailored because your resume undersold this: {a.review.resumeAdvice}</p>
          )}
          {(a.apply_url || a.screenshot) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
              {a.apply_url && (
                <a href={a.apply_url} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
                  Application form
                </a>
              )}
              {a.screenshot && (
                <a href={`/api/applications/${a.id}/files/form`} target="_blank" rel="noreferrer" className="text-accent underline-offset-2 hover:underline">
                  Screenshot of the filled form
                </a>
              )}
            </div>
          )}
          {a.status === "needs_you" && a.plan && unresolved(a.plan).length > 0 && (
            <ApplicationQuestions id={a.id} questions={unresolved(a.plan)} />
          )}
          {a.plan && <PlanDetails app={a} />}
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
      <ApplicationActions id={a.id} status={a.status} hasResume={!!a.resume_file} hasPlan={!!a.plan} canFill={(APPLY_PROVIDERS as readonly string[]).includes(a.provider)} />
    </li>
  );
}

// The latest step note, e.g. why it's held rather than sent.
function lastWord(a: ApplicationView) {
  return a.last_detail ?? null;
}

const BY = { rule: "", bank: "answer bank", claude: AI } as const;

function PlanDetails({ app: a }: { app: ApplicationView }) {
  const fill = new Map((a.fill ?? []).map((f) => [f.key, f]));
  const filled = (a.plan ?? []).filter((p) => p.state === "ok");
  const claude = filled.filter((p) => p.by === "claude").length;
  return (
    <details className="mt-1.5 text-xs" open={claude > 0 && a.status === "held"}>
      <summary className="cursor-pointer text-muted">
        What Sortie enters ({filled.length} field{filled.length === 1 ? "" : "s"}
        {claude ? `, ${claude} answered by ${AI}: check them` : ""})
      </summary>
      <ul className="mt-1.5 space-y-1">
        {(a.plan ?? [])
          .filter((p) => p.state !== "skip")
          .map((p) => {
            const f = fill.get(p.key);
            return (
              <li key={p.key} className="grid gap-x-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <span className="truncate text-muted" title={p.label}>
                  {p.label}
                  {p.required ? " *" : ""}
                </span>
                <span className="min-w-0">
                  {p.state === "ok" ? (
                    <span className={p.by === "claude" ? "font-medium text-warn" : "text-ink"}>
                      {p.kind === "file" ? (p.value[0] === "cover" ? "Cover letter PDF" : "Resume") : p.value.join(", ")}
                    </span>
                  ) : (
                    <span className="text-danger">{p.state === "decide" ? "Your decision" : "No answer"}</span>
                  )}
                  <span className="text-faint">
                    {" "}
                    · {p.by && BY[p.by] ? `${BY[p.by]}: ` : ""}
                    {p.source}
                    {f && !f.ok ? ` · didn't fill${f.note ? ` (${f.note})` : ""}` : f?.note ? ` · ${f.note}` : ""}
                  </span>
                </span>
              </li>
            );
          })}
      </ul>
    </details>
  );
}
