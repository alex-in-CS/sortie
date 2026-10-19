import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultAnswers, defaultPreferences, emptyProfile, type Profile } from "../schema";
import { fillForm } from "./fill";
import { greenhouseFields, readLeverDom, type GhJob } from "./forms";
import { bankMatch, optionRange, pickRange, planForm, type PlanContext } from "./plan";
import type { FormField } from "./types";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

const profile: Profile = {
  ...emptyProfile(),
  contact: {
    fullName: "Sam Rivera",
    email: "sam@example.com",
    phone: "+91 90000 12345",
    location: "Bengaluru, India",
    links: [
      { label: "LinkedIn", url: "https://linkedin.com/in/samr" },
      { label: "GitHub", url: "https://github.com/samr" },
    ],
  },
  experience: [
    { id: "e1", company: "Northwind Labs", title: "Software Engineer", location: "", start: "2023-07", end: null, bullets: [], skills: [] },
    { id: "e2", company: "Contoso", title: "Intern", location: "", start: "2022-01", end: "2022-06", bullets: [], skills: [] },
  ],
  education: [{ id: "ed", school: "State Institute of Technology", degree: "B.Tech", field: "Computer Science", start: "2019", end: "2023", grade: "8.4 CGPA" }],
};

const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  profile,
  answers: {
    ...defaultAnswers(),
    expectedSalary: { amount: 2_200_000, currency: "INR", period: "year" },
    currentSalary: { amount: 1_400_000, currency: "INR", period: "year" },
  },
  prefs: { ...defaultPreferences(), authorizedCountries: ["India"], needsSponsorshipElsewhere: true, noticePeriodDays: 30, yearsOfExperience: 3, cities: ["Bengaluru"] },
  job: { company: "Acme", title: "Backend Engineer", location: "Bengaluru, India", countryCodes: ["IN"] },
  documents: { resume: true, coverLetter: true },
  ...over,
});

const byKey = (plan: ReturnType<typeof planForm>) => new Map(plan.map((p) => [p.key, p]));

describe("option helpers", () => {
  it("reads ranges and picks the one that fits", () => {
    expect(optionRange("< 10 LPA")).toEqual([0, 10]);
    expect(optionRange("10 - 15 LPA")).toEqual([10, 15]);
    expect(optionRange("Immediate Joiner")).toEqual([0, 0]);
    expect(optionRange("60+ days")).toEqual([60, Infinity]);
    expect(pickRange(["< 10 LPA", "10 - 15 LPA", "15 - 20 LPA", "20 - 25 LPA"], 22)).toBe("20 - 25 LPA");
    expect(pickRange(["Immediate Joiner", "0 - 7 days", "7 - 15 days", "15 - 30 days", "45 days", "60 days"], 30)).toBe("15 - 30 days");
    expect(pickRange(["0 - 7 days", "45 days"], 90)).toBe("45 days");
  });
  it("matches the answer bank by meaning-preserving wording only", () => {
    const bank = [{ id: "1", question: "Are you a Singapore citizen?", answer: "No", source: "manual" as const }];
    expect(bankMatch(bank, "Are you a Singapore citizen?✱")?.answer).toBe("No");
    expect(bankMatch(bank, "Are you a Singapore permanent resident?")).toBeUndefined();
  });
});

describe("planning the Stripe form (Greenhouse API)", () => {
  const job = JSON.parse(fs.readFileSync(fixture("greenhouse-stripe.json"), "utf8")) as GhJob;
  const fields = greenhouseFields(job);

  it("reads every question, plus the phone country, city and education fields", () => {
    expect(fields.map((f) => f.key)).toEqual([
      "first_name",
      "last_name",
      "email",
      "country",
      "phone",
      "resume",
      "cover_letter",
      "question_68935294",
      "question_68935295",
      "question_68935296",
      "question_68935297",
      "question_68935298",
      "question_68935299",
      "question_69457836",
      "candidate-location",
      "school--0",
      "degree--0",
      "discipline--0",
    ]);
    expect(fields.find((f) => f.key === "question_68935297")).toMatchObject({ kind: "checkbox", required: true });
  });

  it("answers from stored data and leaves consent to the owner", () => {
    const plan = byKey(planForm(fields, ctx()));
    const v = (k: string) => plan.get(k)!.value;
    expect(v("first_name")).toEqual(["Sam"]);
    expect(v("last_name")).toEqual(["Rivera"]);
    expect(v("country")).toEqual(["India"]);
    expect(v("resume")).toEqual(["resume"]);
    expect(v("question_68935294")).toEqual(["Northwind Labs"]);
    expect(v("question_68935295")).toEqual(["Software Engineer"]);
    expect(v("question_68935296")).toEqual(["India"]); // country of residence
    expect(v("question_68935297")).toEqual(["India"]); // countries for the role: the job's
    expect(v("question_68935298")).toEqual(["Yes"]); // authorized in India
    expect(v("question_68935299")).toEqual(["No"]); // no sponsorship needed in India
    expect(plan.get("question_69457836")).toMatchObject({ state: "decide" }); // BrightHire recording consent
    expect(v("candidate-location")).toEqual(["Bengaluru, India"]);
    expect(v("school--0")).toEqual(["State Institute of Technology"]);
    expect(plan.get("question_68935299")!.source).toMatch(/sponsorship/);
  });

  it("says yes to sponsorship for a country you can't work in", () => {
    const plan = byKey(planForm(fields, ctx({ job: { company: "Stripe", title: "SWE", location: "Dublin, Ireland", countryCodes: ["IE"] } })));
    expect(plan.get("question_68935298")!.value).toEqual(["No"]);
    expect(plan.get("question_68935299")!.value).toEqual(["Yes"]);
  });

  it("uses a stored consent answer for the same question", () => {
    const consent = fields.find((f) => f.key === "question_69457836")!;
    const answers = { ...ctx().answers, custom: [{ id: "c", question: consent.label, answer: "No", source: "learned" as const }] };
    const plan = byKey(planForm(fields, ctx({ answers })));
    expect(plan.get("question_69457836")).toMatchObject({ state: "ok", by: "bank", value: ["No"] });
  });
});

