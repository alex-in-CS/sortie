import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ApiError, FinishReason, GoogleGenAI, type Part, ThinkingLevel } from "@google/genai";
import mammoth from "mammoth";
import * as z from "zod";
import { ParsedResume } from "./schema";
import { recordUsage } from "./usage";

// Two providers behind one structured() call (D-057): Claude (Anthropic) or
// Gemini (Google). SORTIE_LLM picks one; otherwise whichever key is set, Claude
// first. Each has a quality model (reading a resume, tailoring, the truth check),
// a bulk model (form answers) (D-035) and a review model, the cheapest, since
// reviews are most of the calls (D-059). Every call's usage is recorded.
export type Provider = "claude" | "gemini";

export const PROVIDER: Provider =
  process.env.SORTIE_LLM === "gemini" || process.env.SORTIE_LLM === "claude"
    ? process.env.SORTIE_LLM
    : !process.env.ANTHROPIC_API_KEY && process.env.GEMINI_API_KEY
      ? "gemini"
      : "claude";

// For the UI and messages: "Claude reviewed…", "Gemini declined…".
export const AI = PROVIDER === "gemini" ? "Gemini" : "Claude";
export const KEY_NAME = PROVIDER === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";

const DEFAULTS = {
  claude: { model: "claude-opus-5-5", bulk: "claude-sonnet-5-5", review: "claude-haiku-5-5" },
  gemini: { model: "gemini-4-argon", bulk: "gemini-3.8-flash", review: "gemini-3.8-flash" },
} as const;

export const MODEL = process.env.SORTIE_MODEL ?? DEFAULTS[PROVIDER].model;
export const BULK_MODEL = process.env.SORTIE_BULK_MODEL ?? DEFAULTS[PROVIDER].bulk;
export const REVIEW_MODEL = process.env.SORTIE_REVIEW_MODEL ?? DEFAULTS[PROVIDER].review;

export const hasApiKey = () => Boolean(process.env[KEY_NAME]);

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());
let gclient: GoogleGenAI | null = null;
const google = () => (gclient ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

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

// Your uploaded resume as plain text, so a review can judge it as written
// (D-058). PDFs give null: the review then judges from the profile alone.
export async function resumeText(file: { data: Buffer; mime: string }): Promise<string | null> {
  if (file.mime === DOCX) return (await mammoth.extractRawText({ buffer: file.data })).value.trim() || null;
  if (file.mime === "text/plain" || file.mime === "text/markdown") return file.data.toString("utf8").trim() || null;
  return null;
}

export type StructuredRequest<S extends z.ZodType> = {
  model: string;
  system: string;
  // Cached across calls: the part of the prompt that repeats (the profile).
  context?: string;
  // Text and PDF blocks, in Anthropic's shape; translated for Gemini.
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
  if (!hasApiKey()) throw new LlmError(`Add ${KEY_NAME} to .env.local first.`);
  return PROVIDER === "gemini" ? gemini(req) : claude(req);
}

async function claude<S extends z.ZodType>(req: StructuredRequest<S>): Promise<z.infer<S>> {
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
  // Output tokens include thinking. A fallback answer is priced at the model that gave it.
  const u = response.usage;
  recordUsage(req.task, response.model ?? req.model, {
    input: u.input_tokens,
    output: u.output_tokens,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  });

  if (response.stop_reason === "refusal") throw new LlmError(`Claude declined to ${req.task}.`);
  if (response.stop_reason === "max_tokens") throw new LlmError(`The answer was too long to ${req.task} in one pass.`);
  if (!response.parsed_output) throw new LlmError(`Claude's answer didn't match the expected format (${req.task}).`);
  return response.parsed_output as z.infer<S>;
}

// ---------- Gemini ----------

// Gemini's structured output takes a subset of JSON Schema; drop what it
// doesn't read (the answer is still validated against the full zod schema).
const GEMINI_SCHEMA_KEYS = new Set([
  "$id", "$defs", "$ref", "$anchor", "type", "format", "title", "description", "enum", "items", "prefixItems",
  "minItems", "maxItems", "minimum", "maximum", "anyOf", "oneOf", "properties", "additionalProperties", "required",
]);

export function geminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(geminiSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "const") out.enum = [v];
    else if (k === "properties" || k === "$defs")
      out[k] = Object.fromEntries(Object.entries(v as object).map(([name, s]) => [name, geminiSchema(s)]));
    else if (GEMINI_SCHEMA_KEYS.has(k)) out[k] = typeof v === "object" ? geminiSchema(v) : v;
  }
  return out;
}

