// Builds src/lib/registry/companies.json from scripts/candidates.txt and
// scripts/enterprise.json. A board is kept only if a live call returns open
// jobs including at least one software role, so the registry never holds
// guesses. Run: npm run registry:verify  (takes a few minutes; polite rates).
import fs from "node:fs";
import path from "node:path";
import { isSoftwareRole } from "../src/lib/match";
import { SOURCES, type Provider } from "../src/lib/sources";
import { fetchJson, HttpError } from "../src/lib/sources/http";

type Verified = {
  name: string;
  provider: Provider;
  board: string;
  careersUrl: string | null;
  jobs: number;
  softwareJobs: number;
  sample: string;
};
type Unsupported = { name: string; ats: string; careersUrl: string | null; note?: string };
type Enterprise = { company: string; provider: Provider | "unsupported"; board: string | null; careersUrl?: string; ats?: string; note?: string };

const ROOT = process.cwd(); // npm runs scripts from the repo root
const OUT = path.join(ROOT, "src/lib/registry/companies.json");

// Title-only probes: cheaper than the adapters, which pull full descriptions.
const PROBES: Record<"greenhouse" | "ashby" | "lever", (slug: string) => Promise<{ titles: string[]; sample: string }>> = {
  async greenhouse(slug) {
    const d = await fetchJson<{ jobs: { title: string; absolute_url: string }[] }>(
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
    );
    return { titles: d.jobs.map((j) => j.title), sample: d.jobs[0]?.absolute_url ?? "" };
  },
  async ashby(slug) {
    const d = await fetchJson<{ jobs: { title: string; jobUrl: string; isListed?: boolean }[] }>(
      `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
    );
    const jobs = d.jobs.filter((j) => j.isListed !== false);
    return { titles: jobs.map((j) => j.title), sample: jobs[0]?.jobUrl ?? "" };
  },
  async lever(slug) {
    const d = await fetchJson<{ text: string; hostedUrl: string }[]>(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    return { titles: d.map((j) => j.text), sample: d[0]?.hostedUrl ?? "" };
  },
};

const slugsFor = (name: string, given: string[]) =>
  given.length
    ? given
    : [...new Set([name.toLowerCase().replace(/[^a-z0-9]/g, ""), name.toLowerCase().replace(/[^a-z0-9]+/g, "-")])];

async function probeCandidate(name: string, given: string[]): Promise<Verified | null> {
  for (const provider of ["greenhouse", "ashby", "lever"] as const) {
    for (const slug of slugsFor(name, given)) {
      try {
        const { titles, sample } = await PROBES[provider](slug);
        if (!titles.length) continue;
        const softwareJobs = titles.filter(isSoftwareRole).length;
        if (!softwareJobs) continue;
        return { name, provider, board: slug, careersUrl: null, jobs: titles.length, softwareJobs, sample };
      } catch (err) {
        if (!(err instanceof HttpError) || ![400, 404, 410].includes(err.status))
          console.warn(`  ${name} ${provider}/${slug}: ${(err as Error).message}`);
      }
    }
  }
  return null;
}

async function verifyEnterprise(e: Enterprise): Promise<Verified | null> {
  if (e.provider === "unsupported" || !e.board) return null;
  try {
    const jobs = await SOURCES[e.provider].list(e.board, { limit: 100 });
    const softwareJobs = jobs.filter((j) => isSoftwareRole(j.title)).length;
    if (!jobs.length) return null;
    return {
      name: e.company,
      provider: e.provider,
      board: e.board,
      careersUrl: e.careersUrl ?? null,
      jobs: jobs.length,
      softwareJobs,
      sample: jobs[0].url,
    };
  } catch (err) {
    console.warn(`  ${e.company} ${e.provider}/${e.board}: ${(err as Error).message}`);
    return null;
  }
}

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function main() {
  const lines = fs
    .readFileSync(path.join(ROOT, "scripts/candidates.txt"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const candidates = [
    ...new Map(
      lines.map((l) => {
        const [name, slugs = ""] = l.split("|").map((s) => s.trim());
        return [name.toLowerCase(), { name, slugs: slugs.split(",").map((s) => s.trim()).filter(Boolean) }];
      }),
    ).values(),
  ];
  const enterprisePath = path.join(ROOT, "scripts/enterprise.json");
  const enterprise: Enterprise[] = fs.existsSync(enterprisePath) ? JSON.parse(fs.readFileSync(enterprisePath, "utf8")) : [];

  console.log(`Probing ${candidates.length} candidates and ${enterprise.length} enterprise entries…`);
  let done = 0;
  const found = await pool(candidates, 6, async (c) => {
    const v = await probeCandidate(c.name, c.slugs);
    if (++done % 25 === 0) console.log(`  ${done}/${candidates.length}`);
    return v;
  });
  const ent = await pool(enterprise, 3, verifyEnterprise);

  const companies = [...found, ...ent].filter((v): v is Verified => !!v);
  const dedup = [...new Map(companies.map((c) => [`${c.provider}:${c.board}`, c])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const covered = new Set(dedup.map((c) => c.name.toLowerCase()));
  const missed = candidates.filter((c) => !covered.has(c.name.toLowerCase())).map((c) => c.name);
  const unsupported: Unsupported[] = enterprise
    .filter((e) => e.provider === "unsupported" || !ent.some((v) => v?.name === e.company && v.board === e.board))
    .filter((e) => !dedup.some((c) => c.name === e.company))
    .map((e) => ({ name: e.company, ats: e.ats ?? "unknown", careersUrl: e.careersUrl ?? null, note: e.note }));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    JSON.stringify({ verifiedAt: new Date().toISOString(), companies: dedup, unsupported, notFound: missed }, null, 1) + "\n",
  );
  const by = dedup.reduce<Record<string, number>>((m, c) => ((m[c.provider] = (m[c.provider] ?? 0) + 1), m), {});
  console.log(`Verified ${dedup.length} boards`, by, `· unsupported ${unsupported.length} · not found ${missed.length}`);
  console.log(`Wrote ${path.relative(ROOT, OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
