import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultAnswers, defaultPreferences, emptyProfile } from "../schema";
import type { SourceJob } from "../sources/types";
import { matchOption } from "./fill";
import { autoSubmitBlocker } from "./gate";
import { checkGrounded, factsText } from "./ground";
import { degreeLevel, planForm, specificExperience } from "./plan";
import type { FillResult, PlannedField } from "./types";

// The form step's decisions without a browser: what Claude may answer, when
// Sortie may send on its own, how dropdown options are matched, and the
// application's life through the database.

const fake = vi.hoisted(() => ({ structured: vi.fn() }));
vi.mock("../llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../llm")>()),
  hasApiKey: () => true,
  structured: fake.structured,
}));

const field = (over: Partial<PlannedField>): PlannedField => ({
  key: "q",
  label: "Question",
  kind: "text",
  required: true,
  options: [],
  value: [],
  state: "missing",
  by: null,
  source: "Nothing stored answers this",
  ...over,
});

const profile = {
  ...emptyProfile(),
  contact: { fullName: "Sam Rivera", email: "sam@example.com", phone: "", location: "Bengaluru, India", links: [] },
  experience: [
    { id: "e1", company: "Northwind Labs", title: "Software Engineer", location: "", start: "2023-07", end: null, bullets: ["Built Kafka pipelines handling 40k events a second"], skills: ["Kafka"] },
  ],
};
const prefs = { ...defaultPreferences(), noticePeriodDays: 30, authorizedCountries: ["India"] };
const facts = factsText(profile, prefs, defaultAnswers());

describe("grounded answers", () => {
  it("takes an answer only with a real quote from your data", () => {
    const f = field({ label: "Have you worked with Kafka?", options: ["Yes", "No"], kind: "select" });
    expect(checkGrounded(f, ["Yes"], "Built Kafka pipelines handling 40k events a second", facts)).toEqual({ value: ["Yes"] });
    expect(checkGrounded(f, ["Yes"], "Five years of Kafka at scale", facts)).toEqual({ reason: "Claude's answer wasn't backed by your data" });
    expect(checkGrounded(f, ["Maybe"], "Built Kafka pipelines handling 40k events a second", facts)).toEqual({ reason: "Claude's answer isn't one of the options" });
    expect(checkGrounded(f, [], "", facts)).toEqual({ reason: "Claude found nothing in your data that answers this" });
  });

  it("rejects a number your data doesn't have", () => {
    const f = field({ label: "Largest throughput you've handled?" });
    expect(checkGrounded(f, ["About 40k events a second"], "Built Kafka pipelines handling 40k events a second", facts)).toEqual({
      value: ["About 40k events a second"],
    });
    expect(checkGrounded(f, ["About 90k events a second"], "Built Kafka pipelines handling 40k events a second", facts)).toMatchObject({
      reason: expect.stringMatching(/number/),
    });
  });

  it("fills what passes and leaves the rest for you", async () => {
    vi.resetModules();
    fake.structured.mockResolvedValue({
      answers: [
        { key: "kafka", answer: ["Yes"], evidence: "Built Kafka pipelines handling 40k events a second" },
        { key: "clearance", answer: ["Yes"], evidence: "Has security clearance" },
      ],
    });
    const { groundAnswers } = await import("./ground");
    const plan = [
      field({ key: "kafka", label: "Kafka experience?", kind: "select", options: ["Yes", "No"] }),
      field({ key: "clearance", label: "Do you hold a security clearance?", kind: "select", options: ["Yes", "No"] }),
      field({ key: "consent", label: "I consent to recording", state: "decide" }),
      field({ key: "name", state: "ok", by: "rule", value: ["Sam"] }),
    ];
    const out = await groundAnswers(plan, { profile, prefs, answers: defaultAnswers(), job: { company: "Acme", title: "SWE" } });
    expect(out[0]).toMatchObject({ state: "ok", by: "claude", value: ["Yes"] });
    expect(out[1]).toMatchObject({ state: "missing", source: "Claude's answer wasn't backed by your data" });
    expect(out[2]).toBe(plan[2]); // consent never goes to Claude
    expect(out[3]).toBe(plan[3]);
    const text = fake.structured.mock.calls[0][0].content[0].text as string;
    expect(text).toContain('key="kafka"');
    expect(text).not.toContain("consent");
  });
});

