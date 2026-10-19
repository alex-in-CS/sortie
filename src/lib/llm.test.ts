import { ApiError, FinishReason } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { ParsedResume, TailoredResume } from "./schema";

// The Gemini side of structured() (D-057), with Google's client faked: the
// schema it is sent, and every way an answer can come back unusable.

const fake = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@google/genai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@google/genai")>()),
  GoogleGenAI: class {
    models = { generateContent: fake.generate };
  },
}));

const ALLOWED = new Set([
  "$id", "$defs", "$ref", "$anchor", "type", "format", "title", "description", "enum", "items", "prefixItems",
  "minItems", "maxItems", "minimum", "maximum", "anyOf", "oneOf", "properties", "additionalProperties", "required",
]);

// Every schema keyword used, skipping the names inside "properties" maps.
function keywords(node: unknown, out = new Set<string>()) {
  if (Array.isArray(node)) node.forEach((n) => keywords(n, out));
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) {
      out.add(k);
      if (k === "properties" || k === "$defs") Object.values(v as object).forEach((s) => keywords(s, out));
      else keywords(v, out);
    }
  return out;
}

beforeEach(() => {
  vi.resetModules();
  fake.generate.mockReset();
  vi.stubEnv("SORTIE_LLM", "gemini");
  vi.stubEnv("GEMINI_API_KEY", "test-key");
});
afterEach(() => vi.unstubAllEnvs());

const llm = () => import("./llm");
const Small = z.object({ score: z.number(), verdict: z.enum(["good", "poor"]), note: z.string().nullable() });
const req = (over = {}) => ({
  model: "gemini-3.8-flash",
  system: "Be brief.",
  context: "<candidate>Sam</candidate>",
  content: [{ type: "text" as const, text: "Review this." }],
  schema: Small,
  effort: "low" as const,
  maxTokens: 500,
  task: "review this job",
  ...over,
});
const answer = (text: string, finishReason = FinishReason.STOP) => ({ text, candidates: [{ finishReason }] });

describe("Gemini schemas", () => {
  it("sends only the JSON Schema keywords Gemini reads, keeping every field", async () => {
    const { geminiSchema } = await llm();
    for (const s of [ParsedResume, TailoredResume, Small]) {
      const g = geminiSchema(z.toJSONSchema(s)) as { properties: Record<string, unknown> };
      expect([...keywords(g)].filter((k) => !ALLOWED.has(k))).toEqual([]);
      expect(Object.keys(g.properties)).toEqual(Object.keys((z.toJSONSchema(s) as { properties: object }).properties));
    }
    expect(geminiSchema({ type: "string", const: "x", pattern: "^x$" })).toEqual({ type: "string", enum: ["x"] });
  });
});

describe("structured() on Gemini", () => {
  it("picks Gemini and its models from the environment", async () => {
    const m = await llm();
    expect([m.PROVIDER, m.AI, m.KEY_NAME, m.MODEL, m.BULK_MODEL]).toEqual(["gemini", "Gemini", "GEMINI_API_KEY", "gemini-4-argon", "gemini-3.8-flash"]);
    expect(m.hasApiKey()).toBe(true);
  });

  it("sends the schema, system, context and PDF, and validates the answer", async () => {
    fake.generate.mockResolvedValue(answer('{"score": 82, "verdict": "good", "note": null}'));
    const { structured } = await llm();
    const pdf = { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: "JVBERg==" } };
    expect(await structured(req({ content: [pdf, { type: "text", text: "Extract." }] }))).toEqual({ score: 82, verdict: "good", note: null });
    const sent = fake.generate.mock.calls[0][0];
    expect(sent.model).toBe("gemini-3.8-flash");
    expect(sent.contents[0].parts).toEqual([{ inlineData: { mimeType: "application/pdf", data: "JVBERg==" } }, { text: "Extract." }]);
    expect(sent.config).toMatchObject({
      systemInstruction: "Be brief.\n\n<candidate>Sam</candidate>",
      responseMimeType: "application/json",
      maxOutputTokens: 500,
      thinkingConfig: { thinkingLevel: "LOW" },
    });
    expect(sent.config.responseJsonSchema.properties.verdict).toEqual({ type: "string", enum: ["good", "poor"] });
  });

  it("turns every unusable answer into a plain error", async () => {
    const { structured } = await llm();
    fake.generate.mockResolvedValueOnce(answer('{"score": 82', FinishReason.MAX_TOKENS));
    await expect(structured(req())).rejects.toThrow("The answer was too long to review this job in one pass.");
    fake.generate.mockResolvedValueOnce(answer("", FinishReason.SAFETY));
    await expect(structured(req())).rejects.toThrow("Gemini declined to review this job (safety).");
    fake.generate.mockResolvedValueOnce({ text: "", promptFeedback: { blockReason: "OTHER" } });
    await expect(structured(req())).rejects.toThrow("Gemini declined to review this job.");
    fake.generate.mockResolvedValueOnce(answer("not json"));
    await expect(structured(req())).rejects.toThrow("Gemini's answer wasn't valid JSON (review this job).");
    fake.generate.mockResolvedValueOnce(answer('{"score": "high", "verdict": "good", "note": null}'));
    await expect(structured(req())).rejects.toThrow("Gemini's answer didn't match the expected format (review this job).");
  });

  it("asks again without a thinking level when the model doesn't take one", async () => {
    fake.generate
      .mockRejectedValueOnce(new ApiError({ status: 400, message: "Thinking level is not supported for this model." }))
      .mockResolvedValueOnce(answer('{"score": 50, "verdict": "poor", "note": "x"}'));
    const { structured } = await llm();
    expect(await structured(req())).toMatchObject({ score: 50 });
    expect(fake.generate.mock.calls[1][0].config.thinkingConfig).toBeUndefined();
  });

  it("recognises a rejected key, so batches stop on it", async () => {
    const { isAuthError, describeError } = await llm();
    const bad = new ApiError({ status: 400, message: "API key not valid. Please pass a valid API key." });
    expect(isAuthError(bad)).toBe(true);
    expect(isAuthError(new ApiError({ status: 403, message: "Permission denied" }))).toBe(true);
    expect(isAuthError(new ApiError({ status: 429, message: "Quota" }))).toBe(false);
    expect(describeError(bad)).toMatch(/Gemini API key was rejected/);
    expect(describeError(new ApiError({ status: 429, message: "Quota" }))).toMatch(/Rate limited by the Gemini API/);
  });

  it("asks for the right key when none is set", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const { structured } = await llm();
    await expect(structured(req())).rejects.toThrow("Add GEMINI_API_KEY to .env.local first.");
  });
});

describe("choosing a provider", () => {
  it("prefers Claude when its key is set, Gemini when only Gemini's is", async () => {
    vi.stubEnv("SORTIE_LLM", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
    expect((await llm()).PROVIDER).toBe("claude");
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect((await llm()).PROVIDER).toBe("gemini");
  });
});
