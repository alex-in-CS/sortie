// Debug one board through its real adapter: npx tsx scripts/probe-board.ts workday accenture.wd103/AccentureCareers software
import { SOURCES, type Provider } from "../src/lib/sources";

const [provider, board, query] = process.argv.slice(2) as [Provider, string, string | undefined];
if (!SOURCES[provider] || !board) {
  console.error("Usage: npx tsx scripts/probe-board.ts <provider> <board> [query]");
  process.exit(1);
}
async function main() {
  const jobs = await SOURCES[provider].list(board, { query, limit: 200 });
  console.log(`${jobs.length} jobs`);
  for (const j of jobs.slice(0, 5)) console.log(`- ${j.title} | ${j.location} | ${j.postedAt ?? "?"} | ${j.url}`);
  if (SOURCES[provider].detail && jobs[0]) {
    const d = await SOURCES[provider].detail!(board, jobs[0]);
    console.log("detail:", { ...d, description: d.description?.slice(0, 160) });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
