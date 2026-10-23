import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Browser, Page } from "playwright-core";
import {
  type Application,
  coverLetterFile,
  type FormOutcome,
  getApplication,
  logEvent,
  saveCoverLetter,
  saveFormOutcome,
} from "../applications";
import { archiveApplication } from "../archive";
import { DATA_DIR } from "../db";
import { getJob } from "../jobs";
import { AI, describeError, hasApiKey, isAuthError } from "../llm";
import { htmlToPdf, launchChrome } from "../pdf";
import { coverLetterHtml } from "../resume-html";
import { answersStore, preferencesStore, profileStore, searchesStore } from "../store";
import { coverLetterAndCheck } from "../tailor";
import { challengeVisible, type Files, fillForm, submit, waitForConfirmation } from "./fill";
import { fetchGreenhouseForm, greenhouseApplyUrl, leverFields } from "./forms";
import { aiAnswersAllowed, autoSubmitBlocker, autoSubmitEnabled } from "./gate";
import { groundAnswers } from "./ground";
import { type PlanContext, planForm, requiresCoverLetter, unresolved } from "./plan";
import type { ApplyProvider, FormField, PlannedField } from "./types";

// The form step (D-056). For each application whose documents are ready:
// read the form, plan an answer for every question from stored data (D-055),
// fill it in a headless Chrome without attaching files, read every value back
// and take a screenshot. Then one of:
//   needs_you   a required question has no answer, or something didn't fill
//   held        all filled and checked; waiting for you to submit
//   submitted   only when every auto-submit condition holds (autoSubmitBlocker)
// Submitting yourself ("open"): Sortie fills the form, files included, in a
// visible Chrome window and watches for the confirmation page.

const SHOT_DIR = "applications";
const LOAD_MS = 45_000;
const HANDOFF_MS = Number(process.env.SORTIE_HANDOFF_MINUTES || 20) * 60_000;

type JobInfo = NonNullable<ReturnType<typeof getJob>>;

export type ApplyTarget = { provider: ApplyProvider; url: string; board: string; jobId: string } | { provider: null; url: string };

// Where the form is, and whether Sortie can fill it.
export function applyTarget(job: Pick<JobInfo, "provider" | "board" | "provider_job_id" | "url" | "apply_url">): ApplyTarget {
  if (job.provider === "greenhouse")
    return { provider: "greenhouse", url: greenhouseApplyUrl(job.board, job.provider_job_id), board: job.board, jobId: job.provider_job_id };
  if (job.provider === "lever") {
    const base = (job.apply_url ?? job.url).replace(/\/+$/, "");
    return { provider: "lever", url: /\/apply$/.test(base) ? base : `${base}/apply`, board: job.board, jobId: job.provider_job_id };
  }
  return { provider: null, url: job.apply_url ?? job.url };
}

function documents(app: Application): Files {
  if (!app.resume_file) return { resume: null, cover: null };
  const resume = path.join(DATA_DIR, app.resume_file);
  const cover = path.join(DATA_DIR, coverLetterFile(app.resume_file));
  return { resume: fs.existsSync(resume) ? resume : null, cover: fs.existsSync(cover) ? cover : null };
}

function context(job: JobInfo, files: Files): PlanContext {
  return {
    profile: profileStore.get().value,
    answers: answersStore.get().value,
    prefs: preferencesStore.get().value,
    job: { company: job.company, title: job.title, location: job.location, countryCodes: job.country_codes.filter((c) => c !== "*") },
    documents: { resume: !!files.resume, coverLetter: !!files.cover },
  };
}

async function openForm(page: Page, target: Extract<ApplyTarget, { provider: ApplyProvider }>): Promise<FormField[]> {
  if (target.provider === "greenhouse") {
    const fields = await fetchGreenhouseForm(target.board, target.jobId);
    await page.goto(target.url, { waitUntil: "networkidle", timeout: LOAD_MS });
    return fields;
  }
  const res = await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: LOAD_MS });
  if (res && res.status() >= 400) throw new Error(`The form page answered ${res.status()}; the posting may have closed.`);
  await page.locator(".application-question, .application-additional").first().waitFor({ timeout: 15_000 });
  return leverFields(page);
}

// Claude's answers from an earlier pass are kept, so a refill doesn't pay
// twice or change an answer you already saw.
function carryOver(plan: PlannedField[], earlier: PlannedField[] | null) {
  if (!earlier) return plan;
  const prior = new Map(earlier.filter((p) => p.state === "ok" && p.by === "claude").map((p) => [p.key, p]));
  return plan.map((p) => (p.state === "missing" && prior.has(p.key) ? { ...p, ...prior.get(p.key)!, required: p.required, options: p.options } : p));
}