// The Lever reader and filler run in a real Chrome against saved copies of live
// forms (scripts stripped, so nothing loads from the network or submits).
let browser: Browser | null = null;
beforeAll(async () => {
  browser = await chromium.launch({ channel: "chrome" }).catch(() => null);
});
afterAll(async () => {
  await browser?.close();
});

async function leverPage(name: string) {
  const page = await browser!.newPage();
  await page.setContent(fs.readFileSync(fixture(name), "utf8"));
  return page;
}

describe("Lever forms in Chrome", { timeout: 30_000 }, () => {
  it("reads questions from the page", async ({ skip }) => {
    if (!browser) skip();
    const page = await leverPage("lever-palantir.html");
    const fields: FormField[] = await page.evaluate(readLeverDom);
    const f = (k: string) => fields.find((x) => x.key.startsWith(k) || x.label.startsWith(k));
    expect(f("resume")).toMatchObject({ kind: "file", required: true });
    expect(f("name")).toMatchObject({ kind: "text", required: true, label: "Full name" });
    expect(f("Are you legally authorized")).toMatchObject({ kind: "radio", required: true, options: ["Yes", "No"] });
    expect(f("Language Skill")).toMatchObject({ kind: "checkbox", required: true });
    expect(f("As part of our interview process")).toMatchObject({ kind: "radio", required: true });
    await page.close();
  });

  it("plans and fills the Hevo form, reading every value back", async ({ skip }) => {
    if (!browser) skip();
    const page = await leverPage("lever-hevo.html");
    const fields: FormField[] = await page.evaluate(readLeverDom);
    const plan = planForm(fields, ctx());
    const p = (label: string) => plan.find((x) => x.label.startsWith(label))!;
    expect(p("Current CTC").value).toEqual(["14,00,000 INR per year"]);
    expect(p("Expected CTC").value).toEqual(["20 - 25 LPA"]);
    expect(p("Notice Period").value).toEqual(["15 - 30 days"]);
    expect(p("Are you comfortable with working from Bangalore").value).toEqual(["Yes"]);
    expect(p("Current company").value).toEqual(["Northwind Labs"]);
    expect(p("Managed Territory").state).toBe("missing"); // nothing stored answers it

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sortie-fill-"));
    const resume = path.join(dir, "Sam-Rivera-Resume.pdf");
    fs.writeFileSync(resume, "%PDF-1.4 test");
    const results = await fillForm(page, "lever", plan, { resume, cover: null }, { resumeWaitMs: 200 });
    expect(results.filter((r) => !r.ok)).toEqual([]);
    expect(results.map((r) => r.key)).toContain("resume");
    expect(await page.locator('[name="email"]').inputValue()).toBe("sam@example.com");
    expect(await page.locator('[name="cards[85998fbf-4eed-4002-a191-f01c2bd82ac3][field0]"][value="Yes"]').isChecked()).toBe(true);
    await page.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("answers Outreach's US questions as a non-US candidate", async ({ skip }) => {
    if (!browser) skip();
    const page = await leverPage("lever-outreach.html");
    const plan = planForm(await page.evaluate(readLeverDom), ctx({ job: { company: "Outreach", title: "SWE", location: "Seattle, WA", countryCodes: ["US"] } }));
    const p = (label: string) => plan.find((x) => x.label.startsWith(label))!;
    expect(p("Are you legally authorized to work for any employer in the US").value).toEqual(["No"]);
    expect(p("Do you require sponsorship").value).toEqual(["Yes"]);
    expect(p("Gender").value).toEqual(["Decline to self-identify"]);
    expect(p("Veteran status").value).toEqual(["Decline to self-identify"]);
    expect(p("LinkedIn URL").value).toEqual(["https://linkedin.com/in/samr"]);
    expect(p("Pronouns").state).toBe("skip");
    await page.close();
  });
});
