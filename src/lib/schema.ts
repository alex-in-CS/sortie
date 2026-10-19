import * as z from "zod";

// The master profile is the single source of truth about the candidate.
// Everything Sortie writes later (tailored resumes, form answers) must trace
// back to something in here, so it only ever holds facts the user owns.

export const SKILL_CATEGORIES = [
  "language",
  "framework",
  "database",
  "cloud",
  "tool",
  "concept",
  "soft",
  "other",
] as const;

export const SKILL_LEVELS = ["learning", "working", "strong", "expert"] as const;

export const SkillCategory = z.enum(SKILL_CATEGORIES);
export const SkillLevel = z.enum(SKILL_LEVELS);

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  category: SkillCategory,
  level: SkillLevel,
  years: z.number().nullable(),
  source: z.enum(["resume", "manual"]),
});

export const Link = z.object({ label: z.string(), url: z.string() });

export const Contact = z.object({
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  links: z.array(Link),
});

export const Experience = z.object({
  id: z.string(),
  company: z.string(),
  title: z.string(),
  location: z.string(),
  start: z.string(), // "YYYY-MM" or "YYYY"
  end: z.string().nullable(), // null = present
  bullets: z.array(z.string()),
  skills: z.array(z.string()),
});

export const Project = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  description: z.string(),
  bullets: z.array(z.string()),
  skills: z.array(z.string()),
});

export const Education = z.object({
  id: z.string(),
  school: z.string(),
  degree: z.string(),
  field: z.string(),
  start: z.string(),
  end: z.string().nullable(),
  grade: z.string(),
});

export const Certification = z.object({
  id: z.string(),
  name: z.string(),
  issuer: z.string(),
  year: z.string(),
});

export const Profile = z.object({
  contact: Contact,
  headline: z.string(),
  summary: z.string(),
  skills: z.array(Skill),
  experience: z.array(Experience),
  projects: z.array(Project),
  education: z.array(Education),
  certifications: z.array(Certification),
});

export type Skill = z.infer<typeof Skill>;
export type Experience = z.infer<typeof Experience>;
export type Project = z.infer<typeof Project>;
export type Education = z.infer<typeof Education>;
export type Certification = z.infer<typeof Certification>;
export type Profile = z.infer<typeof Profile>;

export const emptyProfile = (): Profile => ({
  contact: { fullName: "", email: "", phone: "", location: "", links: [] },
  headline: "",
  summary: "",
  skills: [],
  experience: [],
  projects: [],
  education: [],
  certifications: [],
});

// What Claude returns when it reads a resume: the profile without ids or
// provenance, which we add ourselves.
export const ParsedResume = z.object({
  contact: Contact,
  headline: z.string(),
  summary: z.string(),
  skills: z.array(
    z.object({
      name: z.string(),
      category: SkillCategory,
      level: SkillLevel,
      years: z.number().nullable(),
    }),
  ),
  experience: z.array(Experience.omit({ id: true })),
  projects: z.array(Project.omit({ id: true })),
  education: z.array(Education.omit({ id: true })),
  certifications: z.array(Certification.omit({ id: true })),
});
export type ParsedResume = z.infer<typeof ParsedResume>;

// Preferences decide which jobs are worth applying to and how hard the
// autopilot is allowed to push.

export const SENIORITY = ["intern", "entry", "mid", "senior", "lead"] as const;
export const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
export const EMPLOYMENT_TYPES = ["full-time", "internship", "contract", "part-time"] as const;

export const Preferences = z.object({
  targetRoles: z.array(z.string()),
  seniority: z.array(z.enum(SENIORITY)),
  yearsOfExperience: z.number().nullable(),
  employmentTypes: z.array(z.enum(EMPLOYMENT_TYPES)),
  workModes: z.array(z.enum(WORK_MODES)),
  countries: z.array(z.string()),
  cities: z.array(z.string()),
  willingToRelocate: z.boolean(),
  authorizedCountries: z.array(z.string()),
  needsSponsorshipElsewhere: z.boolean(),
  minSalary: z
    .object({
      amount: z.number(),
      currency: z.string(),
      period: z.enum(["year", "month"]),
    })
    .nullable(),
  noticePeriodDays: z.number().nullable(),
  excludeCompanies: z.array(z.string()),
  excludeKeywords: z.array(z.string()),
  maxPerCompany: z.number().int().min(1).max(10),
  dailyLimit: z.number().int().min(1).max(200),
  autoSubmitThreshold: z.number().int().min(0).max(100),
  discovery: z.boolean(),
});
export type Preferences = z.infer<typeof Preferences>;

export const defaultPreferences = (): Preferences => ({
  targetRoles: [],
  seniority: ["entry", "mid"],
  yearsOfExperience: null,
  employmentTypes: ["full-time"],
  workModes: ["remote", "hybrid", "onsite"],
  countries: [],
  cities: [],
  willingToRelocate: false,
  authorizedCountries: [],
  needsSponsorshipElsewhere: true,
  minSalary: null,
  noticePeriodDays: null,
  excludeCompanies: [],
  excludeKeywords: [],
  maxPerCompany: 3,
  dailyLimit: 25,
  autoSubmitThreshold: 80,
  discovery: true,
});
