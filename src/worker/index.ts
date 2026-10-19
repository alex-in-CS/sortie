// The background worker (D-033): owns the schedule and runs queued tasks.
//   npm run worker   keep running; fetch every SORTIE_FETCH_HOURS (default 2)
//   npm run fetch    run one cycle now (fetch, match, review, select, tailor) and exit
// It runs under Node with the "react-server" condition so `server-only`
// imports in src/lib resolve to no-ops outside Next.
import fs from "node:fs";
import path from "node:path";

const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

// Loaded after the env file, since some modules read process.env at import.
const lib = async () => ({
  ...(await import("../lib/jobs")),
  ...(await import("../lib/pipeline")),
  ...(await import("../lib/autopilot")),
  ...(await import("../lib/applications")),
  ...(await import("../lib/pdf")),
});
type Lib = Awaited<ReturnType<typeof lib>>;

const HOURS = Number(process.env.SORTIE_FETCH_HOURS) || 2;
const TICK_MS = 30_000;
const log = (line: string) => console.log(`${new Date().toLocaleTimeString("en-GB")} ${line}`);

type Task = NonNullable<ReturnType<Lib["claimTask"]>>;

async function run({ runCycle, matchAll, prepare }: Lib, task: Task): Promise<object> {
  switch (task.type) {
    case "fetch":
      return runCycle(log);
    case "match":
      return matchAll();
    // Review, select and tailor without fetching: queued when you pick a job by hand.
    case "prepare":
      return prepare(log);
    default:
      throw new Error(`Unknown task type "${task.type}"`);
  }
}

// Queue the next fetch when the last one finished more than HOURS ago, with
// ±10% jitter so the boards don't see a fixed beat.
function schedule({ lastTask, enqueue }: Lib) {
  const last = lastTask("fetch");
  if (last && (last.status === "queued" || last.status === "running")) return;
  const finished = last?.finished_at ? new Date(last.finished_at).getTime() : 0;
  const gap = HOURS * 3_600_000 * (0.9 + Math.random() * 0.2);
  if (Date.now() - finished >= gap) enqueue("fetch");
}

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    if (stopping) process.exit(1);
    stopping = true;
    log("Stopping after the current task (Ctrl+C again to force).");
  });

async function main() {
  const l = await lib();
  const { claimTask, failTask, finishTask, requeueStale, requeueTailoring, runCycle, closePdf } = l;
  const stale = requeueStale();
  if (stale) log(`Requeued ${stale} task(s) left running by a previous crash.`);
  const tailoring = Number(requeueTailoring().changes);
  if (tailoring) log(`Requeued ${tailoring} application(s) left mid-tailoring.`);

  if (process.argv.includes("--once")) {
    const task = l.startTask("fetch", { once: true });
    try {
      const r = await runCycle(log);
      finishTask(task.id, r);
      log(`Done in ${r.seconds}s: ${r.companies} boards, +${r.added} new, ${r.closed} closed, ${r.failed.length} failed, ${r.resting.length} resting.`);
    } catch (err) {
      failTask({ ...task, attempts: 99 }, (err as Error).message);
      throw err;
    } finally {
      await closePdf();
    }
    return;
  }

  log(`Worker started. Fetching every ~${HOURS} h.`);
  while (!stopping) {
    schedule(l);
    const task = claimTask();
    if (!task) {
      await new Promise((r) => setTimeout(r, TICK_MS));
      continue;
    }
    log(`Task ${task.id} (${task.type}) started, attempt ${task.attempts}.`);
    try {
      const result = await run(l, task);
      finishTask(task.id, result);
      log(`Task ${task.id} (${task.type}) done.`);
    } catch (err) {
      failTask(task, (err as Error).message);
      log(`Task ${task.id} (${task.type}) failed: ${(err as Error).message}`);
    } finally {
      // Chrome only runs while documents are being made.
      await closePdf();
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
