import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/ui";
import { applicationCounts } from "@/lib/applications";
import { jobCounts, lastTask, listCompanies } from "@/lib/jobs";
import { AI, BULK_MODEL, KEY_NAME, MODEL, hasApiKey } from "@/lib/llm";
import { formatCount, formatDateTime } from "@/lib/format";
import { answersStore, getProfile, latestDocument, preferencesStore, searchesStore } from "@/lib/store";

type Step = { done: boolean; title: string; detail: string; href?: string; cta?: string };

const ROADMAP = [
  ["Inbox", "Read Gmail (read-only), match replies to applications and move them on the board: rejection, next round, interview."],
  ["Telegram", "Pings only when something needs you, a daily recap, and approve-from-phone."],
  ["Interview prep", "When an invite lands: a prep pack for that company and role, plus a mock interview."],
];

export default function Overview() {
  return (
    <>
      <PageHeader title="Overview">
        Sortie finds jobs your skills qualify you for, tailors a resume for each, applies, and watches your inbox
        for replies. Set it up once, then it runs on its own.
      </PageHeader>
      <Suspense fallback={<Loading />}>
        <Setup />
      </Suspense>
      <section className="mt-10">
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-faint">Next phases</h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-2">
          {ROADMAP.map(([title, text], i) => (
            <li key={title} className="rounded-lg border border-dashed border-line px-4 py-3">
              <p className="text-sm font-medium">
                <span className="mr-2 font-mono text-xs text-faint">0{i + 5}</span>
                {title}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

async function Setup() {
  await connection();
  const { value: profile } = getProfile();
  const { updatedAt: prefsSaved } = preferencesStore.get();
  const { value: searches, updatedAt: searchesSaved } = searchesStore.get();
  const { value: answers, updatedAt: answersSaved } = answersStore.get();
  const running = searchesSaved ? searches.filter((s) => s.enabled) : [];
  const resume = latestDocument("resume");
  const fetched = lastTask("fetch", "done");
  const jobs = jobCounts();
  const boards = listCompanies().filter((c) => c.enabled).length;
  const apps = applicationCounts();
  const ready = (apps.held ?? 0) + (apps.submitting ?? 0);
  const preparing = (apps.queued ?? 0) + (apps.tailoring ?? 0) + (apps.ready ?? 0) + (apps.applying ?? 0);
  const submitted = apps.submitted ?? 0;

  const steps: Step[] = [
    {
      done: hasApiKey(),
      title: `${AI} API key`,
      detail: hasApiKey()
        ? `Set. ${MODEL} tailors and checks; ${BULK_MODEL} reviews jobs.`
        : `Add ${KEY_NAME} to .env.local (or GEMINI_API_KEY / ANTHROPIC_API_KEY for the other) and restart the dev server.`,
    },
    {
      done: Boolean(resume),
      title: "Resume",
      detail: resume ? `${resume.filename}, read into your profile.` : "Upload it and Sortie fills in your profile.",
      href: "/profile",
      cta: resume ? "Update" : "Upload",
    },
    {
      done: profile.skills.length >= 5,
      title: "Skills",
      detail: profile.skills.length
        ? `${profile.skills.length} skills listed. Add anything the resume left out.`
        : "List everything you can do. This is what jobs get matched on.",
      href: "/profile",
      cta: "Edit",
    },
    {
      done: Boolean(profile.contact.email && profile.contact.phone),
      title: "Contact",
      detail:
        profile.contact.email && profile.contact.phone
          ? `${profile.contact.email} · ${profile.contact.phone}`
          : "Email and phone for application forms.",
      href: "/profile",
      cta: "Edit",
    },
    {
      done: running.length > 0,
      title: "Searches",
      detail: running.length
        ? `${running.length} running: ${running.map((s) => s.name).join(", ")}.`
        : "Save at least one search so Sortie knows what to look for.",
      href: "/searches",
      cta: running.length ? "Edit" : "Set up",
    },
    {
      done: Boolean(answersSaved),
      title: "Screening answers",
      detail: answersSaved
        ? `Saved, with ${answers.custom.length} in the answer bank.`
        : "Salary, notice and the questions forms always ask. Answer once.",
      href: "/answers",
      cta: answersSaved ? "Edit" : "Set up",
    },
    {
      done: Boolean(prefsSaved),
      title: "Preferences",
      detail: prefsSaved ? "Saved." : "Pick locations, work authorization and limits.",
      href: "/preferences",
      cta: prefsSaved ? "Edit" : "Set up",
    },
    {
      done: Boolean(fetched),
      title: "Job feeds",
      detail: fetched?.finished_at
        ? `${formatCount(jobs.open)} open jobs from ${boards} companies. Last fetched ${formatDateTime(fetched.finished_at)}.`
        : "Run npm run worker (or npm run fetch) to pull jobs from the company list.",
      href: fetched ? "/jobs" : "/companies",
      cta: fetched ? "See jobs" : "Companies",
    },
    {
      done: ready + submitted > 0,
      title: "Applications",
      detail:
        ready || preparing || submitted || apps.needs_you
          ? `${ready} ready to submit${preparing ? `, ${preparing} being prepared` : ""}${apps.needs_you ? `, ${apps.needs_you} need you` : ""}${submitted ? `, ${submitted} submitted` : ""}.`
          : "After a cycle, jobs that clear your bar get a tailored, fact-checked resume and cover letter, and their application form filled from your answers.",
      href: "/applications",
      cta: "Open",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section className="rounded-xl border border-line bg-panel">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold">Setup</h2>
          <span className="font-mono text-xs text-muted">
            {doneCount}/{steps.length}
          </span>
        </div>
        <ol className="divide-y divide-line">
          {steps.map((s) => (
            <li key={s.title} className="flex items-center gap-4 px-5 py-3.5">
              <span
                aria-label={s.done ? "Done" : "To do"}
                className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                  s.done ? "bg-ok-soft text-ok" : "border border-line text-faint"
                }`}
              >
                {s.done ? "✓" : ""}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{s.title}</p>
                <p className="truncate text-xs text-muted">{s.detail}</p>
              </div>
              {s.href && (
                <Link href={s.href} className="shrink-0 text-xs font-medium text-accent hover:underline">
                  {s.cta}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </section>
  );
}
