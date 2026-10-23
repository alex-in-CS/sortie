import { countriesIn, countryCode, mentionsAnyKnownCity, mentionsCity } from "./geo";
import type { EmploymentType, Preferences, Profile, Search, Seniority, Skill, WorkMode } from "./schema";
import { KNOWN_SKILLS, norm } from "./skills";
import type { Salary } from "./sources/types";

// The deterministic half of matching (D-032): hard filters that reject a job
// outright, then a cheap 0–100 score from skill overlap, title, years asked
// for and freshness. No LLM here, so it can run over thousands of jobs every
// cycle; the LLM only re-scores the survivors (phase 3).

// Bump when filters or scoring change, so stored matches are recomputed (D-041).
export const MATCH_RULES_VERSION = 4;

export type MatchJob = {
  company: string;
  title: string;
  location: string;
  countryCodes: string[];
  workMode: WorkMode | null;
  employmentType: EmploymentType | null;
  level: string | null;
  description: string | null;
  postedAt: string | null;
  salary: Salary | null;
};

export type MatchResult = {
  score: number;
  // The first hard filter the job failed, in plain words. Null = it qualifies on the filters.
  rejected: string | null;
  seniority: Seniority;
  matched: string[]; // profile skills the posting mentions
  missing: string[]; // known skills the posting mentions that the profile doesn't have
  notes: string[]; // soft flags shown next to the score
};

// ---------- skills ----------

