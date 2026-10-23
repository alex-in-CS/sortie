import type { NextRequest } from "next/server";
import * as z from "zod";
import { actOnApplication, APPLICATION_ACTIONS } from "@/lib/applications";
import { archiveApplication } from "@/lib/archive";
import { enqueue } from "@/lib/jobs";

const Body = z.object({ action: z.enum(APPLICATION_ACTIONS) });

// The owner's controls on one application (see actOnApplication).
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/applications/[id]">) {
  const id = Number((await ctx.params).id);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!Number.isInteger(id) || !body.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const result = actOnApplication(id, body.data.action);
  if ("error" in result) return Response.json({ error: result.error }, { status: result.code });
  if (result.status === "queued" || result.status === "ready") enqueue("prepare");
  if (result.status === "submitting") enqueue("handoff");
  // You sent it yourself: keep the same record as one Sortie sent (D-060).
  if (result.status === "submitted") {
    try {
      archiveApplication(id);
    } catch {}
  }
  return Response.json({ id, ...result });
}