describe("auto-submit gate", () => {
  const ok = field({ key: "a", state: "ok", by: "rule", value: ["x"] });
  const filled: FillResult[] = [{ key: "a", label: "A", ok: true, note: null }];
  const base = { mode: "auto" as const, enabled: true, plan: [ok], fill: filled, challenge: false };

  it("sends only when nothing needs a person", () => {
    expect(autoSubmitBlocker(base)).toBeNull();
    expect(autoSubmitBlocker({ ...base, mode: "review" })).toMatch(/review mode/);
    expect(autoSubmitBlocker({ ...base, enabled: false })).toMatch(/SORTIE_AUTO_SUBMIT/);
    expect(autoSubmitBlocker({ ...base, plan: [ok, field({ state: "decide" })] })).toMatch(/your answer/);
    expect(autoSubmitBlocker({ ...base, plan: [{ ...ok, by: "claude" }] })).toMatch(/Claude answered 1 question/);
    expect(autoSubmitBlocker({ ...base, fill: [{ ...filled[0], ok: false }] })).toMatch(/didn't fill/);
    expect(autoSubmitBlocker({ ...base, challenge: true })).toMatch(/CAPTCHA/);
  });
});

describe("dropdown options", () => {
  it("matches the whole option or its first words, never a fragment", () => {
    const countries = ["British Indian Ocean Territory +246", "India +91"];
    expect(countries[matchOption(countries, "India")]).toBe("India +91");
    expect(matchOption(["Bengaluru, Karnataka, India"], "Bengaluru")).toBe(0);
    expect(matchOption(["Moscow State Institute of International Relations (MGIMO-University)"], "State Institute")).toBe(-1);
    expect(matchOption(["Indiana"], "India")).toBe(-1);
    expect(matchOption(["Bachelor's Degree", "Other"], "other")).toBe(1);
  });

  it("answers total years only when the question asks for total years", () => {
    expect(specificExperience("How many years of experience do you have?")).toBe(false);
    expect(specificExperience("How many years of professional experience do you have?")).toBe(false);
    expect(specificExperience("Years of experience (full time, not counting internships)")).toBe(false);
    expect(
      specificExperience("How many years of experience full time, industry do you have as a data analyst? (not counting internships or school work)"),
    ).toBe(true);
    expect(specificExperience("How many years of Python experience do you have?")).toBe(true);
    expect(specificExperience("Years of experience with Kubernetes")).toBe(true);
    expect(specificExperience("How many years have you worked in fintech?")).toBe(true);
  });

  it("answers Stripe's live questions from stored data, or leaves them", () => {
    const opts = (...o: string[]) => o;
    const fields = [
      { key: "y", label: "How many years of experience full time, industry do you have as a data analyst?", kind: "select" as const, required: true, options: opts("0 - 2 years", "2 - 6 years") },
      { key: "e", label: "Have you ever been employed by Stripe or a Stripe affiliate?", kind: "select" as const, required: true, options: opts("Yes", "No") },
      { key: "w", label: "Do you opt-in to receive WhatsApp messages from Stripe Recruiting?", kind: "select" as const, required: true, options: opts("Yes", "No") },
      { key: "r", label: "If this role offers the option to work from a remote location, do you plan to work remotely?", kind: "select" as const, required: true, options: opts("Yes, I intend to work remotely.", "No, I intend to work from an office location.") },
      { key: "d", label: "What is the most recent degree you obtained?", kind: "select" as const, required: true, options: opts("High School", "Bachelor's Degree", "Master's Degree", "Other") },
    ];
    const ctx = (workModes: ("remote" | "hybrid" | "onsite")[]) => ({
      profile: { ...profile, education: [{ id: "ed", school: "SIT", degree: "B.Tech", field: "CS", start: "2019", end: "2023", grade: "" }] },
      answers: defaultAnswers(),
      prefs: { ...prefs, yearsOfExperience: 3, workModes },
      job: { company: "Stripe", title: "Data Analyst", location: "Toronto", countryCodes: ["CA"] },
      documents: { resume: true, coverLetter: true },
    });
    const plan = new Map(planForm(fields, ctx(["remote", "hybrid", "onsite"])).map((p) => [p.key, p]));
    expect(plan.get("y")!.state).toBe("missing"); // not your total years
    expect(plan.get("e")!.value).toEqual(["No"]);
    expect(plan.get("w")!.state).toBe("decide"); // an opt-in is yours to give
    expect(plan.get("r")!.state).toBe("missing"); // you'd take any mode: your call
    expect(plan.get("d")!.value).toEqual(["Bachelor's Degree"]);
    expect(planForm(fields, ctx(["remote"]))[3].value).toEqual(["Yes, I intend to work remotely."]);
    expect(planForm(fields, ctx(["onsite"]))[3].value).toEqual(["No, I intend to work from an office location."]);
  });

  it("names a degree's level the way dropdowns do", () => {
    expect(degreeLevel("B.Tech")).toBe("Bachelor's Degree");
    expect(degreeLevel("B.E.")).toBe("Bachelor's Degree");
    expect(degreeLevel("Bachelor of Science")).toBe("Bachelor's Degree");
    expect(degreeLevel("M.Sc")).toBe("Master's Degree");
    expect(degreeLevel("MBA")).toBe("Master of Business Administration (M.B.A.)");
    expect(degreeLevel("Ph.D.")).toBe("Doctor of Philosophy (Ph.D.)");
    expect(degreeLevel("Diploma in Design")).toBeUndefined();
  });
});

// ---------- through the database ----------

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "sortie-apply-"));
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
  location: "Bengaluru, India",
  countryCodes: ["IN"],
  workMode: null,
  employmentType: null,
  department: null,
  level: null,
  description: "Node.js",
  url: `https://jobs.lever.co/acme/${id}`,
  applyUrl: `https://jobs.lever.co/acme/${id}/apply`,
  postedAt: "2026-10-18T00:00:00.000Z",
  salary: null,
  ...over,
});

