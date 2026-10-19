import type { Preferences, Profile } from "./schema";

// The profile as compact text for prompts. Experience and project ids are kept
// so Claude can point back at the entry a tailored bullet came from.

const span = (start: string, end: string | null) => `${start || "?"} – ${end ?? "present"}`;

export function profileText(p: Profile): string {
  const out: string[] = [];
  if (p.headline) out.push(`Headline: ${p.headline}`);
  if (p.summary) out.push(`Summary: ${p.summary}`);
  if (p.skills.length)
    out.push(
      "Skills:\n" +
        p.skills.map((s) => `- ${s.name} (${s.level}${s.years != null ? `, ${s.years} years` : ""})`).join("\n"),
    );
  if (p.experience.length)
    out.push(
      "Experience:\n" +
        p.experience
          .map(
            (e) =>
              `[${e.id}] ${e.title} at ${e.company}${e.location ? `, ${e.location}` : ""} (${span(e.start, e.end)})\n` +
              e.bullets.map((b) => `  - ${b}`).join("\n") +
              (e.skills.length ? `\n  Skills used: ${e.skills.join(", ")}` : ""),
          )
          .join("\n"),
    );
  if (p.projects.length)
    out.push(
      "Projects:\n" +
        p.projects
          .map(
            (pr) =>
              `[${pr.id}] ${pr.name}${pr.description ? `: ${pr.description}` : ""}\n` +
              pr.bullets.map((b) => `  - ${b}`).join("\n") +
              (pr.skills.length ? `\n  Skills used: ${pr.skills.join(", ")}` : ""),
          )
          .join("\n"),
    );
  if (p.education.length)
    out.push(
      "Education:\n" +
        p.education
          .map((e) => `- ${[e.degree, e.field].filter(Boolean).join(", ")} at ${e.school} (${span(e.start, e.end)})${e.grade ? `, ${e.grade}` : ""}`)
          .join("\n"),
    );
  if (p.certifications.length)
    out.push("Certifications:\n" + p.certifications.map((c) => `- ${c.name}${c.issuer ? `, ${c.issuer}` : ""}${c.year ? ` (${c.year})` : ""}`).join("\n"));
  return out.join("\n\n");
}

export function constraintsText(prefs: Preferences): string {
  const lines = [
    `Years of experience: ${prefs.yearsOfExperience ?? "not stated"}`,
    `Authorized to work in: ${prefs.authorizedCountries.join(", ") || "not stated"}`,
    `Needs visa sponsorship elsewhere: ${prefs.needsSponsorshipElsewhere ? "yes" : "no"}`,
    `Wants to work in: ${prefs.countries.join(", ") || "anywhere"}${prefs.cities.length ? ` (cities: ${prefs.cities.join(", ")})` : ""}`,
    `Willing to relocate: ${prefs.willingToRelocate ? "yes" : "no"}`,
  ];
  return lines.join("\n");
}
