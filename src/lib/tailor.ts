import "server-only";
import * as z from "zod";
import { MODEL, structured } from "./llm";
import { constraintsText, profileText } from "./profile-text";
import { type Preferences, type Profile, TailoredResume, type TruthIssue, type TruthReport } from "./schema";
import { applyRejections, claims, ruleCheck } from "./truth";

// Tailoring (FR-18) and the truth check (FR-19). Opus writes the wording; the
// rules and then a second Opus pass make sure every statement traces back to
// the profile (D-051).

const MAX_DESCRIPTION = 16_000;

const TAILOR_SYSTEM = `You tailor a candidate's resume to one job posting, and write a short cover letter.

The one rule that overrides everything: use only facts that are in the candidate profile. You may reword, reorder, merge or trim bullets, choose which skills and projects to show, and emphasise what the posting cares about. You may not add a technology, metric, number, employer, title, responsibility, achievement or claim that the profile does not state. If the posting wants something the profile doesn't show, leave it out; never imply it.

Output:
- headline: one line, the candidate's real role, angled to this job (no claims beyond the profile).
- summary: 2-3 sentences built from the profile.
- skills: up to 20 skill names copied exactly as written in the profile's skill list, most relevant to this job first.
- experience: one item per profile experience entry, in the profile's order, with "id" copied from the [id] shown in the profile. 2-5 bullets each, most relevant first. Each bullet may only use facts from that same entry.
- projects: the 0-3 profile projects most relevant to this job, with "id" copied from the profile, 1-3 bullets each from that project's facts.
- coverLetter: 150-220 words, plain text, no greeting line or signature (they are added later). Concrete, specific to this company and role, using only profile facts. No clichés ("I am excited to apply", "passionate", "perfect fit").

Write plainly. No buzzwords the profile doesn't use.`;

export async function tailorResume(
  profile: Profile,
  prefs: Preferences,
  job: { title: string; company: string; location: string; description: string | null },
): Promise<TailoredResume> {
  return structured({
    model: MODEL,
    system: TAILOR_SYSTEM,
    context: `<candidate>\n${profileText(profile)}\n</candidate>\n\n<constraints>\n${constraintsText(prefs)}\n</constraints>`,
    content: [
      {
        type: "text",
        text:
          `<job>\nTitle: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}\n\n` +
          `${(job.description ?? "(no description available)").slice(0, MAX_DESCRIPTION)}\n</job>\n\n` +
          "Tailor the resume and write the cover letter for this job.",
      },
    ],
    schema: TailoredResume,
    effort: "medium",
    maxTokens: 16000,
    task: "tailor the resume",
  });
}

const CheckSchema = z.object({
  unsupported: z.array(z.object({ key: z.string(), reason: z.string() })),
});

const CHECK_SYSTEM = `You are a strict fact-checker for a resume-tailoring tool. You get the candidate's profile (the only source of truth) and a list of statements written for a tailored resume and cover letter, each with a key.

Flag a statement when it claims something the profile doesn't support: a technology, number, metric, scope, title, employer, responsibility or achievement that isn't stated, or that the profile attributes to a different job or project. Statements tagged with an experience or project must be supported by that same entry.

Don't flag rewording, summarising, reordering, or reasonable generalisations of stated facts ("built REST APIs in Node.js" from a bullet about Express endpoints is fine). Don't flag opinions about fit or interest in the company ("I'd like to bring this to your payments team").

Return only the flagged statements, each with its key and a one-sentence reason. Return an empty list if everything is supported.`;

// Claude's half of the truth check: anything it can't trace to the profile.
export async function claudeCheck(
  profile: Profile,
  resume: TailoredResume,
  facts: string,
  job: { company: string; title: string },
) {
  const list = claims(resume, profile);
  if (!list.length) return new Map<string, string>();
  const out = await structured({
    model: MODEL,
    system: CHECK_SYSTEM,
    context: `<profile>\n${profileText(profile)}\n\n${facts}\n</profile>`,
    content: [
      {
        type: "text",
        text:
          `The cover letter is for the ${job.title} role at ${job.company}; naming them is fine.\n\n` +
          "<statements>\n" +
          list.map((c) => `[${c.key}] (${c.where}) ${c.text}`).join("\n") +
          "\n</statements>\n\nFlag any statement the profile doesn't support.",
      },
    ],
    schema: CheckSchema,
    effort: "medium",
    maxTokens: 8000,
    task: "fact-check the tailored resume",
  });
  const keys = new Set(list.map((c) => c.key));
  return new Map(out.unsupported.filter((u) => keys.has(u.key)).map((u) => [u.key, u.reason]));
}

// Tailor, then check: the rules first (cheap, certain), then Claude on what's left.
export async function tailorAndCheck(
  profile: Profile,
  prefs: Preferences,
  job: { title: string; company: string; location: string; description: string | null },
): Promise<{ resume: TailoredResume; truth: TruthReport }> {
  const draft = await tailorResume(profile, prefs, job);
  const facts = `Years of experience: ${prefs.yearsOfExperience ?? "not stated"}`;
  const { resume: afterRules, issues } = ruleCheck(draft, profile, facts, job);
  const flagged = await claudeCheck(profile, afterRules, facts, job);
  const claudeIssues: TruthIssue[] = [];
  const resume = flagged.size ? applyRejections(afterRules, profile, flagged, claudeIssues) : afterRules;
  return {
    resume,
    truth: { checkedAt: new Date().toISOString(), claudeChecked: true, issues: [...issues, ...claudeIssues] },
  };
}
