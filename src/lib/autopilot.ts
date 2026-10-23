import "server-only";
import fs from "node:fs";
import path from "node:path";
import {
  type Application,
  capUsage,
  claimForApplying,
  claimForTailoring,
  createApplication,
  failTailoring,
  pruneReviews,
  reviewsFor,
  saveAsIs,
  saveTailored,
  selectionCandidates,
  setStatus,
} from "./applications";
import { applyOne } from "./apply";
import { DATA_DIR } from "./db";
import { getJob } from "./jobs";
import { AI, describeError, hasApiKey, isAuthError } from "./llm";
import { htmlToPdf } from "./pdf";
import { resumeHtml } from "./resume-html";
import { reviewAll, type ReviewResult } from "./review";
import type { Profile, TailoredResume } from "./schema";
import { selectJobs } from "./select";
import { latestDocument, preferencesStore, profileStore, searchesStore } from "./store";
import { tailorAndCheck } from "./tailor";

// Phases 3 and 4 of every cycle, after fetching and matching: Claude reviews
// the best candidates, Sortie picks jobs within the caps, each pick gets its
// documents, and then the form step fills and checks its application (D-050,
// D-056). The documents are the resume you uploaded, unless the job's review
// says it undersells you there; then Opus tailors one and the truth check
// clears it (D-051, D-058). Cover letters come later, only for forms that
// require one (apply/index.ts).

const TAILOR_PER_CYCLE = Number(process.env.SORTIE_TAILOR_PER_CYCLE) || 10;
const APPLY_PER_CYCLE = Number(process.env.SORTIE_APPLY_PER_CYCLE) || 10;

export const RESUME_DIR = path.join(DATA_DIR, "resumes");

// What tailoring needs before it can say anything true about you.
export function profileGaps(p: Profile) {
  const gaps: string[] = [];
  if (!p.contact.fullName.trim()) gaps.push("your name");
  if (!p.contact.email.trim()) gaps.push("an email address");
  if (!p.experience.length && !p.projects.length) gaps.push("at least one role or project");
  if (!p.skills.length) gaps.push("skills");
  return gaps;
}

const fileSlug = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-") || "Candidate";

// The profile as a resume, word for word: for when nothing was uploaded.
const asWritten = (p: Profile): TailoredResume => ({
  headline: p.headline,
  summary: p.summary,
  skills: p.skills.map((s) => s.name),
  experience: p.experience.map((e) => ({ id: e.id, bullets: e.bullets })),
  projects: p.projects.map((x) => ({ id: x.id, bullets: x.bullets })),
  coverLetter: "",
});

// One application's documents. Returns "tailored", "as-is" or false (failed).
export async function prepareDocuments(app: Application, log: (line: string) => void = () => {}) {
  const job = getJob(app.job_id);
  if (!job || job.closed_at) {
    setStatus(app.id, "skipped", "The posting closed before its documents were ready");
    return false;
  }
  const profile = profileStore.get().value;
  const prefs = preferencesStore.get().value;
  const advice = reviewsFor(app.search_id, [app.job_id]).get(app.job_id)?.resumeAdvice ?? null;
  const upload = latestDocument("resume");
  const dir = path.join(RESUME_DIR, String(app.id));
  const base = fileSlug(profile.contact.fullName);
  try {
    // Start clean: a redo mustn't leave an earlier pass's resume or cover letter behind.
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    if (advice && hasApiKey()) {
      const { resume, truth } = await tailorAndCheck(profile, prefs, job, advice);
      const resumeFile = `resumes/${app.id}/${base}-Resume.pdf`;
      fs.writeFileSync(path.join(DATA_DIR, resumeFile), await htmlToPdf(resumeHtml(profile, resume)));
      saveTailored(app.id, resume, truth, resumeFile);
      log(`  Tailored for ${job.company} – ${job.title}${truth.issues.length ? ` (truth check fixed ${truth.issues.length})` : ""}`);
      return "tailored";
    }
    let resumeFile: string;
    if (upload) {
      resumeFile = `resumes/${app.id}/${base}-Resume${path.extname(upload.path).toLowerCase()}`;
      fs.copyFileSync(upload.path, path.join(DATA_DIR, resumeFile));
    } else {
      resumeFile = `resumes/${app.id}/${base}-Resume.pdf`;
      fs.writeFileSync(path.join(DATA_DIR, resumeFile), await htmlToPdf(resumeHtml(profile, asWritten(profile))));
    }
    saveAsIs(app.id, resumeFile);
    return "as-is";
  } catch (err) {
    const msg = describeError(err);
    failTailoring(app, msg);
    log(`  Tailoring failed for ${job.company} – ${job.title}: ${msg}`);
    if (isAuthError(err)) throw err;
    return false;
  }
}

