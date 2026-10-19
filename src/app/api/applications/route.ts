import type { NextRequest } from "next/server";
import * as z from "zod";
import { createApplication, openMatchScore, reviewsFor } from "@/lib/applications";
import { enqueue } from "@/lib/jobs";
import { searchesStore } from "@/lib/store";

const Body = z.object({ jobId: z.number().int().positive(), searchId: z.string().min(1) });

// Apply to one job by hand, from the Jobs page. It skips the bar and the caps
// (you chose it), though it still counts toward them. The worker tailors it next.
export async function POST(req: NextRequest) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const { jobId, searchId } = body.data;
  const search = searchesStore.get().value.find((s) => s.id === searchId);
  const ruleScore = openMatchScore(jobId, searchId);
  if (!search || ruleScore === undefined) return Response.json({ error: "That job isn't open in this search." }, { status: 404 });
  const score = reviewsFor(searchId, [jobId]).get(jobId)?.score ?? ruleScore;
  const { id, created } = createApplication({
    jobId,
    searchId,
    origin: "manual",
    score,
    mode: search.mode,
    reason: `Picked by you from ${search.name}`,
  });
  if (created) enqueue("prepare");
  return Response.json({ id, created }, { status: created ? 201 : 200 });
}
