import type { EmploymentType, WorkMode } from "../schema";

export const PROVIDERS = ["greenhouse", "lever", "ashby", "smartrecruiters", "workday"] as const;
export type Provider = (typeof PROVIDERS)[number];

export type Salary = { min: number | null; max: number | null; currency: string; period: "year" | "month" | "hour" };

// One posting, normalised across providers. Fields a provider doesn't give are null, never guessed.
export type SourceJob = {
  providerJobId: string;
  title: string;
  location: string;
  // ISO 3166-1 alpha-2, upper case, when the provider states it. Text locations are resolved later (geo.ts).
  countryCodes: string[];
  workMode: WorkMode | null;
  employmentType: EmploymentType | null;
  department: string | null;
  // The provider's own seniority label (SmartRecruiters "Associate", "Mid-Senior Level"), if any.
  level: string | null;
  // Plain text. Null means the list endpoint doesn't include it and `detail()` must be called.
  description: string | null;
  url: string;
  applyUrl: string | null;
  postedAt: string | null;
  salary: Salary | null;
};

export type ListOptions = {
  // Narrows huge boards (Workday, SmartRecruiters) server-side. Ignored by providers that return everything.
  query?: string;
  // Upper bound on postings fetched from one board.
  limit?: number;
};

export type Source = {
  provider: Provider;
  list(board: string, opts?: ListOptions): Promise<SourceJob[]>;
  // Only for providers whose list endpoint has no description.
  detail?(board: string, job: SourceJob): Promise<Pick<SourceJob, "description"> & Partial<SourceJob>>;
};
