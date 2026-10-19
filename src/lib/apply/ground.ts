import "server-only";
import { z } from "zod";
import { AI, BULK_MODEL, structured } from "../llm";
import { constraintsText, profileText } from "../profile-text";
import type { Answers, Preferences, Profile } from "../schema";
import type { PlannedField } from "./types";

// Grounded answers (D-055): for required questions no rule or stored answer
// covers, Claude may answer, but only from what Sortie already knows about the
// candidate, and must quote the line it relied on. Code then checks the quote
// really is in that data, that a choice is one of the form's options, and that
// any number in the answer appears in the data. Anything else stays "missing"
// for the owner. Consent questions never come here; they're the owner's call.

const MAX_QUESTIONS = 25;

const GroundSchema = z.object({
  answers: z.array(
    z.object({
      key: z.string(),
      answer: z.array(z.string()).describe("The value: one option (or several for a multi-select), or one text answer. Empty if the data doesn't say."),
      evidence: z.string().describe("A short verbatim quote from <facts> that supports the answer. Empty if none."),
    }),
  ),
});

const SYSTEM = `You fill in job application questions for a candidate, using only the facts given.

Rules:
- Answer a question only if <facts> states the answer, or it follows directly and unambiguously from a stated fact (for example, a stated city answers "Which city are you in?").
- Never guess, estimate or invent: no made-up numbers, dates, names, skills, experience, licences, clearances or preferences. When the facts don't say, return an empty answer and empty evidence.
- For questions with options, answer with the option text exactly as given. For multi-select, list each chosen option.
- Keep text answers short and plain, written as the candidate (first person) where a sentence is needed.
- "evidence" must be copied word for word from <facts>.
- Never answer questions that ask for consent, agreement, signatures or attestations; return an empty answer.`;

export function factsText(profile: Profile, prefs: Preferences, answers: Answers): string {
  const bank = answers.custom.filter((c) => c.answer.trim()).map((c) => `Q: ${c.question}\nA: ${c.answer}`);
  const extra = [
    prefs.noticePeriodDays !== null && prefs.noticePeriodDays !== undefined ? `Notice period: ${prefs.noticePeriodDays} days` : "",
    `Preferred work modes: ${prefs.workModes?.join(", ") || "not stated"}`,
    answers.hearAbout ? `Heard about the job via: ${answers.hearAbout}` : "",
  ].filter(Boolean);
  return [profileText(profile), constraintsText(prefs), ...extra, bank.length ? `Earlier answers:\n${bank.join("\n")}` : ""].filter(Boolean).join("\n\n");
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim();
const numbers = (s: string) => s.match(/\d+(?:[.,]\d+)*/g) ?? [];

// Accepts Claude's answer for one field, or says why not.
export function checkGrounded(f: PlannedField, answer: string[], evidence: string, facts: string): { value: string[] } | { reason: string } {
  const value = answer.map((a) => a.trim()).filter(Boolean);
  if (!value.length) return { reason: `${AI} found nothing in your data that answers this` };
  if (!evidence.trim() || !norm(facts).includes(norm(evidence))) return { reason: `${AI}'s answer wasn't backed by your data` };
  if (f.options.length) {
    const picked = value.map((v) => f.options.find((o) => norm(o) === norm(v)));
    if (picked.some((p) => !p)) return { reason: `${AI}'s answer isn't one of the options` };
    if (f.kind !== "checkbox" && picked.length > 1) return { reason: `${AI} picked more than one option` };
    return { value: picked as string[] };
  }
  if (value.length > 1) return { reason: `${AI} gave more than one answer` };
  const known = new Set(numbers(facts));
  if (numbers(value[0]).some((n) => !known.has(n))) return { reason: `${AI}'s answer has a number that isn't in your data` };
  return { value };
}

export type GroundInput = { profile: Profile; prefs: Preferences; answers: Answers; job: { company: string; title: string } };

// Returns the plan with what Claude could answer filled in (by: "claude").
// Fields it couldn't answer keep state "missing", with the reason as source.
export async function groundAnswers(plan: PlannedField[], input: GroundInput): Promise<PlannedField[]> {
  const todo = plan.filter((p) => p.state === "missing" && p.kind !== "file").slice(0, MAX_QUESTIONS);
  if (!todo.length) return plan;
  const facts = factsText(input.profile, input.prefs, input.answers);
  const questions = todo
    .map((f) => {
      const kind = f.kind === "checkbox" ? "multi-select" : f.options.length ? "single choice" : "text";
      const opts = f.options.length ? `\nOptions: ${f.options.map((o) => `"${o}"`).join(", ")}` : "";
      return `<question key="${f.key}" type="${kind}">\n${f.label}${opts}\n</question>`;
    })
    .join("\n");

  const out = await structured({
    model: BULK_MODEL,
    system: SYSTEM,
    context: `<facts>\n${facts}\n</facts>`,
    content: [
      {
        type: "text",
        text: `Application for ${input.job.title} at ${input.job.company}.\n\n${questions}\n\nAnswer each question by key.`,
      },
    ],
    schema: GroundSchema,
    effort: "low",
    maxTokens: 4000,
    task: "answer the application's questions",
  });

  const byKey = new Map(out.answers.map((a) => [a.key, a]));
  return plan.map((f) => {
    if (!todo.includes(f)) return f;
    const a = byKey.get(f.key);
    if (!a) return { ...f, source: `${AI} found nothing in your data that answers this` };
    const r = checkGrounded(f, a.answer, a.evidence, facts);
    if ("reason" in r) return { ...f, source: r.reason };
    return { ...f, value: r.value, state: "ok", by: "claude", source: `${AI}, from: "${a.evidence.trim().slice(0, 120)}"` };
  });
}
