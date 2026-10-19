import { fetchJson, postJson } from "./http";
import { employmentTypeFrom, htmlToText, parsePostedOn, upperCodes, workModeFrom } from "./text";
import type { Source, SourceJob } from "./types";

// Workday's career sites are backed by an undocumented JSON API ("cxs") that the
// public page itself calls. Board id format: "{tenant}.{wdN}/{site}",
// e.g. "nvidia.wd5/NVIDIAExternalCareerSite". The list has no description, so
// detail() fetches it for jobs that survive the title filter. Applying on
// Workday always needs an account, so these jobs are handed off (D-013).
type WdPosting = { title: string; externalPath: string; locationsText?: string; postedOn?: string; bulletFields?: string[] };
type WdDetail = {
  jobPostingInfo: {
    title: string;
    jobDescription?: string;
    location?: string;
    additionalLocations?: string[];
    timeType?: string;
    remoteType?: string;
    externalUrl?: string;
    country?: { alpha2Code?: string; descriptor?: string };
    jobRequisitionLocation?: { country?: { alpha2Code?: string } };
  };
};

const PAGE = 20; // the API rejects larger pages

export function parseWorkdayBoard(board: string) {
  const m = /^([a-z0-9-]+)\.(wd\d+)\/([^/?#]+)$/i.exec(board.trim());
  if (!m) throw new Error(`Workday board must look like "tenant.wd5/Site", got "${board}"`);
  const [, tenant, wd, site] = m;
  const origin = `https://${tenant}.${wd}.myworkdayjobs.com`;
  return { origin, api: `${origin}/wday/cxs/${tenant}/${site}`, site: `${origin}/${site}` };
}

export const workday: Source = {
  provider: "workday",
  async list(board, opts = {}) {
    const { api, site } = parseWorkdayBoard(board);
    const limit = opts.limit ?? 400;
    const out: SourceJob[] = [];
    let total = Infinity;
    for (let offset = 0; out.length < limit && offset < total; offset += PAGE) {
      const page = await postJson<{ total: number; jobPostings: WdPosting[] }>(`${api}/jobs`, {
        appliedFacets: {},
        limit: PAGE,
        offset,
        searchText: opts.query ?? "",
      });
      // Only the first page carries a reliable total.
      if (offset === 0) total = page.total;
      if (!page.jobPostings?.length) break;
      // Workday occasionally returns placeholder rows without a title or path.
      out.push(...page.jobPostings.filter((p) => p?.title && p.externalPath).map((p) => toJob(site, p)));
    }
    return out.slice(0, limit);
  },
  async detail(board, job) {
    const { api } = parseWorkdayBoard(board);
    const pathname = new URL(job.url).pathname;
    const path = pathname.slice(pathname.indexOf("/job/")); // drop the locale and site segments
    const { jobPostingInfo: i } = await fetchJson<WdDetail>(`${api}${path}`);
    const locations = [i.location, ...(i.additionalLocations ?? [])].filter(Boolean);
    return {
      description: i.jobDescription ? htmlToText(i.jobDescription) : null,
      location: locations.join("; ") || job.location,
      countryCodes: upperCodes(i.country?.alpha2Code, i.jobRequisitionLocation?.country?.alpha2Code),
      workMode: workModeFrom(i.remoteType) ?? job.workMode,
      employmentType: employmentTypeFrom(i.timeType) ?? job.employmentType,
      url: i.externalUrl ?? job.url,
    };
  },
};

function toJob(site: string, p: WdPosting): SourceJob {
  const url = `${site}${p.externalPath}`;
  return {
    // The requisition suffix ("_JR2026102-1") is stable; the title slug before it isn't.
    providerJobId: /_([^_/]+)$/.exec(p.externalPath)?.[1] ?? p.externalPath,
    title: p.title.trim(),
    location: p.locationsText ?? "",
    countryCodes: [],
    workMode: workModeFrom(p.locationsText),
    employmentType: null,
    department: null,
    level: null,
    description: null,
    url,
    applyUrl: url,
    postedAt: parsePostedOn(p.postedOn),
    salary: null,
  };
}