const parts = (content: Anthropic.Beta.BetaContentBlockParam[]): Part[] =>
  content.map((c) => {
    if (c.type === "text") return { text: c.text };
    if (c.type === "document" && c.source.type === "base64")
      return { inlineData: { mimeType: c.source.media_type, data: c.source.data } };
    throw new LlmError(`Gemini can't take a "${c.type}" block.`);
  });

const LEVEL = { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH } as const;

async function gemini<S extends z.ZodType>(req: StructuredRequest<S>): Promise<z.infer<S>> {
  const call = (thinking: boolean) =>
    google().models.generateContent({
      model: req.model,
      // The repeated context comes last in the instruction, so Gemini's implicit
      // prefix cache can reuse it across jobs.
      contents: [{ role: "user", parts: parts(req.content) }],
      config: {
        systemInstruction: req.context ? `${req.system}\n\n${req.context}` : req.system,
        responseMimeType: "application/json",
        responseJsonSchema: geminiSchema(z.toJSONSchema(req.schema)),
        maxOutputTokens: req.maxTokens,
        ...(thinking ? { thinkingConfig: { thinkingLevel: LEVEL[req.effort] } } : {}),
      },
    });

  let response;
  try {
    response = await call(true);
  } catch (err) {
    // Some models don't take a thinking level: ask again without one.
    if (err instanceof ApiError && err.status === 400 && /thinking/i.test(err.message)) response = await call(false);
    else throw err;
  }
  const m = response.usageMetadata;
  const cached = m?.cachedContentTokenCount ?? 0;
  recordUsage(req.task, req.model, {
    input: (m?.promptTokenCount ?? 0) - cached,
    output: (m?.candidatesTokenCount ?? 0) + (m?.thoughtsTokenCount ?? 0),
    cacheRead: cached,
    cacheWrite: 0,
  });

  if (response.promptFeedback?.blockReason) throw new LlmError(`Gemini declined to ${req.task}.`);
  const finish = response.candidates?.[0]?.finishReason;
  if (finish === FinishReason.MAX_TOKENS) throw new LlmError(`The answer was too long to ${req.task} in one pass.`);
  if (finish && finish !== FinishReason.STOP) throw new LlmError(`Gemini declined to ${req.task} (${finish.toLowerCase()}).`);
  let json: unknown;
  try {
    json = JSON.parse(response.text ?? "");
  } catch {
    throw new LlmError(`Gemini's answer wasn't valid JSON (${req.task}).`);
  }
  const parsed = req.schema.safeParse(json);
  if (!parsed.success) throw new LlmError(`Gemini's answer didn't match the expected format (${req.task}).`);
  return parsed.data as z.infer<S>;
}

// ---------- shared ----------

export async function parseResume(file: ResumeFile): Promise<ParsedResume> {
  if (!hasApiKey()) throw new LlmError(`Add ${KEY_NAME} to .env.local first.`);
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

// A refused key fails every other call the same way, so batches stop on it.
export function isAuthError(err: unknown) {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return true;
  return (
    err instanceof ApiError &&
    (err.status === 401 || err.status === 403 || (err.status === 400 && /api key not valid|API_KEY_INVALID/i.test(err.message)))
  );
}

export function describeError(err: unknown): string {
  if (err instanceof LlmError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the Anthropic API. Try again in a minute.";
  if (err instanceof Anthropic.BadRequestError) return `The Anthropic API rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the Anthropic API.";
  if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status}.`;
  if (err instanceof ApiError) {
    if (isAuthError(err)) return "The Gemini API key was rejected (or billing isn't set up for it).";
    if (err.status === 429) return "Rate limited by the Gemini API (or out of quota). Try again later.";
    if (err.status === 400) return `The Gemini API rejected the request: ${err.message.slice(0, 200)}`;
    return `Gemini API error ${err.status}.`;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}