async function oneApplication() {
  const jobs = await import("../jobs");
  const apps = await import("../applications");
  jobs.syncRegistry([
    { name: "Acme", provider: "lever", board: "acme" },
    { name: "Globex", provider: "greenhouse", board: "globex" },
    { name: "Initech", provider: "workday", board: "initech" },
  ]);
  const [acme, globex, initech] = jobs.listCompanies().sort((a, b) => a.name.localeCompare(b.name));
  jobs.saveBoard(acme.id, [sj("abc")], true);
  jobs.saveBoard(globex.id, [sj("123", { url: "https://boards.greenhouse.io/globex/jobs/123", applyUrl: null })], true);
  jobs.saveBoard(initech.id, [sj("w1", { url: "https://initech.wd1.myworkdayjobs.com/x/job/1", applyUrl: null })], true);
  const { id } = apps.createApplication({ jobId: 1, searchId: "s", origin: "auto", score: 80, mode: "review", reason: "test" });
  apps.saveTailored(
    id,
    { headline: "", summary: "", skills: [], experience: [], projects: [], coverLetter: "" },
    { checkedAt: "", claudeChecked: false, issues: [] },
    `resumes/${id}/Sam-Resume.pdf`,
  );
  return { jobs, apps, id };
}

describe("an application through the form step", () => {
  it("finds where each provider's form lives", async () => {
    const { jobs } = await oneApplication();
    const { applyTarget } = await import("./index");
    expect(applyTarget(jobs.getJob(1)!)).toMatchObject({ provider: "lever", url: "https://jobs.lever.co/acme/abc/apply" });
    expect(applyTarget(jobs.getJob(2)!)).toMatchObject({
      provider: "greenhouse",
      url: "https://job-boards.greenhouse.io/embed/job_app?for=globex&token=123",
    });
    expect(applyTarget(jobs.getJob(3)!)).toEqual({ provider: null, url: "https://initech.wd1.myworkdayjobs.com/x/job/1" });
  });

  it("moves through held, open in Chrome and submitted, and never twice", async () => {
    const { apps, id } = await oneApplication();
    const claimed = apps.claimForApplying()!;
    expect(claimed).toMatchObject({ id, status: "applying" });
    expect(apps.claimForApplying()).toBeUndefined();
    expect(apps.actOnApplication(id, "skip")).toMatchObject({ code: 409 }); // busy

    const plan = [field({ key: "name", state: "ok", by: "rule", value: ["Sam"] })];
    apps.saveFormOutcome(id, { status: "held", plan, fill: [], screenshot: "applications/1/form.png", applyUrl: "https://x", detail: "Review mode" });
    expect(apps.getApplication(id)).toMatchObject({ status: "held", plan, screenshot: "applications/1/form.png", apply_url: "https://x" });

    expect(apps.actOnApplication(id, "open")).toEqual({ status: "submitting" });
    expect(apps.nextHandoff()?.id).toBe(id);
    expect(apps.actOnApplication(id, "refill")).toMatchObject({ code: 409 }); // open in Chrome

    // A restart while the window was open puts it back to held.
    expect(apps.requeueApplying()).toBe(1);
    expect(apps.getApplication(id)!.status).toBe("held");

    expect(apps.actOnApplication(id, "submitted")).toEqual({ status: "submitted" });
    expect(apps.getApplication(id)).toMatchObject({ status: "submitted", submitted_by: "you" });
    expect(apps.actOnApplication(id, "open")).toMatchObject({ code: 409 });
    expect(apps.actOnApplication(id, "skip")).toMatchObject({ code: 409 });
  });

  it("learns your answers and uses them on the next fill", async () => {
    const { apps, id } = await oneApplication();
    apps.claimForApplying();
    const question = field({ key: "cards[1][field0]", label: "Are you open to on-call rotations?", kind: "radio", options: ["Yes", "No"] });
    const consent = field({ key: "consent", label: "I consent to my interview being recorded", kind: "radio", options: ["Yes", "No"], state: "decide" });
    apps.saveFormOutcome(id, { status: "needs_you", plan: [question, consent], detail: "2 questions need your answer" });

    const { saveAnswers } = await import("./answers");
    const app = apps.getApplication(id)!;
    expect(saveAnswers(app, [{ key: question.key, answer: ["Maybe"] }])).toBe(0); // not an option
    expect(saveAnswers(app, [{ key: question.key, answer: ["Yes"] }, { key: "consent", answer: ["No"] }])).toBe(2);
    expect(apps.actOnApplication(id, "refill")).toEqual({ status: "ready" });

    const store = await import("../store");
    const { planForm } = await import("./plan");
    const ctx = {
      profile: emptyProfile(),
      answers: store.answersStore.get().value,
      prefs: defaultPreferences(),
      job: { company: "Acme", title: "SWE", location: "", countryCodes: [] },
      documents: { resume: true, coverLetter: false },
    };
    const again = planForm([question, consent], ctx);
    expect(again[0]).toMatchObject({ state: "ok", by: "bank", value: ["Yes"] });
    expect(again[1]).toMatchObject({ state: "ok", by: "bank", value: ["No"] });
    expect(store.answersStore.get().value.custom.every((c) => c.source === "learned")).toBe(true);
  });
});