// Spellings that mean the same skill. The first entry is the display name.
const ALIASES = [
  ["JavaScript", "JS"],
  ["Node.js", "NodeJS", "Node JS"],
  ["PostgreSQL", "Postgres"],
  ["Kubernetes", "K8s"],
  ["Go", "Golang"],
  ["Google Cloud", "GCP"],
  ["AWS", "Amazon Web Services"],
  ["Tailwind", "Tailwind CSS"],
  ["Rails", "Ruby on Rails"],
  ["Next.js", "NextJS"],
  ["Vue", "Vue.js", "VueJS"],
  ["React", "React.js", "ReactJS"],
  ["CI/CD", "CICD", "Continuous Integration"],
  ["REST", "REST APIs", "RESTful"],
  ["Machine Learning", "ML"],
  ["LLMs", "LLM", "Large Language Models"],
  ["Elasticsearch", "Elastic Search"],
];
const ALIAS_OF = new Map<string, string[]>();
for (const group of ALIASES) for (const n of group) ALIAS_OF.set(norm(n), group);
const spellings = (name: string) => ALIAS_OF.get(norm(name)) ?? [name];
const canonical = (name: string) => norm(spellings(name)[0]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const termCache = new Map<string, RegExp>();
// Skill names that are also everyday English words only count when capitalised.
const ENGLISH = new Set(["Excel", "Spark", "Swift", "Rust", "Express", "Spring", "Lambda", "Jest", "Shell", "Ruby", "Redux"]);
// Short names (Go, R, C, JS, ML) only count in their usual capitalisation, and
// single letters get extra guards, so "go to market", "R&D", "Series C" or
// "C-suite" don't look like skills.
function termRe(term: string) {
  let re = termCache.get(term);
  if (!re) {
    const letters = term.replace(/[^A-Za-z]/g, "").length;
    const flags = letters <= 2 || ENGLISH.has(term) ? "" : "i";
    const single = letters === 1 && !/[+#]/.test(term);
    const head = single ? "(?<![A-Za-z0-9.&-])(?<!(?:Series|Grade|Class|Plan|Type|Vitamin|Section)\\s)" : "(?<![A-Za-z0-9.])";
    const tail = /[+#]$/.test(term) ? "(?![A-Za-z0-9])" : single ? "(?![A-Za-z0-9+#&-])" : "(?![A-Za-z0-9+#])";
    const guard = term === "Go" ? "(?!\\s+(?:to|ahead|live|beyond|further|back|deep)\\b)" : "";
    re = new RegExp(`${head}${escape(term)}${tail}${guard}`, flags);
    termCache.set(term, re);
  }
  return re;
}
const mentions = (text: string, name: string) => spellings(name).some((s) => termRe(s).test(text));

const LEVEL_WEIGHT: Record<Skill["level"], number> = { learning: 0.4, working: 0.7, strong: 0.9, expert: 1 };
const TECH = new Set<Skill["category"]>(["language", "framework", "database", "cloud", "tool"]);

export function skillOverlap(text: string, skills: Skill[]) {
  const have = new Set(skills.map((s) => canonical(s.name)));
  const matched = skills.filter((s) => mentions(text, s.name));
  const seen = new Set<string>();
  const missing: string[] = [];
  for (const k of KNOWN_SKILLS) {
    const key = canonical(k.name);
    if (!TECH.has(k.category) || have.has(key) || seen.has(key)) continue;
    seen.add(key);
    if (mentions(text, k.name)) missing.push(spellings(k.name)[0]);
  }
  return { matched, missing };
}

// ---------- seniority and years ----------

export function inferSeniority(title: string, level: string | null): Seniority {
  if (/\bintern(ship)?\b|\bco-?op\b|praktik|werkstudent|apprentice/i.test(title)) return "intern";
  // Banks title mid-career staff "Assistant Vice President" (AVP) and "Vice President".
  if (/\b(lead|principal|staff|head|director|manager|architect|distinguished|fellow|vp|avp|vice president)\b/i.test(title)) return "lead";
  if (/\b(senior|sr\.?|iii|iv)(?![a-z])/i.test(title)) return "senior";
  if (/\b(junior|jr\.?|entry|graduate|grad|associate|early[- ]career|trainee)\b/i.test(title) || /\s(I|1)(\s|$|,|-|\))/.test(title))
    return "entry";
  if (level) {
    if (/intern/i.test(level)) return "intern";
    if (/entry|associate|graduate/i.test(level)) return "entry";
    if (/director|executive/i.test(level)) return "lead";
  }
  return "mid";
}

// The smallest "N+ years" the posting asks for, or null.
export function yearsAsked(text: string): number | null {
  let best: number | null = null;
  for (const m of text.matchAll(/(\d{1,2})\s*(?:\+|-\s*\d{1,2}|to\s+\d{1,2})?\s*\+?\s*(?:years|yrs)/gi)) {
    const n = Number(m[1]);
    if (n > 0 && n <= 20 && (best === null || n < best)) best = n;
  }
  return best;
}

// ---------- role ----------

// "Engineer" alone isn't enough: aerospace, hardware and manufacturing boards
// (SpaceX alone posts ~2,700 roles) are full of non-software engineers.
// - NOT_A_BUILDER: other functions, rejected even with "software" in the title
//   ("Software Sales Executive", "Technical Support Engineer - Developer Platform").
// - STRONG: unmistakably software ("Software Engineer, Avionics" stays in).
// - SOFTWARE_ROLE: weaker signals, accepted unless another discipline is named.
const NOT_A_BUILDER =
  /\bsales\b|pre-?sales|account (executive|manager)|recruit|marketing|legal|counsel|finance|accountant|\bhr\b|people partner|support (specialist|engineer)|customer (success|engineer)|solutions engineer|business development|technician/i;
const STRONG = /software|developer|programmer|\bsde\b|\bswe\b|full[- ]?stack|front[- ]?end|back[- ]?end/i;
const SOFTWARE_ROLE = new RegExp(
  [
    "devops",
    "\\bsre\\b",
    "site reliability",
    "\\bmobile (engineer|developer)",
    "android",
    "\\bios\\b",
    "\\bweb\\b",
    "data (engineer|scientist)",
    "analytics engineer",
    "machine learning",
    "\\bml\\b",
    "\\bmlops\\b",
    "\\bai\\b",
    "\\bllm\\b",
    "applied (ai|scientist)",
    "research engineer",
    "platform engineer",
    "infrastructure engineer",
    "cloud engineer",
    "security engineer",
    "application security",
    "\\bsdet\\b",
    "test automation",
    "automation engineer",
    "\\bqa engineer",
    "member of technical staff",
    "\\bmts\\b",
    "forward[- ]deployed",
    "founding engineer",
    "product engineer",
    "solutions? architect",
    "engineering manager",
    "tech(nical)? lead",
  ].join("|"),
  "i",
);
const OTHER_DISCIPLINE =
  /mechanical|civil|structural|chemical|manufacturing|machining|propulsion|avionics|\brf\b|analog|electrical(?! (and|&) computer)|hardware|process engineer|controls|(?<!site )reliability engineer|quality engineer|production|field service|\bnurse\b|\bdriver\b|warehouse/i;

export const isSoftwareRole = (title: string) =>
  !NOT_A_BUILDER.test(title) && (STRONG.test(title) || (SOFTWARE_ROLE.test(title) && !OTHER_DISCIPLINE.test(title)));

// ---------- location ----------

const NO_SPONSORSHIP =
  /(unable|not able|cannot|can't|will not|won't|do not|don't|does not|no)\s+(to\s+)?(offer\s+|provide\s+)?(visa\s+)?sponsor|without (the need for )?(visa )?sponsorship|sponsorship (is )?not (available|offered|provided)/i;

function locationCheck(job: MatchJob, prefs: Preferences, notes: string[]): string | null {
  const text = job.location;
  const mode: WorkMode | null = job.workMode ?? (/\bremote\b/i.test(text) ? "remote" : null);
  if (mode && prefs.workModes.length && !prefs.workModes.includes(mode)) return `${mode} role, and you didn't pick ${mode}`;

  const jobCountries = new Set([...job.countryCodes, ...countriesIn(text)]);
  const anywhere = jobCountries.has("*");
  const wanted = prefs.countries.map(countryCode).filter((c): c is string => !!c);
  if (wanted.length && !anywhere) {
    if (!jobCountries.size) notes.push("Location unclear");
    else if (!wanted.some((c) => jobCountries.has(c))) return `In ${job.location || [...jobCountries].join(", ")}, outside your countries`;
  }

  if (mode !== "remote" && prefs.cities.length && !prefs.willingToRelocate && mentionsAnyKnownCity(text)) {
    if (!prefs.cities.some((c) => mentionsCity(text, c))) return `In ${job.location}, not one of your cities`;
  }

  const authorized = prefs.authorizedCountries.map(countryCode).filter((c): c is string => !!c);
  if (authorized.length && jobCountries.size && !anywhere && !authorized.some((c) => jobCountries.has(c))) {
    if (!prefs.needsSponsorshipElsewhere) return null;
    if (job.description && NO_SPONSORSHIP.test(job.description)) return "Says it doesn't sponsor visas";
    notes.push("May need visa sponsorship");
  }
  return null;
}

// ---------- salary ----------

const PER_YEAR = { year: 1, month: 12, hour: 2080 } as const;

function salaryCheck(s: Salary | null, floor: Preferences["minSalary"]): string | null {
  if (!s || !floor || s.currency.toUpperCase() !== floor.currency.toUpperCase()) return null;
  const top = s.max ?? s.min;
  if (top == null) return null;
  const yearly = top * PER_YEAR[s.period];
  const want = floor.amount * PER_YEAR[floor.period];
  return yearly < want ? `Pays up to ${s.currency} ${Math.round(yearly).toLocaleString("en-GB")} a year, below your floor` : null;
}

// ---------- the match ----------

const daysSince = (iso: string | null, now: Date) => (iso ? (now.getTime() - new Date(iso).getTime()) / 86_400_000 : null);
const wordIn = (text: string, phrase: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${escape(phrase.trim())}(?![\\p{L}\\p{N}])`, "iu").test(text);

export function matchJob(raw: MatchJob, search: Search, profile: Profile, prefs: Preferences, now = new Date()): MatchResult {
  // Some ATSs use underscores as spaces ("EMT3_VM_Gen_AI_ML_Senior_Developer").
  const job = { ...raw, title: raw.title.replace(/_+/g, " ").replace(/s+/g, " ").trim() };
  const notes: string[] = [];
  const seniority = inferSeniority(job.title, job.level);
  const text = `${job.title}\n${job.description ?? ""}`;
  const asked = job.description ? yearsAsked(job.description) : null;
  const yoe = prefs.yearsOfExperience;

  const reject = (() => {
    if (prefs.excludeCompanies.some((c) => c.trim() && job.company.toLowerCase().includes(c.trim().toLowerCase())))
      return "Company is on your exclude list";
    if (search.titles.length) {
      if (!search.titles.some((t) => t.trim() && wordIn(job.title, t))) return "Title doesn't match this search";
    } else if (!isSoftwareRole(job.title)) return "Not a software role";
    const kw = search.excludeKeywords.find((k) => k.trim() && wordIn(text, k));
    if (kw) return `Mentions "${kw}"`;
    if (search.seniority.length && !search.seniority.includes(seniority)) return `Looks ${seniority}-level`;
    const type = job.employmentType ?? (seniority === "intern" ? "internship" : null);
    if (type && search.employmentTypes.length && !search.employmentTypes.includes(type)) return `${type} role`;
    const where = locationCheck(job, prefs, notes);
    if (where) return where;
    const pay = salaryCheck(job.salary, prefs.minSalary);
    if (pay) return pay;
    if (asked !== null && yoe !== null && asked > yoe + 2) return `Asks for ${asked}+ years`;
    return null;
  })();
  // Rejected jobs skip scoring: the skill scan is the expensive part and most
  // fetched jobs fail a filter (usually "not a software role").
  if (reject) return { score: 0, rejected: reject, seniority, matched: [], missing: [], notes };

  const overlap = skillOverlap(text, profile.skills);
  const matched = overlap.matched;
  // A company's own product ("ClickHouse" at ClickHouse) isn't a skill gap.
  const company = norm(job.company);
  const missing = overlap.missing.filter((m) => !company.includes(norm(m)));

  // Skills: matched skills weighted by level against everything named; skills
  // the profile lacks count half, since postings mix musts and nice-to-haves.
  let skillFit = 0.5;
  if (!job.description) notes.push("No description yet");
  else if (matched.length + missing.length) {
    const have = matched.reduce((sum, s) => sum + LEVEL_WEIGHT[s.level], 0);
    skillFit = Math.min(1, have / (matched.length + 0.5 * missing.length));
  }

  // Title: an explicit title hit is full marks; otherwise reward titles that name a skill or a past role.
  const pastTitles = profile.experience.map((e) => e.title.toLowerCase());
  const titleFit = search.titles.length
    ? 1
    : profile.skills.some((s) => mentions(job.title, s.name)) ||
        pastTitles.some((t) => t && (job.title.toLowerCase().includes(t) || t.includes(job.title.toLowerCase())))
      ? 1
      : 0.7;

  const yearsFit = asked === null || yoe === null ? 1 : asked <= yoe ? 1 : asked <= yoe + 1 ? 0.7 : 0.4;
  if (asked !== null && yoe !== null && asked > yoe) notes.push(`Asks for ${asked}+ years (you have ${yoe})`);

  const age = daysSince(job.postedAt, now);
  const fresh = age === null ? 0.6 : age <= 7 ? 1 : age <= 30 ? 0.7 : age <= 60 ? 0.4 : 0.2;
  if (age !== null && age > 60) notes.push(`Posted ${Math.round(age)} days ago`);

  const score = Math.round(100 * (0.6 * skillFit + 0.15 * titleFit + 0.15 * yearsFit + 0.1 * fresh));
  return { score, rejected: null, seniority, matched: matched.map((s) => s.name), missing, notes };
}
