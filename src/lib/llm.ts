import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import mammoth from "mammoth";
import type * as z from "zod";
import { ParsedResume } from "./schema";

// Opus for work where quality decides the outcome (reading a resume, tailoring,
// the truth check); Sonnet for the per-job review that runs many times a day (D-035).
export const MODEL = process.env.SORTIE_MODEL ?? "claude-opus-5-5";
export const BULK_MODEL = process.env.SORTIE_BULK_MODEL ?? "claude-sonnet-5-5";

export const hasApiKey = () => Boolean(process.env.ANTHROPIC_API_KEY);

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

export class LlmError extends Error {}

const RESUME_SYSTEM = `You read resumes and turn them into structured data for a job-application assistant.

Copy facts exactly as the resume states them. Never invent, infer or embellish employers, titles, dates, metrics or skills; if a field is not on the resume, leave it as an empty string (or null where allowed, or an empty array).

Dates: use "YYYY-MM" when the month is given, otherwise "YYYY". Use null for "end" when the role or study is current.

Skills: list every concrete skill that appears anywhere on the resume (skills section, experience bullets, projects), each once, using its common name ("PostgreSQL", not "postgres db"). Categorise each one. Set "level" from the evidence on the page: "expert" or "strong" only when the resume shows sustained, central use; "working" for normal use; "learning" when it is mentioned only in passing or as coursework. Set "years" only when the resume makes it computable, else null.

For each experience and project, "skills" lists the skills that entry actually demonstrates. Keep bullets verbatim apart from removing bullet characters.`;

type ResumeFile = { data: Buffer; mime: string; filename: string };

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const SUPPORTED_RESUME_TYPES = ["application/pdf", DOCX, "text/plain", "text/markdown"];

async function resumeContent(file: ResumeFile): Promise<Anthropic.Beta.BetaContentBlockParam> {
  if (file.mime === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: file.data.toString("base64") },
    };
  }
  const text =
    file.mime === DOCX
      ? (await mammoth.extractRawText({ buffer: file.data })).value
      : file.data.toString("utf8");
  if (!text.trim()) throw new LlmError("That file has no readable text.");
  return { type: "text", text: `<resume filename="${file.filename}">\n${text}\n</resume>` };
}

export type StructuredRequest<S extends z.ZodType> = {
  model: string;
  system: string;
  // Cached across calls: the part of the prompt that repeats (the profile).
  context?: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: S;
  effort: "low" | "medium" | "high";
  maxTokens: number;
  // For error messages: "read this file", "review this job"…
  task: string;
};

// One structured call: the answer is parsed against the zod schema, and every
// way it can come back unusable becomes an LlmError with a plain message.
export async function structured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<z.infer<S>> {
  if (!hasApiKey()) throw new LlmError("Add ANTHROPIC_API_KEY to .env.local first.");

  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: req.system }];
  if (req.context) system.push({ type: "text", text: req.context, cache_control: { type: "ephemeral" } });

  const response = await anthropic().beta.messages.parse({
    model: req.model,
    max_tokens: req.maxTokens,
    system,
    output_config: { effort: req.effort, format: betaZodOutputFormat(req.schema) },
    // Re-run on a fallback model if a safety classifier declines the request.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: req.content }],
  });

  if (response.stop_reason === "refusal") throw new LlmError(`Claude declined to ${req.task}.`);
  if (response.stop_reason === "max_tokens") throw new LlmError(`The answer was too long to ${req.task} in one pass.`);
  if (!response.parsed_output) throw new LlmError(`Claude's answer didn't match the expected format (${req.task}).`);
  return response.parsed_output as z.infer<S>;
}

export async function parseResume(file: ResumeFile): Promise<ParsedResume> {
  if (!hasApiKey()) throw new LlmError("Add ANTHROPIC_API_KEY to .env.local first.");
  return structured({
    model: MODEL,
    system: RESUME_SYSTEM,
    content: [await resumeContent(file), { type: "text", text: "Extract this resume." }],
    schema: ParsedResume,
    effort: "medium",
    maxTokens: 16000,
    task: "read this file",
  });
}

export function describeError(err: unknown): string {
  if (err instanceof LlmError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the Anthropic API. Try again in a minute.";
  if (err instanceof Anthropic.BadRequestError) return `The Anthropic API rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the Anthropic API.";
  if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status}.`;
  return err instanceof Error ? err.message : "Something went wrong.";
}
