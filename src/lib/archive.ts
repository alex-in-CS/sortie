import "server-only";
import fs from "node:fs";
import path from "node:path";
import { coverLetterFile, getApplication } from "./applications";
import { DATA_DIR } from "./db";
import { getJob } from "./jobs";

// A record of every application that went out, kept apart from the database
// so it survives a reset and reads without the app (D-060): one folder per
// application under data/applied/ with what was sent (the answers typed into
// each field, the resume and cover letter attached, the form before and after
// sending, the posting itself), plus one CSV line per application.

export const APPLIED_DIR = path.join(DATA_DIR, "applied");
const INDEX = path.join(APPLIED_DIR, "applications.csv");
const COLUMNS = ["submitted_at", "submitted_by", "company", "title", "location", "resume", "job_url", "apply_url", "folder"];

const slug = (s: string, max = 40) =>
  s
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, max) || "x";

const csv = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function copyIfThere(from: string | null, to: string) {
  if (!from) return false;
  const src = path.join(DATA_DIR, from);
  if (!fs.existsSync(src)) return false;
  fs.copyFileSync(src, to);
  return true;
}

// Writes the record for one submitted application and returns its folder
// (relative to the data folder), or null if it isn't submitted. Safe to call
// twice: the folder is rewritten, the CSV line isn't repeated.
export function archiveApplication(id: number): string | null {
  const app = getApplication(id);
  const job = app && getJob(app.job_id);
  if (!app || !job || app.status !== "submitted") return null;
  const at = app.submitted_at ?? new Date().toISOString();
  const name = `${at.slice(0, 10)}_${slug(job.company, 30)}_${slug(job.title)}_${app.id}`;
  const dir = path.join(APPLIED_DIR, name);
  const fresh = !fs.existsSync(dir);
  fs.mkdirSync(dir, { recursive: true });

  const resumeKind = app.resume ? "tailored" : app.resume_file ? "as uploaded" : "none recorded";
  const resumeOut = app.resume_file ? `resume${path.extname(app.resume_file)}` : null;
  if (resumeOut) copyIfThere(app.resume_file, path.join(dir, resumeOut));
  const cover = app.resume_file && copyIfThere(coverLetterFile(app.resume_file), path.join(dir, "cover-letter.pdf"));
  const shots = (["form", "sent"] as const).filter((s) => copyIfThere(`applications/${app.id}/${s}.png`, path.join(dir, `${s}.png`)));
  fs.writeFileSync(path.join(dir, "job-description.txt"), `${job.title}\n${job.company} · ${job.location}\n${job.url}\n\n${job.description ?? "(no description was fetched)"}\n`);

  const fills = new Map((app.fill ?? []).map((f) => [f.key, f]));
  const answers = (app.plan ?? [])
    .filter((p) => p.state === "ok" || p.value.length)
    .map((p) => {
      const value = p.kind === "file" ? (p.value[0] === "cover" ? "cover-letter.pdf" : (resumeOut ?? "resume")) : p.value.join("; ");
      const by = p.by === "claude" ? "written by Claude" : p.by === "bank" ? "answer bank" : p.by === "rule" ? "rule" : "-";
      const f = fills.get(p.key);
      const check = f ? (f.ok ? "read back OK" : `NOT confirmed: ${f.note ?? "didn't fill"}`) : "not filled";
      return `### ${p.label}${p.required ? " *" : ""}\n${value || "(blank)"}\n\n_${by} · ${p.source} · ${check}_\n`;
    });
  const truth = app.truth?.issues.length
    ? app.truth.issues.map((i) => `- ${i.where}: "${i.text}" ${i.action} (${i.reason})`).join("\n")
    : app.truth
      ? "Passed with nothing to fix."
      : "No AI-written document, so nothing to check.";

  const md = [
    `# ${job.title} · ${job.company}`,
    "",
    `- **Submitted:** ${at} by ${app.submitted_by === "you" ? "you" : "Sortie"}`,
    `- **Location:** ${job.location || "-"}`,
    `- **Posting:** ${job.url}`,
    `- **Form:** ${app.apply_url ?? "-"}`,
    `- **Resume:** ${resumeKind}${resumeOut ? ` (${resumeOut})` : ""}`,
    `- **Cover letter:** ${cover ? "cover-letter.pdf" : "none"}`,
    `- **Screenshots:** ${shots.length ? shots.map((s) => `${s}.png`).join(", ") : "none"}`,
    `- **Sortie application id:** ${app.id}`,
    "",
    "## What was entered",
    "",
    answers.length ? answers.join("\n") : "Sortie didn't fill this form (you applied yourself).",
    "",
    "## Truth check",
    "",
    truth,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(dir, "application.md"), md);

  if (fresh) {
    if (!fs.existsSync(INDEX)) fs.writeFileSync(INDEX, `${COLUMNS.join(",")}\n`);
    const row = [at, app.submitted_by ?? "sortie", job.company, job.title, job.location, resumeKind, job.url, app.apply_url ?? "", name];
    fs.appendFileSync(INDEX, `${row.map((v) => csv(String(v))).join(",")}\n`);
  }
  return path.relative(DATA_DIR, dir);
}
