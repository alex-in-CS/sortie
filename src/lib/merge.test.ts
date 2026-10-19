import { describe, expect, it } from "vitest";
import { mergeResume } from "./merge";
import { emptyProfile, type ParsedResume, type Profile } from "./schema";

const parsed = (over: Partial<ParsedResume> = {}): ParsedResume => ({
  contact: { fullName: "", email: "", phone: "", location: "", links: [] },
  headline: "",
  summary: "",
  skills: [],
  experience: [],
  projects: [],
  education: [],
  certifications: [],
  ...over,
});

describe("mergeResume", () => {
  it("fills an empty profile from the resume", () => {
    const { profile, added } = mergeResume(
      emptyProfile(),
      parsed({
        contact: { fullName: "Jane", email: "j@x.com", phone: "1", location: "Pune", links: [] },
        skills: [{ name: "Go", category: "language", level: "working", years: 2 }],
      }),
    );
    expect(profile.contact.fullName).toBe("Jane");
    expect(profile.skills[0]).toMatchObject({ name: "Go", source: "resume" });
    expect(profile.skills[0].id).toBeTruthy();
    expect(added.skills).toBe(1);
  });

  it("never overwrites what the user already has", () => {
    const base: Profile = {
      ...emptyProfile(),
      contact: { fullName: "Me", email: "", phone: "1", location: "", links: [] },
      summary: "mine",
      skills: [{ id: "a", name: "Node.js", category: "framework", level: "expert", years: 4, source: "manual" }],
      experience: [
        { id: "x", company: "Acme", title: "SDE", location: "", start: "2022", end: null, bullets: ["mine"], skills: [] },
      ],
    };
    const { profile, added } = mergeResume(
      base,
      parsed({
        contact: { fullName: "Other", email: "e@x.com", phone: "2", location: "", links: [] },
        summary: "theirs",
        skills: [{ name: "node js", category: "tool", level: "learning", years: null }],
        experience: [
          { company: "acme ", title: "sde", location: "", start: "2022", end: null, bullets: ["theirs"], skills: [] },
        ],
      }),
    );
    expect(profile.contact).toMatchObject({ fullName: "Me", email: "e@x.com", phone: "1" });
    expect(profile.summary).toBe("mine");
    expect(profile.skills).toHaveLength(1);
    expect(profile.skills[0].level).toBe("expert");
    expect(profile.experience).toHaveLength(1);
    expect(profile.experience[0].bullets).toEqual(["mine"]);
    expect(added).toEqual({ skills: 0, experience: 0, projects: 0, education: 0, certifications: 0 });
  });

  it("dedupes skills within the same resume", () => {
    const { profile } = mergeResume(
      emptyProfile(),
      parsed({
        skills: [
          { name: "PostgreSQL", category: "database", level: "strong", years: null },
          { name: "postgresql", category: "database", level: "working", years: null },
        ],
      }),
    );
    expect(profile.skills.map((s) => s.name)).toEqual(["PostgreSQL"]);
  });
});
