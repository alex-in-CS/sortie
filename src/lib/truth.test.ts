import { describe, expect, it } from "vitest";
import { coverLetterHtml, formatMonth, resumeHtml } from "./resume-html";
import { emptyProfile, type Profile, type Skill, type TailoredResume, type TruthIssue } from "./schema";
import { selectJobs, type Candidate } from "./select";
import { applyRejections, claims, ruleCheck, sentences } from "./truth";

const skill = (name: string): Skill => ({ id: name, name, category: "other", level: "strong", years: null, source: "manual" });

const profile: Profile = {
  ...emptyProfile(),
  contact: { fullName: "Sam Rivera", email: "sam@example.com", phone: "+91 90000 00000", location: "Pune, India", links: [] },
  headline: "Backend engineer",
  summary: "Backend engineer building payment APIs.",
  skills: ["TypeScript", "Node.js", "PostgreSQL", "AWS", "Python"].map(skill),
  experience: [
    {
      id: "e1",
      company: "Acme Pay",
      title: "Software Engineer",
      location: "Pune",
      start: "2023-01",
      end: null,
      bullets: ["Built payment APIs in Node.js and PostgreSQL serving 2 million requests a day", "Cut p95 latency by 40%"],
      skills: ["Node.js", "PostgreSQL", "AWS"],
    },
    {
      id: "e2",
      company: "DataCo",
      title: "Intern",
      location: "",
      start: "2022-05",
      end: "2022-08",
      bullets: ["Wrote Python ETL scripts"],
      skills: ["Python"],
    },
  ],
  projects: [{ id: "p1", name: "Ledger", url: "https://github.com/sam/ledger", description: "Double-entry ledger in TypeScript", bullets: ["Open-source ledger <library>"], skills: ["TypeScript"] }],
};

const tailored = (over: Partial<TailoredResume> = {}): TailoredResume => ({
  headline: "Backend engineer for payments",
  summary: "Backend engineer who builds payment APIs in Node.js and PostgreSQL.",
  skills: ["PostgreSQL", "node.js", "Node.js", "Kubernetes"],
  experience: [
    { id: "e1", bullets: ["Built Node.js payment APIs on PostgreSQL handling 2 million requests a day", "Reduced p95 latency by 40%"] },
    { id: "e2", bullets: ["Wrote ETL scripts in Python"] },
  ],
  projects: [{ id: "p1", bullets: ["Built an open-source double-entry ledger in TypeScript"] }],
  coverLetter: "I build payment APIs at Acme Pay. I would like to do the same for your team.",
  ...over,
});

describe("truth rules", () => {
  it("passes faithful rewording and normalises skills to the profile", () => {
    const { resume, issues } = ruleCheck(tailored(), profile);
    expect(resume.skills).toEqual(["PostgreSQL", "Node.js"]);
    expect(issues).toEqual([{ where: "skills", text: "Kubernetes", reason: "Not a skill in your profile", action: "removed" }]);
    expect(resume.experience[0].bullets).toHaveLength(2);
  });

  it("removes invented numbers and technologies, per entry", () => {
    const { resume, issues } = ruleCheck(
      tailored({
        experience: [
          {
            id: "e1",
            bullets: ["Served 5 million requests a day", "Ran the APIs on Kubernetes", "Used Python for tooling", "Reduced p95 latency by 40%"],
          },
          { id: "e2", bullets: ["Wrote ETL scripts in Python"] },
        ],
      }),
      profile,
    );
    expect(resume.experience[0].bullets).toEqual(["Reduced p95 latency by 40%"]);
    expect(issues.map((i) => i.reason)).toEqual([
      "Not a skill in your profile", // Kubernetes in the skills list
      "States 5, which isn't in your profile",
      "Mentions Kubernetes, which isn't in your profile",
      // Python is a real skill, but not one used at Acme Pay.
      "Mentions Python, which isn't in your profile",
    ]);
  });

  it("reverts an entry to the profile's bullets when nothing survives, and drops unknown entries", () => {
    const { resume, issues } = ruleCheck(
      tailored({
        experience: [
          { id: "e1", bullets: ["Led a team of 12"] },
          { id: "ghost", bullets: ["Worked at Google"] },
        ],
      }),
      profile,
    );
    expect(resume.experience).toEqual([{ id: "e1", bullets: profile.experience[0].bullets }]);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ where: "experience", text: "ghost", action: "removed" }),
        expect.objectContaining({ where: "experience Acme Pay", text: "Led a team of 12", action: "reverted" }),
      ]),
    );
  });

  it("checks the summary against the whole profile and owner facts", () => {
    const r = tailored({ summary: "Engineer with 3 years of experience in Go." });
    expect(ruleCheck(r, profile, "Years of experience: 3").resume.summary).toBe(profile.summary);
    const ok = tailored({ summary: "Engineer with 3 years of experience." });
    expect(ruleCheck(ok, profile, "Years of experience: 3").resume.summary).toBe(ok.summary);
  });

  it("lets only the cover letter name the employer and the role", () => {
    const r = tailored({
      coverLetter: "The Platform Engineer II role at ClickHouse fits my work on payment APIs.",
      experience: [{ id: "e1", bullets: ["Built payment APIs for ClickHouse"] }],
    });
    const { resume, issues } = ruleCheck(r, profile, "", { company: "ClickHouse", title: "Platform Engineer II" });
    expect(resume.coverLetter).toBe(r.coverLetter);
    expect(issues.map((i) => i.where)).toEqual(["skills", "experience Acme Pay"]);
    expect(ruleCheck(r, profile).resume.coverLetter).toBe("");
  });

  it("applies Claude's flags, removing cover letter sentences", () => {
    const r = tailored();
    const keys = claims(r, profile).map((c) => c.key);
    expect(keys).toEqual(["headline", "summary", "experience:e1:0", "experience:e1:1", "experience:e2:0", "projects:p1:0", "cover:0", "cover:1"]);
    const issues: TruthIssue[] = [];
    const out = applyRejections(
      r,
      profile,
      new Map([
        ["cover:0", "Not stated"],
        ["headline", "Overstated"],
      ]),
      issues,
    );
    expect(out.coverLetter).toBe("I would like to do the same for your team.");
    expect(out.headline).toBe(profile.headline);
    expect(issues.map((i) => i.action)).toEqual(["reverted", "removed"]);
    expect(sentences("One. Two!\nThree")).toEqual(["One.", "Two!", "Three"]);
  });
});