async function planWithGrounding(fields: FormField[], ctx: PlanContext, app: Application, job: JobInfo, log: (l: string) => void) {
  let plan = carryOver(planForm(fields, ctx), app.plan);
  if (hasApiKey() && plan.some((p) => p.state === "missing" && p.kind !== "file")) {
    try {
      plan = await groundAnswers(plan, { profile: ctx.profile, prefs: ctx.prefs, answers: ctx.answers, job });
    } catch (err) {
      if (isAuthError(err)) throw err;
      log(`  ${AI} couldn't answer the open questions: ${describeError(err)}`);
    }
  }
  return plan;
}

// The form won't go without a cover letter and there isn't one yet: Opus
// writes it and the truth check clears it (D-058). If that can't happen, the
// field stays missing and the application waits for you.
async function writeCoverLetter(app: Application, job: JobInfo, log: (l: string) => void) {
  if (!hasApiKey() || !app.resume_file) return;
  try {
    const profile = profileStore.get().value;
    const { letter, truth } = await coverLetterAndCheck(profile, preferencesStore.get().value, job);
    if (!letter.trim()) return;
    fs.writeFileSync(path.join(DATA_DIR, coverLetterFile(app.resume_file)), await htmlToPdf(coverLetterHtml(profile, letter, job.company)));
    saveCoverLetter(app.id, truth);
    log(`  ${job.company} – ${job.title}: wrote the cover letter the form requires`);
  } catch (err) {
    if (isAuthError(err)) throw err;
    log(`  ${job.company} – ${job.title}: couldn't write the cover letter: ${describeError(err)}`);
  }
}

// form.png: filled, before sending; sent.png: the page after submit. Both are
// kept, and copied into the application's record once it's sent (archive.ts).
const shotPath = (id: number, name: "form" | "sent") => `${SHOT_DIR}/${id}/${name}.png`;

async function screenshot(page: Page, id: number, name: "form" | "sent" = "form") {
  const rel = shotPath(id, name);
  fs.mkdirSync(path.dirname(path.join(DATA_DIR, rel)), { recursive: true });
  await page.screenshot({ path: path.join(DATA_DIR, rel), fullPage: true });
  return rel;
}

