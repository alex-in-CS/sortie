import { fetchJson } from "./http";
import { decodeEntities, htmlToText, isoDate, workModeFrom } from "./text";
import type { Source, SourceJob } from "./types";

// https://developers.greenhouse.io/job-board.html — public, no key.
type GhJob = {
  id: number;
  title: string;
  absolute_url: string;
  location: { name: string } | null;
  updated_at: string | null;
  first_published?: string | null;
  content?: string; // HTML, entity-escaped once more
  departments?: { name: string }[];
  offices?: { name: string }[];
};

export const greenhouse: Source = {
  provider: "greenhouse",
  async list(board, opts = {}) {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`;
    const data = await fetchJson<{ jobs: GhJob[] }>(url);
    return data.jobs
      .filter((j) => j?.id && j.title && j.absolute_url)
      .slice(0, opts.limit ?? Infinity)
      .map(toJob);
  },
};

function toJob(j: GhJob): SourceJob {
  const location = j.location?.name?.trim() || j.offices?.map((o) => o.name).join(", ") || "";
  return {
    providerJobId: String(j.id),
    title: j.title.trim(),
    location,
    countryCodes: [],
    workMode: workModeFrom(location),
    employmentType: null,
    department: j.departments?.[0]?.name ?? null,
    level: null,
    description: j.content ? htmlToText(decodeEntities(j.content)) : null,
    url: j.absolute_url,
    applyUrl: j.absolute_url,
    postedAt: isoDate(j.first_published ?? j.updated_at),
    salary: null,
  };
}
