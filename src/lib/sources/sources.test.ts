import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SOURCES } from ".";
import { htmlToText, parsePostedOn } from "./text";
import { parseWorkdayBoard } from "./workday";

// Contract tests on trimmed real responses (recorded 2026-10-19), so a
// provider changing its shape shows up here rather than as silent empty boards.
const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", `${name}.json`), "utf8"));

function mockFetch(routes: [RegExp, unknown][]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(hit[1]), { status: 200, headers: { "content-type": "application/json" } });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("greenhouse", () => {
  it("normalises jobs and decodes the double-escaped HTML", async () => {
    const calls = mockFetch([[/boards-api\.greenhouse\.io\/v1\/boards\/stripe\/jobs\?content=true/, fixture("greenhouse")]]);
    const jobs = await SOURCES.greenhouse.list("stripe");
    expect(jobs).toHaveLength(2);
    const j = jobs[0];
    expect(j.providerJobId).toMatch(/^\d+$/);
    expect(j.title).toBe("Abuse Research Engineer");
    expect(j.url).toContain("stripe.com/jobs");
    expect(j.description).not.toMatch(/&lt;|<h2>/);
    expect(j.description!.length).toBeGreaterThan(100);
    expect(j.postedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(calls[0].init?.headers).toMatchObject({ "user-agent": expect.stringContaining("Sortie") });
  });
});

describe("lever", () => {
  it("maps commitment, workplace, country and lists", async () => {
    mockFetch([[/api\.lever\.co\/v0\/postings\/palantir/, fixture("lever")]]);
    const [j] = await SOURCES.lever.list("palantir");
    expect(j.title).toBe("Backend Software Engineer - Application Development");
    expect(j.employmentType).toBe("full-time");
    expect(j.countryCodes.every((c) => /^[A-Z]{2}$/.test(c))).toBe(true);
    expect(j.applyUrl).toMatch(/\/apply$/);
    expect(j.description).toBeTruthy();
  });
});

describe("ashby", () => {
  it("skips unlisted jobs and resolves countries from the address", async () => {
    mockFetch([[/api\.ashbyhq\.com\/posting-api\/job-board\/notion/, fixture("ashby")]]);
    const jobs = await SOURCES.ashby.list("notion");
    expect(jobs.map((j) => j.providerJobId)).not.toContain("unlisted-1");
    const j = jobs[0];
    expect(j.workMode).toBe("hybrid");
    expect(j.employmentType).toBe("full-time");
    expect(j.countryCodes).toContain("US");
    expect(j.location).toContain("New York");
  });
});

describe("smartrecruiters", () => {
  it("lists without descriptions, then fills one from detail()", async () => {
    const calls = mockFetch([
      [/postings\/744000156284975$/, fixture("smartrecruiters-detail")],
      [/companies\/BoschGroup\/postings\?/, fixture("smartrecruiters")],
    ]);
    const jobs = await SOURCES.smartrecruiters.list("BoschGroup", { query: "software" });
    expect(calls[0].url).toContain("q=software");
    expect(jobs[0]).toMatchObject({ providerJobId: "744000156284975", countryCodes: ["CN"], description: null, level: "Associate" });
    expect(jobs[1].employmentType).toBe("full-time");
    const d = await SOURCES.smartrecruiters.detail!("BoschGroup", jobs[0]);
    expect(d.description).toContain("Qualifications");
    expect(d.applyUrl).toContain("jobs.smartrecruiters.com");
  });
});

describe("workday", () => {
  it("parses the board id", () => {
    expect(parseWorkdayBoard("nvidia.wd5/NVIDIAExternalCareerSite")).toEqual({
      origin: "https://nvidia.wd5.myworkdayjobs.com",
      api: "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite",
      site: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
    });
    expect(() => parseWorkdayBoard("nvidia")).toThrow(/tenant\.wd5\/Site/);
  });

  it("posts the search, builds public URLs, and fetches detail by path", async () => {
    const calls = mockFetch([
      [/\/wday\/cxs\/nvidia\/NVIDIAExternalCareerSite\/jobs$/, fixture("workday")],
      [/\/wday\/cxs\/nvidia\/NVIDIAExternalCareerSite\/job\//, fixture("workday-detail")],
    ]);
    const jobs = await SOURCES.workday.list("nvidia.wd5/NVIDIAExternalCareerSite", { query: "software", limit: 3 });
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({ searchText: "software", limit: 20, offset: 0 });
    expect(jobs).toHaveLength(3);
    expect(jobs[0].url).toMatch(/^https:\/\/nvidia\.wd5\.myworkdayjobs\.com\/NVIDIAExternalCareerSite\/job\//);
    expect(jobs[0].providerJobId).toMatch(/^JR\d+/);
    const d = await SOURCES.workday.detail!("nvidia.wd5/NVIDIAExternalCareerSite", jobs[0]);
    expect(calls.at(-1)!.url).toMatch(/\/wday\/cxs\/nvidia\/NVIDIAExternalCareerSite\/job\//);
    expect(d.countryCodes).toEqual(["IL"]);
    expect(d.employmentType).toBe("full-time");
    expect(d.description!.length).toBeGreaterThan(100);
  });
});

describe("malformed rows", () => {
  it("are skipped instead of failing the whole board", async () => {
    const wd = fixture("workday");
    mockFetch([[/\/jobs$/, { ...wd, total: 5, jobPostings: [{ bulletFields: [] }, ...wd.jobPostings, null] }]]);
    expect(await SOURCES.workday.list("acme.wd1/Ext", { limit: 10 })).toHaveLength(3);
    mockFetch([[/greenhouse/, { jobs: [{ id: 1 }, ...fixture("greenhouse").jobs] }]]);
    expect(await SOURCES.greenhouse.list("x")).toHaveLength(2);
  });
});

describe("text helpers", () => {
  it("turns HTML into readable text", () => {
    expect(htmlToText("<p>Hi&nbsp;there</p><ul><li>One</li><li>Two &amp; three</li></ul>")).toBe(
      "Hi there\n• One\n• Two & three",
    );
  });
  it("reads Workday's relative dates", () => {
    const now = new Date("2026-10-19T12:00:00Z");
    expect(parsePostedOn("Posted Today", now)).toBe("2026-10-19T12:00:00.000Z");
    expect(parsePostedOn("Posted Yesterday", now)).toBe("2026-10-18T12:00:00.000Z");
    expect(parsePostedOn("Posted 30+ Days Ago", now)).toBe("2026-09-19T12:00:00.000Z");
    expect(parsePostedOn("whenever", now)).toBeNull();
  });
});
