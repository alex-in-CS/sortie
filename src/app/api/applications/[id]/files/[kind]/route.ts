import fs from "node:fs";
import path from "node:path";
import { coverLetterFile, getApplication } from "@/lib/applications";
import { DATA_DIR } from "@/lib/db";

const TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
};

// Serves an application's resume (yours as uploaded, or tailored), its cover
// letter PDF, or the screenshot of its filled form.
export async function GET(_req: Request, ctx: RouteContext<"/api/applications/[id]/files/[kind]">) {
  const { id, kind } = await ctx.params;
  const app = getApplication(Number(id));
  const rel =
    kind === "resume"
      ? app?.resume_file
      : kind === "cover-letter"
        ? app?.resume_file && coverLetterFile(app.resume_file)
        : kind === "form"
          ? app?.screenshot
          : null;
  if (!rel) return Response.json({ error: "Not found." }, { status: 404 });
  const file = path.join(DATA_DIR, rel);
  // Paths come from our own rows, but never serve outside the data folder.
  if (!path.resolve(file).startsWith(path.resolve(DATA_DIR) + path.sep) || !fs.existsSync(file))
    return Response.json({ error: "Not found." }, { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(file)), {
    headers: {
      "content-type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream",
      "content-disposition": `inline; filename="${path.basename(file)}"`,
      "cache-control": "no-store",
    },
  });
}
