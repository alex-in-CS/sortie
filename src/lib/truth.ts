import { skillOverlap } from "./match";
import { profileText } from "./profile-text";
import type { Profile, TailoredResume, TruthIssue } from "./schema";

// The rule half of the truth check (FR-19, D-051). Claude's tailoring may only
// reword, reorder and choose; it may not add facts. These rules catch the
// mechanical ways it could: skills, entries, numbers and technologies that
// aren't in the profile. Whatever fails is removed, or reverted to the
// profile's own wording when removing would leave a hole.

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]/g, "");
const numbers = (s: string) => new Set(s.match(/\d+(?:[.,]\d+)?/g)?.map((n) => n.replace(",", ".")) ?? []);

export type Claim = { key: string; where: string; text: string };

// Every statement in a tailored resume, keyed so a checker can point at it.
export function claims(r: TailoredResume, profile: Profile): Claim[] {
  const name = (kind: "experience" | "projects", id: string) =>
    kind === "experience"
      ? `experience ${profile.experience.find((e) => e.id === id)?.company ?? id}`
      : `project ${profile.projects.find((p) => p.id === id)?.name ?? id}`;
  return [
    { key: "headline", where: "headline", text: r.headline },
    { key: "summary", where: "summary", text: r.summary },
    ...r.experience.flatMap((e) =>
      e.bullets.map((text, i) => ({ key: `experience:${e.id}:${i}`, where: name("experience", e.id), text })),
    ),
    ...r.projects.flatMap((p) => p.bullets.map((text, i) => ({ key: `projects:${p.id}:${i}`, where: name("projects", p.id), text }))),
    ...sentences(r.coverLetter).map((text, i) => ({ key: `cover:${i}`, where: "cover letter", text })),
  ].filter((c) => c.text.trim());
}

export const sentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+(?=[A-Z"“(])|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

// Why a claim isn't supported by `source`, or null if the rules find nothing.
// A bullet's source is its own entry, so a skill you have can't be claimed for a
// job where you didn't use it.
const techIn = (text: string) => skillOverlap(text, []).missing;
function problem(text: string, source: string): string | null {
  const have = numbers(source);
  const extra = [...numbers(text)].filter((n) => !have.has(n));
  if (extra.length) return `States ${extra.join(", ")}, which isn't in your profile`;
  const sourceTech = new Set(techIn(source).map(norm));
  const tech = techIn(text).filter((t) => !sourceTech.has(norm(t)));
  if (tech.length) return `Mentions ${tech.join(", ")}, which isn't in your profile`;
  return null;
}

// Applies a set of rejected claim keys: drops those statements, then fills any
// hole with the profile's own text.
export function applyRejections(
  r: TailoredResume,
  profile: Profile,
  rejected: Map<string, string>,
  issues: TruthIssue[],
): TailoredResume {
  const all = claims(r, profile);
  const reject = (c: Claim, action: TruthIssue["action"]) =>
    issues.push({ where: c.where, text: c.text, reason: rejected.get(c.key)!, action });
  const byKey = new Map(all.map((c) => [c.key, c]));

  let headline = r.headline;
  if (rejected.has("headline")) {
    reject(byKey.get("headline")!, "reverted");
    headline = profile.headline;
  }
  let summary = r.summary;
  if (rejected.has("summary")) {
    reject(byKey.get("summary")!, "reverted");
    summary = profile.summary;
  }

  const entries = <K extends "experience" | "projects">(kind: K) =>
    r[kind].map((e) => {
      const kept = e.bullets.filter((_, i) => {
        const key = `${kind}:${e.id}:${i}`;
        if (!rejected.has(key)) return true;
        return false;
      });
      const dropped = e.bullets.length - kept.length;
      const source = (kind === "experience" ? profile.experience : profile.projects).find((x) => x.id === e.id)!;
      const action = dropped && !kept.length ? "reverted" : "removed";
      e.bullets.forEach((_, i) => {
        const c = byKey.get(`${kind}:${e.id}:${i}`);
        if (c && rejected.has(c.key)) reject(c, action);
      });
      return { id: e.id, bullets: kept.length ? kept : source.bullets };
    });

  const cover = sentences(r.coverLetter);
  const coverKept = cover.filter((_, i) => {
    const c = byKey.get(`cover:${i}`);
    if (c && rejected.has(c.key)) {
      reject(c, "removed");
      return false;
    }
    return true;
  });

  return {
    ...r,
    headline,
    summary,
    experience: entries("experience"),
    projects: entries("projects"),
    coverLetter: coverKept.length === cover.length ? r.coverLetter : coverKept.join(" "),
  };
}

// `facts` adds owner-stated facts that live outside the profile (years of
// experience). `job` lets the cover letter name the employer and the role.
export function ruleCheck(
  input: TailoredResume,
  profile: Profile,
  facts = "",
  job: { company: string; title: string } | null = null,
): { resume: TailoredResume; issues: TruthIssue[] } {
  const issues: TruthIssue[] = [];

  // Skills: only names the profile has, spelled the profile's way, once each.
  const skillByNorm = new Map(profile.skills.map((s) => [norm(s.name), s.name]));
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const s of input.skills) {
    const name = skillByNorm.get(norm(s));
    if (!name) issues.push({ where: "skills", text: s, reason: "Not a skill in your profile", action: "removed" });
    else if (!seen.has(name)) {
      seen.add(name);
      skills.push(name);
    }
  }

  // Entries: only ids the profile has, each once.
  const known = <T extends { id: string }>(kind: "experience" | "projects", list: T[], source: { id: string }[]) => {
    const ids = new Set(source.map((x) => x.id));
    const used = new Set<string>();
    return list.filter((e) => {
      if (!ids.has(e.id) || used.has(e.id)) {
        if (!ids.has(e.id))
          issues.push({ where: kind, text: e.id, reason: "Refers to an entry that isn't in your profile", action: "removed" });
        return false;
      }
      used.add(e.id);
      return true;
    });
  };
  const resume: TailoredResume = {
    ...input,
    skills,
    experience: known("experience", input.experience, profile.experience),
    projects: known("projects", input.projects, profile.projects),
  };

  // Statements: each bullet is checked against its own entry; the headline,
  // summary and cover letter against the whole profile.
  const whole = `${profileText(profile)}
${facts}`;
  const entryText = (key: string) => {
    const [kind, id] = key.split(":");
    if (kind === "experience") {
      const e = profile.experience.find((x) => x.id === id)!;
      return [e.title, e.company, e.location, ...e.bullets, ...e.skills].join("\n");
    }
    if (kind === "projects") {
      const p = profile.projects.find((x) => x.id === id)!;
      return [p.name, p.description, ...p.bullets, ...p.skills].join("\n");
    }
    return kind === "cover" && job ? [whole, job.company, job.title].join("\n") : whole;
  };
  const rejected = new Map<string, string>();
  for (const c of claims(resume, profile)) {
    const why = problem(c.text, entryText(c.key));
    if (why) rejected.set(c.key, why);
  }
  return { resume: applyRejections(resume, profile, rejected, issues), issues };
}