export type PrepareResult = {
  reviews: ReviewResult | null;
  selected: number;
  waitingForReview: number;
  capped: { company: number; daily: number };
  tailored: number;
  asIs: number;
  tailorFailed: number;
  forms: { held: number; submitted: number; needsYou: number };
  blocked: string | null;
};

export async function prepare(log: (line: string) => void = () => {}): Promise<PrepareResult> {
  const searches = searchesStore.get().value;
  const prefs = preferencesStore.get().value;
  const profile = profileStore.get().value;
  pruneReviews(searches.map((s) => s.id));
  const llm = hasApiKey();
  const gaps = profileGaps(profile);

  const reviews = llm && !gaps.length ? await reviewAll(log) : null;
  if (reviews) log(`Reviewed ${reviews.reviewed} jobs with ${AI}${reviews.failed ? `, ${reviews.failed} failed` : ""}.`);

  const enabled = searches.filter((s) => s.enabled);
  const candidates = selectionCandidates(enabled.map((s) => s.id)).map((c) => ({
    jobId: c.job_id,
    searchId: c.search_id,
    companyId: c.company_id,
    company: c.company,
    title: c.title,
    ruleScore: c.rule_score,
    reviewScore: c.review_score,
    verdict: c.verdict,
    dealbreaker: c.dealbreaker,
    firstSeenAt: c.first_seen_at,
  }));
  const { picks, waiting, capped } = selectJobs(candidates, searches, prefs, capUsage(), llm);
  let selected = 0;
  for (const p of picks) if (createApplication({ ...p, origin: "auto" }).created) selected++;
  log(
    `Selected ${selected} job${selected === 1 ? "" : "s"}` +
      (waiting ? `, ${waiting} waiting for a review` : "") +
      (capped.daily ? `, ${capped.daily} over today's limit` : "") +
      (capped.company ? `, ${capped.company} over a company's limit` : "") +
      ".",
  );

  // Your own resume needs no API key; only tailoring does, and only reviewed
  // jobs (which need the key) can ask for it.
  let blocked: string | null = null;
  if (gaps.length) blocked = `Add ${gaps.join(", ")} to your profile before Sortie can apply.`;
  let tailored = 0;
  let asIs = 0;
  let tailorFailed = 0;
  if (!blocked) {
    for (let i = 0; i < TAILOR_PER_CYCLE; i++) {
      const app = claimForTailoring();
      if (!app) break;
      try {
        const done = await prepareDocuments(app, log);
        if (done === "tailored") tailored++;
        else if (done === "as-is") asIs++;
        else tailorFailed++;
      } catch (err) {
        // The key itself was refused: every other job would fail the same way.
        tailorFailed++;
        blocked = describeError(err);
        break;
      }
    }
    if (tailored + asIs) log(`Documents: ${tailored} tailored, ${asIs} with your resume as uploaded.`);
  } else log(`Documents paused: ${blocked}`);

  // The form step needs no API key (Claude only answers questions nothing
  // stored covers), so it runs even while tailoring is paused.
  const forms = { held: 0, submitted: 0, needsYou: 0 };
  for (let i = 0; i < APPLY_PER_CYCLE; i++) {
    const app = claimForApplying();
    if (!app) break;
    try {
      const status = await applyOne(app, log);
      if (status === "held") forms.held++;
      else if (status === "submitted") forms.submitted++;
      else if (status === "needs_you") forms.needsYou++;
    } catch (err) {
      forms.needsYou++;
      blocked = describeError(err);
      break;
    }
  }
  if (forms.held + forms.submitted + forms.needsYou)
    log(`Forms: ${forms.held} ready for you to submit, ${forms.submitted} submitted, ${forms.needsYou} need you.`);
  return { reviews, selected, waitingForReview: waiting, capped, tailored, asIs, tailorFailed, forms, blocked };
}
