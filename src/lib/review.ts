import "server-only";
import * as z from "zod";
import { type Review, reviewCandidates, saveReview } from "./applications";
import { sha1 } from "./jobs";
import { BULK_MODEL, describeError, isAuthError, structured } from "./llm";
import { constraintsText, profileText } from "./profile-text";
import { preferencesStore, profileStore, searchesStore } from "./store";

// Claude's second opinion on the jobs the rules liked (D-032, D-050). The rules
// are fast and explainable but can't tell a must-have from a nice-to-have or
// read "3+ years of production Go" in context; Sonnet can.

// Bump when the prompt or schema changes, so stored reviews are redone.
export const REVIEW_PROMPT_VERSION = 1;
// Jobs this far under a search's bar still get a review: Claude may lift them.
export const REVIEW_MARGIN = 10;
const PER_CYCLE = Number(process.env.SORTIE_REVIEWS_PER_CYCLE) || 40;
const CONCURRENCY = 3;
const MAX_DESCRIPTION = 12_000;

const ReviewSchema = z.object({
  score: z.number(),
  verdict: z.enum(["strong", "good", "stretch", "poor"]),
  reasons: z.array(z.string()),
  gaps: z.array(z.string()),
  dealbreaker: z.string().nullable(),
});

const SYSTEM = `You assess how well a candidate fits a job posting, for an assistant that applies to jobs on the candidate's behalf. Your score decides whether it applies, so be calibrated and honest: a wasted application costs the candidate credibility with that employer.

Judge only from the candidate profile and constraints you are given. Never assume skills or experience that aren't stated.

Score 0-100:
- 85-100 "strong": meets the must-have requirements, with directly relevant experience.
- 70-84 "good": meets most must-haves; gaps are learnable or nice-to-haves.
- 50-69 "stretch": real gaps in must-haves, or seniority is a notch off.
- 0-49 "poor": wrong field, wrong level, or several missing must-haves.

reasons: up to 4 short, concrete sentences on the fit, naming specific requirements from the posting.
gaps: up to 5 must-have requirements the profile doesn't show, in the posting's words. Leave out nice-to-haves.
dealbreaker: a hard requirement the candidate clearly can't meet given their profile and constraints (for example citizenship or security clearance they don't have, a degree the posting says is mandatory, work authorization the posting won't sponsor, far more years than they have). Otherwise null.`;

export type ReviewInputs = { profile: string; constraints: string };

export function reviewInputs(): ReviewInputs {
  return { profile: profileText(profileStore.get().value), constraints: constraintsText(preferencesStore.get().value) };
}

export function reviewHash(inputs: ReviewInputs, search: { titles: string[]; seniority: string[] }, jobHash: string) {
  return sha1(REVIEW_PROMPT_VERSION, BULK_MODEL, inputs, search.titles, search.seniority, jobHash);
}

export async function reviewJob(
  inputs: ReviewInputs,
  job: { title: string; company: string; location: string; work_mode: string | null; description: string },
): Promise<Review> {
  const out = await structured({
    model: BULK_MODEL,
    system: SYSTEM,
    context: `<candidate>\n${inputs.profile}\n</candidate>\n\n<constraints>\n${inputs.constraints}\n</constraints>`,
    content: [
      {
        type: "text",
        text:
          `<job>\nTitle: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}` +
          `${job.work_mode ? ` (${job.work_mode})` : ""}\n\n${job.description.slice(0, MAX_DESCRIPTION)}\n</job>\n\n` +
          "Assess the candidate's fit for this job.",
      },
    ],
    schema: ReviewSchema,
    effort: "low",
    maxTokens: 4000,
    task: "review this job",
  });
  return {
    score: Math.max(0, Math.min(100, Math.round(out.score))),
    verdict: out.verdict,
    reasons: out.reasons.slice(0, 4),
    gaps: out.gaps.slice(0, 5),
    dealbreaker: out.dealbreaker?.trim() || null,
  };
}

export type ReviewResult = { reviewed: number; failed: number; errors: string[] };

// Reviews the best unreviewed candidates of every enabled search, at most
// PER_CYCLE per run, best first. A job whose inputs haven't changed keeps its review.
export async function reviewAll(log: (line: string) => void = () => {}, limit = PER_CYCLE): Promise<ReviewResult> {
  const inputs = reviewInputs();
  const queue: { candidate: ReturnType<typeof reviewCandidates>[number]; hash: string }[] = [];
  for (const search of searchesStore.get().value.filter((s) => s.enabled)) {
    for (const c of reviewCandidates(search.id, search.minMatch - REVIEW_MARGIN, 500)) {
      const hash = reviewHash(inputs, search, c.job_hash);
      if (c.review_hash !== hash) queue.push({ candidate: c, hash });
    }
  }
  queue.sort((a, b) => b.candidate.rule_score - a.candidate.rule_score);
  const work = queue.slice(0, limit);
  const result: ReviewResult = { reviewed: 0, failed: 0, errors: [] };
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < work.length) {
        const { candidate: c, hash } = work[next++];
        try {
          const review = await reviewJob(inputs, c);
          saveReview(c.job_id, c.search_id, review, BULK_MODEL, hash);
          result.reviewed++;
        } catch (err) {
          result.failed++;
          const msg = describeError(err);
          if (!result.errors.includes(msg)) result.errors.push(msg);
          log(`  Review failed for ${c.company} – ${c.title}: ${msg}`);
          // A bad key fails every call the same way; stop instead of burning through the list.
          if (isAuthError(err)) next = work.length;
        }
      }
    }),
  );
  if (queue.length > limit) log(`  ${queue.length - limit} more jobs wait for the next cycle's reviews.`);
  return result;
}
