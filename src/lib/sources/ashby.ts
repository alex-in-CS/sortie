import { countryCode } from "../geo";
import { fetchJson } from "./http";
import { employmentTypeFrom, isoDate, upperCodes, workModeFrom } from "./text";
import type { Salary, Source, SourceJob } from "./types";

// https://developers.ashbyhq.com/docs/public-job-posting-api — public, no key.
type Address = { postalAddress?: { addressCountry?: string; addressLocality?: string } };
type AshbyJob = {
  id: string;
  title: string;
  department?: string | null;
  team?: string | null;
  employmentType?: string | null; // FullTime | PartTime | Intern | Contract | Temporary
  location?: string | null;
  secondaryLocations?: { location: string; address?: Address }[];
  publishedAt?: string | null;
  isListed?: boolean;
  isRemote?: boolean | null;
  workplaceType?: string | null; // OnSite | Hybrid | Remote
  address?: Address | null;
  jobUrl: string;
  applyUrl?: string;
  descriptionPlain?: string | null;
  compensation?: {
    summaryComponents?: {
      compensationType?: string;
      interval?: string;
      currencyCode?: string | null;
      minValue?: number | null;
      maxValue?: number | null;
    }[];
  } | null;
};

export const ashby: Source = {
  provider: "ashby",
  async list(board, opts = {}) {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`;
    const data = await fetchJson<{ jobs: AshbyJob[] }>(url);
    return data.jobs
      .filter((j) => j?.id && j.title && j.jobUrl && j.isListed !== false)
      .slice(0, opts.limit ?? Infinity)
      .map(toJob);
  },
};

function toJob(j: AshbyJob): SourceJob {
  const locations = [j.location, ...(j.secondaryLocations ?? []).map((l) => l.location)].filter(Boolean);
  const countries = [j.address, ...(j.secondaryLocations ?? []).map((l) => l.address)].map((a) =>
    countryCode(a?.postalAddress?.addressCountry ?? ""),
  );
  return {
    providerJobId: j.id,
    title: j.title.trim(),
    location: locations.join("; "),
    countryCodes: upperCodes(...countries),
    workMode: workModeFrom(j.workplaceType) ?? (j.isRemote ? "remote" : null),
    employmentType: employmentTypeFrom(j.employmentType?.replace(/([a-z])([A-Z])/g, "$1 $2")),
    department: j.department ?? j.team ?? null,
    level: null,
    description: j.descriptionPlain?.trim() || null,
    url: j.jobUrl,
    applyUrl: j.applyUrl ?? j.jobUrl,
    postedAt: isoDate(j.publishedAt),
    salary: salary(j.compensation),
  };
}

function salary(c: AshbyJob["compensation"]): Salary | null {
  const s = c?.summaryComponents?.find((x) => /salary/i.test(x.compensationType ?? "") && x.currencyCode);
  if (!s?.currencyCode || (s.minValue == null && s.maxValue == null)) return null;
  const period = /hour/i.test(s.interval ?? "") ? "hour" : /month/i.test(s.interval ?? "") ? "month" : "year";
  return { min: s.minValue ?? null, max: s.maxValue ?? null, currency: s.currencyCode.toUpperCase(), period };
}