// Writing the record must never undo a sent application.
function record(id: number, log: (l: string) => void) {
  try {
    const dir = archiveApplication(id);
    if (dir) logEvent(id, "recorded", `Saved what was sent in ${dir}`);
  } catch (err) {
    log(`  couldn't save the record of application ${id}: ${(err as Error).message}`);
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// One application through the form step. Never throws for a problem with this
// one form (that becomes needs_you); rethrows a rejected API key, which would
// fail every other application the same way.
export async function applyOne(app: Application, log: (line: string) => void = () => {}): Promise<FormOutcome["status"]> {
  const done = (o: FormOutcome) => {
    saveFormOutcome(app.id, o);
    return o.status;
  };
  const job = getJob(app.job_id);
  if (!job || job.closed_at) return done({ status: "skipped", detail: "The posting closed before Sortie could apply" });
  const target = applyTarget(job);
  const where = `${job.company} – ${job.title}`;
  if (!target.provider)
    return done({
      status: "needs_you",
      applyUrl: target.url,
      detail: `Sortie can't fill ${job.provider} forms yet`,
      error: `Sortie can't fill ${job.provider} forms yet. Apply with the link and your tailored PDFs, then mark it as submitted.`,
    });

  let files = documents(app);
  if (!files.resume) return done({ status: "needs_you", applyUrl: target.url, detail: "The resume file is missing", error: "The resume file is missing. Use Try again to make it again." });

  let browser: Browser | null = null;
  try {
    browser = await launchChrome(true);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const fields = await openForm(page, target);
    if (!fields.length) throw new Error("Sortie couldn't find any questions on the form.");
    if (!files.cover && fields.some(requiresCoverLetter)) {
      await writeCoverLetter(app, job, log);
      files = documents(app);
    }
    const ctx = context(job, files);
    const plan = await planWithGrounding(fields, ctx, app, job, log);
    const open = unresolved(plan);
    if (open.length) {
      log(`  ${where}: ${plural(open.length, "question")} need you`);
      return done({ status: "needs_you", applyUrl: target.url, plan, fill: null, detail: `${plural(open.length, "question")} need your answer` });
    }

    const fill = await fillForm(page, target.provider, plan, files, { upload: false });
    const shot = await screenshot(page, app.id);
    const failedRequired = fill.filter((r) => !r.ok && plan.find((p) => p.key === r.key)?.required);
    if (failedRequired.length) {
      log(`  ${where}: ${plural(failedRequired.length, "field")} didn't fill`);
      return done({
        status: "needs_you",
        applyUrl: target.url,
        plan,
        fill,
        screenshot: shot,
        detail: `Couldn't fill: ${failedRequired.map((r) => r.label).join("; ").slice(0, 300)}`,
        error: "Some required fields didn't fill. Submit it yourself in Chrome, or fill again.",
      });
    }

    const search = searchesStore.get().value.find((s) => s.id === app.search_id);
    const blocker = autoSubmitBlocker({
      mode: app.origin === "manual" ? "review" : (search?.mode ?? "review"),
      enabled: autoSubmitEnabled(),
      allowAI: aiAnswersAllowed(),
      plan,
      fill,
      challenge: await challengeVisible(page),
    });
    if (blocker) {
      log(`  ${where}: filled and checked, waiting for you`);
      return done({ status: "held", applyUrl: target.url, plan, fill, screenshot: shot, detail: blocker });
    }

    // Auto-submit: attach the files now, then send.
    const uploads = await fillForm(page, target.provider, plan.filter((p) => p.kind === "file"), files);
    const all = [...fill.filter((r) => !uploads.some((u) => u.key === r.key)), ...uploads];
    if (uploads.some((u) => !u.ok))
      return done({ status: "held", applyUrl: target.url, plan, fill: all, screenshot: shot, detail: "A file didn't attach: submit it yourself" });
    logEvent(app.id, "submitting", "Sortie is sending it (auto mode)");
    const outcome = await submit(page);
    const after = await screenshot(page, app.id, "sent");
    if (outcome === "submitted") {
      log(`  ${where}: submitted`);
      done({ status: "submitted", applyUrl: target.url, plan, fill: all, screenshot: after, detail: "Submitted by Sortie; the confirmation page showed" });
      record(app.id, log);
      return "submitted";
    }
    if (outcome === "challenge")
      return done({ status: "held", applyUrl: target.url, plan, fill: all, screenshot: after, detail: "A CAPTCHA appeared when sending: submit it yourself" });
    // "unconfirmed" may have gone through: never send it again on our own.
    return done({
      status: "needs_you",
      applyUrl: target.url,
      plan,
      fill: all,
      screenshot: after,
      detail: outcome === "no-button" ? "Couldn't find the submit button" : "Clicked submit but saw no confirmation",
      error:
        outcome === "no-button"
          ? "Sortie couldn't find the submit button. Submit it yourself."
          : "Sortie clicked submit but never saw a confirmation. Check your email and the company's site before applying again.",
    });
  } catch (err) {
    if (isAuthError(err)) {
      saveFormOutcome(app.id, { status: "needs_you", detail: `The ${AI} API key was refused`, error: describeError(err) });
      throw err;
    }
    const msg = (err as Error).message.split("\n")[0];
    log(`  ${where}: the form step failed: ${msg}`);
    return done({ status: "needs_you", applyUrl: target.url, detail: `Form step failed: ${msg}`, error: `Sortie couldn't work through the form: ${msg}` });
  } finally {
    await browser?.close().catch(() => {});
  }
}

// "Open in Chrome": fill everything, files included, in a window you can see,
// then wait for you to submit. The worker watches for the confirmation page.
export async function handoff(app: Application, log: (line: string) => void = () => {}): Promise<"submitted" | "held" | "needs_you"> {
  const job = getJob(app.job_id);
  const target = job ? applyTarget(job) : null;
  if (!job || !target?.provider) {
    saveFormOutcome(app.id, { status: "needs_you", detail: "Sortie can't open this form", error: "Sortie can't fill this form. Apply with the link, then mark it as submitted." });
    return "needs_you";
  }
  const files = documents(app);
  let browser: Browser | null = null;
  try {
    browser = await launchChrome(false);
    const page = await browser.newPage({ viewport: null });
    const fields = await openForm(page, target);
    const plan = carryOver(planForm(fields, context(job, files)), app.plan);
    const fill = await fillForm(page, target.provider, plan, files);
    const bad = fill.filter((r) => !r.ok).length;
    logEvent(app.id, "opened", `Open in Chrome${bad ? `; ${plural(bad, "field")} need you there` : ""}. Waiting for you to submit.`);
    log(`  ${job.company} – ${job.title}: open in Chrome, waiting for you to submit`);
    await page.bringToFront().catch(() => {});
    const sent = await waitForConfirmation(page, HANDOFF_MS);
    // You may have skipped it from the app while the window was open.
    const now = getApplication(app.id);
    if (sent) {
      saveFormOutcome(app.id, { status: "submitted", plan, fill, detail: "Submitted by you in Chrome; the confirmation page showed" });
      await screenshot(page, app.id, "sent").catch(() => {});
      record(app.id, log);
      return "submitted";
    }
    if (now?.status !== "submitting") return "held";
    saveFormOutcome(app.id, { status: "held", plan, fill, detail: "The Chrome window closed or timed out before a confirmation showed" });
    return "held";
  } catch (err) {
    const msg = (err as Error).message.split("\n")[0];
    saveFormOutcome(app.id, { status: "held", detail: `Couldn't open it in Chrome: ${msg}`, error: `Couldn't open it in Chrome: ${msg}` });
    return "held";
  } finally {
    await browser?.close().catch(() => {});
  }
}
