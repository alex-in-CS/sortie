import type { NextRequest } from "next/server";
import * as z from "zod";
import { actOnApplication, APPLICATION_ACTIONS } from "@/lib/applications";
import { enqueue } from "@/lib/jobs";

const Body = z.object({ action: z.enum(APPLICATION_ACTIONS) });

// Skip, restore or re-tailor one application.
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/applications/[id]">) {
  const id = Number((await ctx.params).id);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!Number.isInteger(id) || !body.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const result = actOnApplication(id, body.data.action);
  if ("error" in result) return Response.json({ error: result.error }, { status: result.code });
  if (result.status === "queued") enqueue("prepare");
  return Response.json({ id, ...result });
}
