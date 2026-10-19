import { randomUUID } from "node:crypto";
import type { ParsedResume, Profile } from "./schema";
import { norm } from "./skills";

const key = (...parts: string[]) => parts.map((p) => p.trim().toLowerCase()).join("|");

function appendNew<T, P>(existing: T[], incoming: P[], keyOf: (x: T | P) => string, make: (p: P) => T) {
  const seen = new Set(existing.map(keyOf));
  const added: T[] = [];
  for (const item of incoming) {
    const k = keyOf(item);
    if (seen.has(k)) continue;
    seen.add(k);
    added.push(make(item));
  }
  return { list: [...existing, ...added], added: added.length };
}

export type MergeSummary = {
  skills: number;
  experience: number;
  projects: number;
  education: number;
  certifications: number;
};

// Folds a freshly parsed resume into the existing profile. Anything the user
// already has (including hand edits) wins; the resume only fills gaps and
// adds entries that aren't there yet, so re-uploading never clobbers work.
export function mergeResume(profile: Profile, parsed: ParsedResume): { profile: Profile; added: MergeSummary } {
  const fill = (current: string, incoming: string) => current.trim() || incoming.trim();

  const contact = {
    fullName: fill(profile.contact.fullName, parsed.contact.fullName),
    email: fill(profile.contact.email, parsed.contact.email),
    phone: fill(profile.contact.phone, parsed.contact.phone),
    location: fill(profile.contact.location, parsed.contact.location),
    links: appendNew(profile.contact.links, parsed.contact.links, (l) => key(l.url), (l) => l).list,
  };

  const skills = appendNew(
    profile.skills,
    parsed.skills,
    (s) => norm(s.name),
    (s) => ({ ...s, id: randomUUID(), source: "resume" as const }),
  );
  const experience = appendNew(
    profile.experience,
    parsed.experience,
    (e) => key(e.company, e.title),
    (e) => ({ ...e, id: randomUUID() }),
  );
  const projects = appendNew(profile.projects, parsed.projects, (p) => key(p.name), (p) => ({
    ...p,
    id: randomUUID(),
  }));
  const education = appendNew(
    profile.education,
    parsed.education,
    (e) => key(e.school, e.degree),
    (e) => ({ ...e, id: randomUUID() }),
  );
  const certifications = appendNew(profile.certifications, parsed.certifications, (c) => key(c.name), (c) => ({
    ...c,
    id: randomUUID(),
  }));

  return {
    profile: {
      contact,
      headline: fill(profile.headline, parsed.headline),
      summary: fill(profile.summary, parsed.summary),
      skills: skills.list,
      experience: experience.list,
      projects: projects.list,
      education: education.list,
      certifications: certifications.list,
    },
    added: {
      skills: skills.added,
      experience: experience.added,
      projects: projects.added,
      education: education.added,
      certifications: certifications.added,
    },
  };
}
