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

export const SENIORITY = ["intern", "entry", "mid", "senior", "lead"] as const;
export const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
export const EMPLOYMENT_TYPES = ["full-time", "internship", "contract", "part-time"] as const;
export type Seniority = (typeof SENIORITY)[number];
export type WorkMode = (typeof WORK_MODES)[number];
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const Money = z.object({
  amount: z.number(),
  currency: z.string(),
  period: z.enum(["year", "month"]),
});
export type Money = z.infer<typeof Money>;

// Preferences hold the facts and limits that apply to every search: where you
// can work, pay floor, and how hard the autopilot may push overall.
export const Preferences = z.object({
  yearsOfExperience: z.number().nullable(),
  workModes: z.array(z.enum(WORK_MODES)),
  countries: z.array(z.string()),
  cities: z.array(z.string()),
  willingToRelocate: z.boolean(),
  authorizedCountries: z.array(z.string()),
  needsSponsorshipElsewhere: z.boolean(),
  minSalary: Money.nullable(),
  noticePeriodDays: z.number().nullable(),
  excludeCompanies: z.array(z.string()),
  maxPerCompany: z.number().int().min(1).max(10),
  dailyLimit: z.number().int().min(1).max(200),
  discovery: z.boolean(),
});
export type Preferences = z.infer<typeof Preferences>;

export const defaultPreferences = (): Preferences => ({
  yearsOfExperience: null,
  workModes: ["remote", "hybrid", "onsite"],
  countries: [],
  cities: [],
  willingToRelocate: false,
  authorizedCountries: [],
  needsSponsorshipElsewhere: true,
  minSalary: null,
  noticePeriodDays: null,
  excludeCompanies: [],
  maxPerCompany: 3,
  dailyLimit: 25,
  discovery: true,
});

// A search is one hunt running in parallel with the others, e.g. "Backend"
// and "ML engineer", each with its own titles, bar and apply mode.
export const APPLY_MODES = ["auto", "review"] as const;

export const Search = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  titles: z.array(z.string()), // empty = any software role the skills match
  seniority: z.array(z.enum(SENIORITY)),
  employmentTypes: z.array(z.enum(EMPLOYMENT_TYPES)),
  excludeKeywords: z.array(z.string()),
  minMatch: z.number().int().min(0).max(100), // selectivity: skip jobs scoring below this
  mode: z.enum(APPLY_MODES), // auto: submit where the form allows; review: prepare and wait
});
export type Search = z.infer<typeof Search>;
export const Searches = z.array(Search);

export const newSearch = (name = "Software engineering"): Search => ({
  id: crypto.randomUUID(),
  name,
  enabled: true,
  titles: [],
  seniority: ["entry", "mid"],
  employmentTypes: ["full-time"],
  excludeKeywords: [],
  minMatch: 70,
  mode: "review",
});

// Screening answers are given once and reused on every form. `custom` is the
// answer bank: questions you add by hand now, and (from phase 4) answers you
// correct during review, which are remembered for next time.
export const DECLINE = "Decline to self-identify";

export const CustomAnswer = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
  source: z.enum(["manual", "learned"]),
});
export type CustomAnswer = z.infer<typeof CustomAnswer>;

export const Answers = z.object({
  expectedSalary: Money.nullable(),
  currentSalary: Money.nullable(),
  salaryFallback: z.string(), // for free-text salary fields when no figure fits
  hearAbout: z.string(),
  gender: z.string(),
  ethnicity: z.string(),
  veteran: z.string(),
  disability: z.string(),
  custom: z.array(CustomAnswer),
});
export type Answers = z.infer<typeof Answers>;

export const defaultAnswers = (): Answers => ({
  expectedSalary: null,
  currentSalary: null,
  salaryFallback: "Negotiable",
  hearAbout: "Company careers page",
  gender: DECLINE,
  ethnicity: DECLINE,
  veteran: DECLINE,
  disability: DECLINE,
  custom: [],
});

// What Claude returns when it tailors a resume: wording, order and emphasis
// only. Names, employers, titles, dates and education are rendered straight
// from the profile, so tailoring can't change them. Bullets point back at a
// profile entry by id, which is what the truth check compares them against.
export const TailoredResume = z.object({
  headline: z.string(),
  summary: z.string(),
  skills: z.array(z.string()),
  experience: z.array(z.object({ id: z.string(), bullets: z.array(z.string()) })),
  projects: z.array(z.object({ id: z.string(), bullets: z.array(z.string()) })),
  coverLetter: z.string(),
});
export type TailoredResume = z.infer<typeof TailoredResume>;

export type TruthIssue = {
  where: string; // "summary", "experience Acme", "skills", "cover letter"
  text: string;
  reason: string;
  action: "removed" | "reverted";
};
export type TruthReport = { checkedAt: string; claudeChecked: boolean; issues: TruthIssue[] };

// queued: chosen, waiting to be tailored; tailoring: in progress; ready:
// documents done, waiting to apply (phase 4); needs_you: something only the
// owner can fix; skipped: the owner said no. Phase 4 adds the apply stages.
export const APPLICATION_STATUSES = ["queued", "tailoring", "ready", "needs_you", "skipped"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
