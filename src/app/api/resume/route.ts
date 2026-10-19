import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR } from "@/lib/db";
import { SUPPORTED_RESUME_TYPES, describeError, parseResume } from "@/lib/llm";
import { mergeResume } from "@/lib/merge";
import { addDocument, getProfile, saveProfile } from "@/lib/store";

export const maxDuration = 300;

const MAX_BYTES = 10 * 1024 * 1024;

const mimeFromName = (name: string) =>
  ({
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".md": "text/markdown",
  })[path.extname(name).toLowerCase()];

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file uploaded." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Keep the resume under 10 MB." }, { status: 413 });

  const mime = mimeFromName(file.name) ?? file.type;
  if (!SUPPORTED_RESUME_TYPES.includes(mime)) {
    return Response.json({ error: "Upload a PDF, DOCX, TXT or Markdown file." }, { status: 415 });
  }

  const data = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = await parseResume({ data, mime, filename: file.name });
  } catch (err) {
    console.error("resume parse failed", err);
    return Response.json({ error: describeError(err) }, { status: 502 });
  }

  // Keep the original only once it has been read; later phases tailor from it.
  const id = randomUUID();
  const stored = path.join(UPLOAD_DIR, `${id}${path.extname(file.name).toLowerCase()}`);
  await fs.writeFile(stored, data);
  addDocument({ id, kind: "resume", filename: file.name, path: stored, mime });

  const { profile, added } = mergeResume(getProfile().value, parsed);
  const updatedAt = saveProfile(profile);
  return Response.json({ profile, added, updatedAt });
}
