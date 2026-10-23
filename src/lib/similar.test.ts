import { describe, expect, it } from "vitest";
import type { Skill } from "./schema";
import { similarity, skillsNamed } from "./similar";

const skill = (name: string): Skill => ({ name, level: "working", category: "language", years: null }) as Skill;
const profile = ["Python", "SQL", "React", "Node.js"].map(skill);

describe("similarity", () => {
  it("compares postings on the skills they name", () => {
    const a = "Backend role. Python, SQL, React and Docker.";
    const b = "We use Python, SQL, React and Kubernetes daily.";
    expect(skillsNamed(a, profile).size).toBe(4);
    expect(similarity(a, b, profile)).toBeCloseTo(3 / 5);
  });

  it("is low for postings that ask for different things", () => {
    expect(similarity("Python, SQL, Pandas, Tableau", "React, Node.js, TypeScript, GraphQL", profile)).toBeLessThan(0.2);
  });

  it("falls back to shared wording when few skills are named", () => {
    const a = "Graduate trainee programme in operations planning and logistics";
    expect(similarity(a, a, profile)).toBeCloseTo(1);
    expect(similarity(a, "Marketing intern for social campaigns", profile)).toBeLessThan(0.2);
  });
});
