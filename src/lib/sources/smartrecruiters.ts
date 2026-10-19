import { fetchJson } from "./http";
import { employmentTypeFrom, htmlToText, isoDate, upperCodes } from "./text";
import type { Source, SourceJob } from "./types";

// https://developers.smartrecruiters.com/docs/posting-api — public, no key.
// The list has no description; detail() fetches it for jobs that survive the title filter.
type SrPosting = {
  id: string;
  name: string;
  releasedDate?: string;
  location?: {
    city?: string;
    region?: string;
    country?: string;
    remote?: boolean;
    hybrid?: boolean;
    fullLocation?: string;
  };
  department?: { label?: string };
  function?: { label?: string };
  typeOfEmployment?: { label?: string };
  experienceLevel?: { label?: string };
};
type SrDetail = SrPosting & {
  postingUrl?: string;
  applyUrl?: string;
  jobAd?: { sections?: Record<string, { title?: string; text?: string }> };
};

const PAGE = 100;
const base = (board: string) => `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board)}/postings`;

export const smartrecruiters: Source = {
  provider: "smartrecruiters",
  async list(board, opts = {}) {
    const limit = opts.limit ?? 1000;
    const out: SourceJob[] = [];
    for (let offset = 0; out.length < limit; offset += PAGE) {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (opts.query) params.set("q", opts.query);
      const page = await fetchJson<{ totalFound: number; content: SrPosting[] }>(`${base(board)}?${params}`);
      out.push(...page.content.filter((p) => p?.id && p.name).map((p) => toJob(board, p)));
      if (page.content.length < PAGE || offset + PAGE >= page.totalFound) break;
    }
    return out.slice(0, limit);
  },
  async detail(board, job) {
    const d = await fetchJson<SrDetail>(`${base(board)}/${encodeURIComponent(job.providerJobId)}`);
    const sections = Object.values(d.jobAd?.sections ?? {})
      .filter((s) => s.text)
      .map((s) => [s.title, htmlToText(s.text ?? "")].filter(Boolean).join("\n"));
    return {
      description: sections.join("\n\n") || null,
      url: d.postingUrl ?? job.url,
      applyUrl: d.applyUrl ?? job.applyUrl,
    };
  },
};

function toJob(board: string, p: SrPosting): SourceJob {
  const loc = p.location ?? {};
  return {
    providerJobId: p.id,
    title: p.name.trim(),
    location: loc.fullLocation ?? [loc.city, loc.region, loc.country?.toUpperCase()].filter(Boolean).join(", "),
    countryCodes: upperCodes(loc.country),
    workMode: loc.remote ? "remote" : loc.hybrid ? "hybrid" : loc.city ? "onsite" : null,
    employmentType: employmentTypeFrom(p.typeOfEmployment?.label),
    department: p.department?.label ?? p.function?.label ?? null,
    level: p.experienceLevel?.label ?? null,
    description: null,
    url: `https://jobs.smartrecruiters.com/${encodeURIComponent(board)}/${p.id}`,
    applyUrl: null,
    postedAt: isoDate(p.releasedDate),
    salary: null,
  };
}
