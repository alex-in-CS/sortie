import { describe, expect, it } from "vitest";
import { countriesIn, countryCode, mentionsCity } from "./geo";
import { inferSeniority, isSoftwareRole, type MatchJob, matchJob, skillOverlap, yearsAsked } from "./match";
import { defaultPreferences, emptyProfile, newSearch, type Profile, type Skill } from "./schema";

const skill = (name: string, level: Skill["level"] = "strong"): Skill => ({
  id: name,
  name,
  category: "other",
  level,
  years: null,
  source: "manual",
});

const profile: Profile = {
  ...emptyProfile(),
  skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "AWS", "Docker"].map((n) => skill(n)),
  experience: [{ id: "1", company: "Acme", title: "Software Engineer", location: "", start: "2023", end: null, bullets: [], skills: [] }],
};

const now = new Date("2026-10-19T00:00:00Z");
const job = (over: Partial<MatchJob> = {}): MatchJob => ({
  company: "Stripe",
  title: "Software Engineer, Payments",
  location: "Bengaluru, India",
  countryCodes: [],
  workMode: "hybrid",
  employmentType: "full-time",
  level: null,
  description: "We use TypeScript, React and Postgres on AWS. Kubernetes is a plus. 2+ years of experience.",
  postedAt: "2026-10-15T00:00:00Z",
  salary: null,
  ...over,
});
const prefs = { ...defaultPreferences(), countries: ["India"], yearsOfExperience: 3 };
const search = newSearch();

describe("geo", () => {
  it("resolves names, aliases and cities", () => {
    expect(countryCode("India")).toBe("IN");
    expect(countryCode("usa")).toBe("US");
    expect(countriesIn("Bangalore, Karnataka")).toEqual(["IN"]);
    expect(countriesIn("Remote - US")).toEqual(["US"]);
    expect(countriesIn("London; Dublin").sort()).toEqual(["GB", "IE"]);
    expect(countriesIn("Remote (Anywhere)")).toEqual(["*"]);
    expect(countriesIn("Indiana")).toEqual(["US"]);
    expect(countriesIn("Hawthorne, CA")).toEqual(["US"]);
    expect(countriesIn("Toronto, ON")).toEqual(["CA"]);
    expect(countriesIn("Reykjavík, Iceland")).toEqual(["IS"]);
    expect(countriesIn("Lagos, Nigeria")).toEqual(["NG"]);
    expect(countriesIn("Jersey City, NJ")).toEqual(["US"]);
    expect(countriesIn("Pune, IN")).toEqual(["IN"]);
    expect(countryCode("Hong Kong")).toBe("HK");
    expect(mentionsCity("Bengaluru, India", "Bangalore")).toBe(true);
    expect(mentionsCity("Pune, India", "Bangalore")).toBe(false);
  });
});

describe("skills", () => {
  it("matches aliases and lists what the profile lacks", () => {
    const { matched, missing } = skillOverlap(job().description!, profile.skills);
    expect(matched.map((s) => s.name)).toEqual(["TypeScript", "React", "PostgreSQL", "AWS"]);
    expect(missing).toContain("Kubernetes");
  });
  it("doesn't read English words as skills", () => {
    const { missing } = skillOverlap("You will excel at R&D for Series C growth. Go to market fast in the C-suite.", []);
    expect(missing).toEqual([]);
    expect(skillOverlap("Write Go and C++ services", []).missing).toEqual(expect.arrayContaining(["Go", "C++"]));
  });
});