describe("resume html", () => {
  it("renders facts from the profile and escapes text", () => {
    const html = resumeHtml(profile, tailored({ experience: [{ id: "e1", bullets: ["A <b>bold</b> claim"] }] }));
    expect(html).toContain("Sam Rivera");
    expect(html).toContain("<strong>Software Engineer</strong>, Acme Pay");
    expect(html).toContain("Jan 2023 – Present");
    expect(html).toContain("A &lt;b&gt;bold&lt;/b&gt; claim");
    // An entry the tailoring left out keeps its own bullets.
    expect(html).toContain("Wrote Python ETL scripts");
    expect(html).toContain("github.com/sam/ledger");
    expect(formatMonth("2022-08")).toBe("Aug 2022");
    expect(formatMonth("2021")).toBe("2021");
    const letter = coverLetterHtml(profile, "Para one.\n\nPara two.", "Stripe", new Date("2026-10-19T00:00:00Z"));
    expect(letter).toContain("Dear Stripe hiring team,");
    expect(letter).toContain("<p>Para two.</p>");
    expect(letter).toContain("19 October 2026");
  });
});

const cand = (over: Partial<Candidate>): Candidate => ({
  jobId: 1,
  searchId: "s1",
  companyId: 1,
  company: "Acme",
  title: "Engineer",
  ruleScore: 80,
  reviewScore: null,
  verdict: null,
  dealbreaker: null,
  firstSeenAt: "2026-10-19T00:00:00Z",
  ...over,
});
const search = (id: string, minMatch = 70) => ({
  id,
  name: id,
  enabled: true,
  titles: [],
  seniority: [],
  employmentTypes: [],
  excludeKeywords: [],
  minMatch,
  mode: "review" as const,
});

describe("selection", () => {
  const caps = { maxPerCompany: 2, dailyLimit: 3 };
  it("respects the bar, dealbreakers, verdicts and the per-company and daily caps", () => {
    const cands = [
      cand({ jobId: 1, ruleScore: 90 }),
      cand({ jobId: 2, ruleScore: 85 }),
      cand({ jobId: 3, ruleScore: 84 }), // third at Acme: over the company cap
      cand({ jobId: 4, companyId: 2, ruleScore: 60 }), // under the bar
      cand({ jobId: 5, companyId: 3, ruleScore: 95, dealbreaker: "Requires US citizenship" }),
      cand({ jobId: 6, companyId: 4, ruleScore: 75 }),
      cand({ jobId: 7, companyId: 5, ruleScore: 74 }), // over the daily limit
    ];
    const { picks, capped } = selectJobs(cands, [search("s1")], caps, { perCompany: new Map(), today: 0 }, false);
    expect(picks.map((p) => p.jobId)).toEqual([1, 2, 6]);
    expect(capped).toEqual({ company: 1, daily: 1 });
  });

  it("counts earlier applications and prefers Claude's score when it requires one", () => {
    const cands = [
      cand({ jobId: 1, ruleScore: 90, reviewScore: 60, verdict: "stretch" }),
      cand({ jobId: 2, ruleScore: 72, reviewScore: 88, verdict: "strong" }),
      cand({ jobId: 3, companyId: 2, ruleScore: 95 }), // not reviewed yet
      cand({ jobId: 4, companyId: 3, ruleScore: 80, reviewScore: 80, verdict: "poor" }),
    ];
    const usage = { perCompany: new Map([[1, 1]]), today: 1 };
    const { picks, waiting } = selectJobs(cands, [search("s1")], caps, usage, true);
    expect(picks).toEqual([expect.objectContaining({ jobId: 2, score: 88, reason: "s1: Claude scored 88 (bar 70)" })]);
    expect(waiting).toBe(1);
  });

  it("takes a job once across searches and skips disabled searches", () => {
    const cands = [cand({ jobId: 1, searchId: "a", ruleScore: 80 }), cand({ jobId: 1, searchId: "b", ruleScore: 90 }), cand({ jobId: 2, searchId: "off" })];
    const { picks } = selectJobs(cands, [search("a"), search("b"), { ...search("off"), enabled: false }], caps, { perCompany: new Map(), today: 0 }, false);
    expect(picks.map((p) => [p.jobId, p.searchId])).toEqual([[1, "b"]]);
  });
});
