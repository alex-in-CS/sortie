import type { NextRequest } from "next/server";
import * as z from "zod";
import { saveAnswers } from "@/lib/apply/answers";
import { actOnApplication, getApplication } from "@/lib/applications";
import { enqueue } from "@/lib/jobs";

const Body = z.object({
  answers: z.array(z.object({ key: z.string().min(1), answer: z.array(z.string().max(4000)).max(100) })).max(100),
});

// Your answers to a form's open questions: saved to the answer bank, then the
// form is filled again with them.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/applications/[id]/answers">) {
  const id = Number((await ctx.params).id);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!Number.isInteger(id) || !body.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const app = getApplication(id);
  if (!app) return Response.json({ error: "No such application." }, { status: 404 });
  if (!app.plan) return Response.json({ error: "Sortie hasn't read this form yet." }, { status: 409 });
  const saved = saveAnswers(app, body.data.answers);
  if (!saved) return Response.json({ error: "None of those answers fit the questions." }, { status: 400 });
  const result = actOnApplication(id, "refill");
  if ("error" in result) return Response.json({ error: result.error }, { status: result.code });
  enqueue("prepare");
  return Response.json({ id, saved, ...result });
}