describe("title, seniority and years", () => {
  it("classifies roles", () => {
    expect(isSoftwareRole("Backend Engineer")).toBe(true);
    expect(isSoftwareRole("Sales Engineer")).toBe(false);
    expect(isSoftwareRole("Mechanical Engineer")).toBe(false);
    expect(isSoftwareRole("Account Executive")).toBe(false);
  });
  // Real titles from the 2026-10-19 fetch that the first classifier got wrong or right.
  it.each([
    ["Electrical Engineer, Battery (Falcon & Dragon)", false],
    ["Operations Engineer (Starship Machining)", false],
    ["Project Controls Engineer, Starship Infrastructure", false],
    ["Engineer - Controls Platform NPI", false],
    ["Technical Support Engineer - Developer Platform", false],
    ["LearnVantage Software Sales Account Exec – Enterprise", false],
    ["Software Engineer (Avionics)", true],
    ["Member of Technical Staff - Systems", true],
    ["Forward Deployed Engineer - ML", true],
    ["Site Reliability Engineer, Kubernetes Platform", true],
    ["Platform Engineer - Compute", true],
    ["Data Engineer", true],
  ])("classifies %s", (title, expected) => {
    expect(isSoftwareRole(title)).toBe(expected);
  });
  it("infers seniority", () => {
    expect(inferSeniority("Software Engineer Intern", null)).toBe("intern");
    expect(inferSeniority("Senior Software Engineer", null)).toBe("senior");
    expect(inferSeniority("Staff Engineer", null)).toBe("lead");
    expect(inferSeniority("Software Engineer I", null)).toBe("entry");
    expect(inferSeniority("Software Engineer II", null)).toBe("mid");
    expect(inferSeniority("Java Fullstack Developer- Vice President", null)).toBe("lead");
    expect(inferSeniority("IT Quality Senior Analyst - AVP", null)).toBe("lead");
    expect(inferSeniority("Front End Developer - Assistant Vice President", null)).toBe("lead");
    expect(inferSeniority("Software Engineer", "Entry Level")).toBe("entry");
    const r = matchJob(job({ title: "EMT3_VM_Gen_AI_ML_Senior_Developer" }), search, profile, prefs, now);
    expect(r.rejected).toMatch(/senior-level/);
  });
  it("finds the smallest years asked", () => {
    expect(yearsAsked("5+ years of Java, 3-5 years of SQL")).toBe(3);
    expect(yearsAsked("no requirement")).toBeNull();
  });
});

describe("matchJob", () => {
  it("scores a good fit and explains it", () => {
    const r = matchJob(job(), search, profile, prefs, now);
    expect(r.rejected).toBeNull();
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.matched).toContain("PostgreSQL");
  });

  it("doesn't list the company's own product as a missing skill", () => {
    const r = matchJob(job({ company: "ClickHouse", description: "ClickHouse, TypeScript and Kubernetes." }), search, profile, prefs, now);
    expect(r.missing).toEqual(["Kubernetes"]);
  });

  it.each([
    [{ title: "Senior Software Engineer" }, /senior-level/],
    [{ title: "Account Executive" }, /Not a software role/],
    [{ location: "London, UK" }, /outside your countries/],
    [{ workMode: "onsite" as const }, null],
    [{ employmentType: "contract" as const }, /contract role/],
    [{ description: "We need 8+ years of TypeScript." }, /8\+ years/],
    [{ company: "Evil Corp" }, /exclude list/],
  ])("rejects or passes %o", (over, expected) => {
    const r = matchJob(job(over), search, profile, { ...prefs, excludeCompanies: ["evil"] }, now);
    if (expected === null) expect(r.rejected).toBeNull();
    else expect(r.rejected).toMatch(expected);
  });

  it("respects work modes, cities and sponsorship", () => {
    expect(matchJob(job({ workMode: "onsite" }), search, profile, { ...prefs, workModes: ["remote"] }, now).rejected).toMatch(
      /onsite role/,
    );
    const cities = { ...prefs, cities: ["Hyderabad"] };
    expect(matchJob(job(), search, profile, cities, now).rejected).toMatch(/not one of your cities/);
    expect(matchJob(job(), search, profile, { ...cities, willingToRelocate: true }, now).rejected).toBeNull();
    const abroad = { ...prefs, countries: ["India", "Singapore"], authorizedCountries: ["India"] };
    const sg = job({ location: "Singapore" });
    expect(matchJob(sg, search, profile, abroad, now).notes).toContain("May need visa sponsorship");
    expect(
      matchJob({ ...sg, description: "We are unable to sponsor visas." }, search, profile, abroad, now).rejected,
    ).toMatch(/sponsor/);
  });

  it("applies the salary floor only in the same currency", () => {
    const floor = { ...prefs, minSalary: { amount: 3_000_000, currency: "INR", period: "year" as const } };
    const low = job({ salary: { min: 1_000_000, max: 2_000_000, currency: "INR", period: "year" } });
    expect(matchJob(low, search, profile, floor, now).rejected).toMatch(/below your floor/);
    expect(matchJob({ ...low, salary: { ...low.salary!, currency: "USD" } }, search, profile, floor, now).rejected).toBeNull();
  });

  it("uses explicit titles and excluded keywords", () => {
    const backend = { ...search, titles: ["Backend"], excludeKeywords: ["blockchain"] };
    expect(matchJob(job(), backend, profile, prefs, now).rejected).toMatch(/Title/);
    expect(matchJob(job({ title: "Backend Engineer" }), backend, profile, prefs, now).rejected).toBeNull();
    expect(
      matchJob(job({ title: "Backend Engineer", description: "Blockchain team" }), backend, profile, prefs, now).rejected,
    ).toMatch(/blockchain/);
  });
});
