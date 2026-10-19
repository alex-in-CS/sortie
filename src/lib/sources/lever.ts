import { fetchJson } from "./http";
import { employmentTypeFrom, htmlToText, isoDate, upperCodes, workModeFrom } from "./text";
import type { Salary, Source, SourceJob } from "./types";

// https://github.com/lever/postings-api — public, no key.
type LeverJob = {
  id: string;
  text: string;
  categories: { commitment?: string; location?: string; team?: string; allLocations?: string[] };
  createdAt?: number;
  descriptionPlain?: string;
  lists?: { text: string; content: string }[];
  additionalPlain?: string;
  country?: string | null;
  workplaceType?: string | null; // onsite | hybrid | remote | unspecified
  hostedUrl: string;
  applyUrl?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
};

export const lever: Source = {
  provider: "lever",
  async list(board, opts = {}) {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(board)}?mode=json`;
    const data = await fetchJson<LeverJob[]>(url);
    return data
      .filter((j) => j?.id && j.text && j.hostedUrl)
      .slice(0, opts.limit ?? Infinity)
      .map(toJob);
  },
};

function toJob(j: LeverJob): SourceJob {
  const locations = j.categories.allLocations?.length ? j.categories.allLocations : [j.categories.location ?? ""];
  const lists = (j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`);
  return {
    providerJobId: j.id,
    title: j.text.trim(),
    location: locations.filter(Boolean).join("; "),
    countryCodes: upperCodes(j.country),
    workMode: workModeFrom(j.workplaceType) ?? workModeFrom(j.categories.location),
    employmentType: employmentTypeFrom(j.categories.commitment),
    department: j.categories.team ?? null,
    level: null,
    description: [j.descriptionPlain, ...lists, j.additionalPlain].filter(Boolean).join("\n\n").trim() || null,
    url: j.hostedUrl,
    applyUrl: j.applyUrl ?? j.hostedUrl,
    postedAt: isoDate(j.createdAt),
    salary: salary(j.salaryRange),
  };
}

function salary(r: LeverJob["salaryRange"]): Salary | null {
  if (!r?.currency || (r.min == null && r.max == null)) return null;
  const period = /hour/i.test(r.interval ?? "") ? "hour" : /month/i.test(r.interval ?? "") ? "month" : "year";
  return { min: r.min ?? null, max: r.max ?? null, currency: r.currency.toUpperCase(), period };
}
