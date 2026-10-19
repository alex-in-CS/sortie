import type { NextRequest } from "next/server";
import * as z from "zod";
import { setCompanyEnabled } from "@/lib/jobs";

const Body = z.object({ enabled: z.boolean() });

// Switch one company on or off. Off = not fetched and hidden from matches.
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/companies/[id]">) {
  const id = Number((await ctx.params).id);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!Number.isInteger(id) || !body.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  if (!setCompanyEnabled(id, body.data.enabled)) return Response.json({ error: "No such company." }, { status: 404 });
  return Response.json({ id, enabled: body.data.enabled });
}
