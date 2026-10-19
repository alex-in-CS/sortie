import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/ui";
import { MODEL, hasApiKey } from "@/lib/llm";
import { getPreferences, getProfile, latestDocument } from "@/lib/store";

type Step = { done: boolean; title: string; detail: string; href?: string; cta?: string };

const ROADMAP = [
  ["Jobs", "Pull openings from ~250 companies' career sites daily, plus discovery of new ones, and score each against your skills."],
  ["Tailoring", "A resume and cover letter per job, built only from your profile, exported as PDF."],
  ["Applying", "Auto-submit simple forms above your match threshold; prefill Workday-style portals for a one-click submit."],
  ["Inbox", "Read Gmail (read-only), match replies to applications, sort rejections, next rounds and interview invites."],
  ["Telegram", "Pings only when something needs you, a daily digest, and approve-from-phone."],
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
                <span className="mr-2 font-mono text-xs text-faint">0{i + 2}</span>
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
  const { updatedAt: prefsSaved } = getPreferences();
  const resume = latestDocument("resume");

  const steps: Step[] = [
    {
      done: hasApiKey(),
      title: "Anthropic API key",
      detail: hasApiKey()
        ? `Set. Using ${MODEL}.`
        : "Add ANTHROPIC_API_KEY to .env.local and restart the dev server.",
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
      done: Boolean(prefsSaved),
      title: "Preferences",
      detail: prefsSaved ? "Saved." : "Pick locations, work authorization and limits.",
      href: "/preferences",
      cta: prefsSaved ? "Edit" : "Set up",
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
