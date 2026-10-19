import { enqueue, lastTask } from "@/lib/jobs";

// Asks the worker for a fetch now. The worker (npm run worker) picks it up
// within ~30 s; the UI says so when no worker has run recently.
export async function POST() {
  const { id, created } = enqueue("fetch");
  return Response.json({ id, created, task: lastTask("fetch") });
}

export async function GET() {
  return Response.json({ task: lastTask("fetch") ?? null });
}
