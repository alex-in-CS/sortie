import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StructuredRequest } from "./llm";
import type { SourceJob } from "./sources/types";

// The whole phase 3 path on a temp database, with Claude and Chrome replaced by
// fakes: review → select under caps → your resume as uploaded, or (when the
// review says it undersells you) tailor → truth check → files on disk →
// handed to the form step.

const fake = vi.hoisted(() => ({
  structured: vi.fn(),
}));

vi.mock("./llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./llm")>()),
  hasApiKey: () => true,
  structured: fake.structured,
}));
vi.mock("./pdf", () => ({ htmlToPdf: async (html: string) => Buffer.from(`%PDF ${html.length}`), closePdf: async () => {} }));
// The form step has its own tests (apply/flow.test.ts); here it just holds.
vi.mock("./apply", () => ({
  applyOne: async (app: { id: number }) => {
    const { saveFormOutcome } = await import("./applications");
    saveFormOutcome(app.id, { status: "held", detail: "This search is in review mode: you submit." });
    return "held";
  },
}));

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "sortie-auto-"));
  vi.stubEnv("SORTIE_DATA_DIR", dir);
  vi.resetModules();
  fake.structured.mockReset();
});

afterEach(() => {
  const g = globalThis as { sortieDb?: DatabaseSync };
  g.sortieDb?.close();
  delete g.sortieDb;
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

const sj = (id: string, over: Partial<SourceJob> = {}): SourceJob => ({
  providerJobId: id,
  title: "Backend Engineer",
  location: "Pune, India",
  countryCodes: [],
  workMode: null,
  employmentType: null,
  department: null,
  level: null,
  description: "Node.js and PostgreSQL. Must be a US citizen." ,
  url: `https://example.com/${id}`,
  applyUrl: null,
  postedAt: "2026-10-18T00:00:00.000Z",
  salary: null,
  ...over,
});

// Claude, played by a script: reviews by company (Acme's says the resume
// undersells you unless `advice` is null), a tailoring with one invented bullet
// (caught by the rules) and one overstated headline (caught by the Claude check).
function claude(req: StructuredRequest<never>, advice: string | null = "Buries the payment API work") {
  const text = req.content.map((c) => ("text" in c ? c.text : "")).join("");
  if (req.task === "review this job")
    return text.includes("Company: Beta")
      ? { score: 90, verdict: "strong", reasons: ["Fits"], gaps: [], dealbreaker: "Requires US citizenship", resumeAdvice: null }
      : { score: 82, verdict: "good", reasons: ["Node.js and PostgreSQL match"], gaps: ["Kafka"], dealbreaker: null, resumeAdvice: advice };
  if (req.task === "tailor the resume")
    return {
      headline: "Senior payments architect",
      summary: "Backend engineer who builds payment APIs.",
      skills: ["Node.js", "PostgreSQL"],
      experience: [{ id: "e1", bullets: ["Built payment APIs in Node.js", "Scaled the platform to 9 regions"] }],
      projects: [],
    };
  if (req.task === "fact-check the documents") return { unsupported: [{ key: "headline", reason: "Not senior" }] };
  throw new Error(`unexpected task ${req.task}`);
}

async function setup() {
  const store = await import("./store");
  const schema = await import("./schema");
  const jobs = await import("./jobs");
  const { matchAll } = await import("./pipeline");
  store.profileStore.save({
    ...schema.emptyProfile(),
    contact: { fullName: "Sam Rivera", email: "sam@example.com", phone: "", location: "Pune", links: [] },
    headline: "Backend engineer",
    summary: "Backend engineer building payment APIs.",
    skills: ["Node.js", "PostgreSQL"].map((name) => ({
      id: name,
      name,
      category: "framework" as const,
      level: "strong" as const,
      years: null,
      source: "manual" as const,
    })),
    experience: [
      {
        id: "e1",
        company: "Acme Pay",
        title: "Software Engineer",
        location: "Pune",
        start: "2023-01",
        end: null,
        bullets: ["Built payment APIs in Node.js and PostgreSQL"],
        skills: ["Node.js", "PostgreSQL"],
      },
    ],
  });
  store.preferencesStore.save({ ...schema.defaultPreferences(), countries: ["India"], maxPerCompany: 1, dailyLimit: 5 });
  const search = { ...schema.newSearch(), minMatch: 50 };
  store.searchesStore.save([search]);
  jobs.syncRegistry([
    { name: "Acme", provider: "greenhouse", board: "acme" },
    { name: "Beta", provider: "greenhouse", board: "beta" },
  ]);
  const [acme, beta] = jobs.listCompanies();
  jobs.saveBoard(acme.id, [sj("1"), sj("2", { title: "Backend Engineer, Payments" })], true);
  jobs.saveBoard(beta.id, [sj("3")], true);
  matchAll(new Date());
  return { search };
}

// Your resume as uploaded: a text file, so the review can read it as written.
async function upload() {
  const { addDocument } = await import("./store");
  const file = path.join(dir, "uploaded.txt");
  fs.writeFileSync(file, "Sam Rivera\nBackend engineer\nBuilt payment APIs in Node.js and PostgreSQL");
  addDocument({ id: "doc1", kind: "resume", filename: "Sam_Master.txt", path: file, mime: "text/plain" });
  return file;
}

describe("prepare", () => {
  it("reviews, selects under the caps, tailors when the review says so and checks the truth", async () => {
    fake.structured.mockImplementation(async (req) => claude(req));
    await setup();
    await upload();
    const { prepare } = await import("./autopilot");
    const apps = await import("./applications");

    const r = await prepare();
    expect(r.reviews).toMatchObject({ reviewed: 3, failed: 0 });
    // Acme's cap is 1; Beta has a dealbreaker.
    expect(r).toMatchObject({ selected: 1, capped: { company: 1, daily: 0 }, tailored: 1, asIs: 0, tailorFailed: 0, blocked: null });
    expect(r.forms).toEqual({ held: 1, submitted: 0, needsYou: 0 });

    const [app] = apps.listApplications();
    expect(app).toMatchObject({ status: "held", company: "Acme", origin: "auto", review: { score: 82, gaps: ["Kafka"], resumeAdvice: "Buries the payment API work" } });
    expect(app.resume!.headline).toBe("Backend engineer"); // reverted by the Claude check
    expect(app.resume!.experience[0].bullets).toEqual(["Built payment APIs in Node.js"]); // "9 regions" removed by the rules
    expect(app.truth!.issues.map((i) => i.reason)).toEqual(["States 9, which isn't in your profile", "Not senior"]);
    expect(app.resume_file).toBe(`resumes/${app.id}/Sam-Rivera-Resume.pdf`);
    expect(fs.existsSync(path.join(dir, app.resume_file!))).toBe(true);
    // No form asked for a cover letter, so none was written.
    expect(apps.hasCoverLetter(app)).toBe(false);
    expect(apps.applicationEvents(app.id).map((e) => e.kind)).toEqual(["selected", "tailoring", "ready", "applying", "held"]);
    // The tailoring was told what the review found.
    const tailorCall = fake.structured.mock.calls.find(([req]) => req.task === "tailor the resume")![0];
    expect(JSON.stringify(tailorCall.content)).toContain("Buries the payment API work");
    expect(app.last_detail).toMatch(/review mode/);

    // Nothing changed: no new reviews, and Acme is at its cap.
    fake.structured.mockClear();
    expect(await prepare()).toMatchObject({ reviews: { reviewed: 0 }, selected: 0, tailored: 0, forms: { held: 0 } });
    expect(fake.structured).not.toHaveBeenCalled();
  });

  it("sends your resume as uploaded when the review finds nothing to fix", async () => {
    fake.structured.mockImplementation(async (req) => claude(req, null));
    await setup();
    const file = await upload();
    const { prepare } = await import("./autopilot");
    const apps = await import("./applications");

    const r = await prepare();
    expect(r).toMatchObject({ selected: 1, tailored: 0, asIs: 1, tailorFailed: 0, blocked: null });
    const [app] = apps.listApplications();
    expect(app).toMatchObject({ status: "held", resume: null, truth: null, review: { resumeAdvice: null } });
    // Named for recruiters, not "Sam_Master.txt"; the bytes are yours, untouched.
    expect(app.resume_file).toBe(`resumes/${app.id}/Sam-Rivera-Resume.txt`);
    expect(fs.readFileSync(path.join(dir, app.resume_file!), "utf8")).toBe(fs.readFileSync(file, "utf8"));
    // Only reviews were paid for, and they read the resume as written.
    expect(fake.structured.mock.calls.map(([req]) => req.task)).toEqual(["review this job", "review this job", "review this job"]);
    expect(fake.structured.mock.calls[0][0].context).toContain("<resume>\nSam Rivera\nBackend engineer");
  });

  it("retries a failed tailoring, then hands it to the owner", async () => {
    fake.structured.mockImplementation(async (req) => {
      if (req.task === "tailor the resume") throw new Error("overloaded");
      return claude(req);
    });
    await setup();
    const apps = await import("./applications");
    const { prepareDocuments } = await import("./autopilot");
    const { search } = await import("./store").then((s) => ({ search: s.searchesStore.get().value[0] }));
    const { id } = apps.createApplication({ jobId: 1, searchId: search.id, origin: "manual", score: 80, mode: "review", reason: "Picked by hand" });
    apps.saveReview(1, search.id, { score: 80, verdict: "good", reasons: [], gaps: [], dealbreaker: null, resumeAdvice: "Buries it" }, "m", "h");

    for (let i = 1; i <= 3; i++) {
      const app = apps.claimForTailoring()!;
      expect(app).toMatchObject({ id, attempts: i });
      expect(await prepareDocuments(app)).toBe(false);
    }
    expect(apps.getApplication(id)).toMatchObject({ status: "needs_you", error: "overloaded" });
    expect(apps.claimForTailoring()).toBeUndefined();
    expect(apps.createApplication({ jobId: 1, searchId: search.id, origin: "manual", score: 80, mode: "review", reason: "" })).toEqual({
      id,
      created: false,
    });
  });

  it("waits for the profile before spending anything", async () => {
    fake.structured.mockImplementation(async (req) => claude(req));
    await setup();
    const store = await import("./store");
    const schema = await import("./schema");
    store.profileStore.save(schema.emptyProfile());
    const { prepare } = await import("./autopilot");
    const r = await prepare();
    expect(r.reviews).toBeNull();
    expect(r.blocked).toMatch(/your name, an email address, at least one role or project, skills/);
    expect(fake.structured).not.toHaveBeenCalled();
  });
});
