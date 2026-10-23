import { countriesIn, countryCode, mentionsCity } from "../geo";
import type { Answers, CustomAnswer, Money, Preferences, Profile } from "../schema";
import { DECLINE } from "../schema";
import type { FormField, PlannedField } from "./types";

// Decides a value for every field of an application form from stored data
// only (FR-21, FR-23, D-055). Pure: no network, no Claude. Each value says where
// it came from. A required field nothing answers is "missing"; consent and
// attestation questions are "decide" — only the owner gives those.

export type PlanContext = {
  profile: Profile;
  answers: Answers;
  prefs: Preferences;
  job: { company: string; title: string; location: string; countryCodes: string[] };
  documents: { resume: boolean; coverLetter: boolean };
};

type Answer = { value: string[]; source: string; fallbacks?: string[] } | null;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9+ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// ---------- options ----------

const YES = /^(yes|y|true)\b/i;
const NO = /^(no|n|false)\b/i;
const yesNo = (options: string[], yes: boolean) => options.find((o) => (yes ? YES : NO).test(o.trim()));

const DECLINE_RE = /decline|prefer not|don.?t wish|do not wish|not (to )?(say|disclose|answer|specify)|rather not/i;

export function pickOption(options: string[], wanted: string): string | undefined {
  const w = norm(wanted);
  return (
    options.find((o) => norm(o) === w) ??
    options.find((o) => norm(o).startsWith(w) || w.startsWith(norm(o))) ??
    options.find((o) => norm(o).includes(w))
  );
}

// "10 - 15 LPA" → [10, 15]; "< 10 LPA" → [0, 10]; "45 days" → [45, 45];
// "Immediate Joiner" → [0, 0]; "60+ days" / "More than 60" → [60, ∞].
export function optionRange(option: string): [number, number] | null {
  const o = option.toLowerCase().replace(/,/g, "");
  if (/immediate/.test(o)) return [0, 0];
  const nums = [...o.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (!nums.length) return null;
  if (/^\s*(<|less than|under|below|upto|up to)/.test(o)) return [0, nums[0]];
  if (/\+|more than|above|over|or more|>/.test(o)) return [nums[0], Infinity];
  return nums.length >= 2 ? [nums[0], nums[1]] : [nums[0], nums[0]];
}

export function pickRange(options: string[], n: number): string | undefined {
  const ranged = options.map((o) => ({ o, r: optionRange(o) })).filter((x) => x.r);
  const inside = ranged.find((x) => n >= x.r![0] && n <= x.r![1]);
  if (inside) return inside.o;
  // Nothing contains it: the closest edge.
  const dist = (r: [number, number]) => (n < r[0] ? r[0] - n : n - r[1]);
  return ranged.sort((a, b) => dist(a.r!) - dist(b.r!))[0]?.o;
}

// ---------- facts ----------

const currentRole = (p: Profile) => p.experience.find((e) => e.end === null);
const latestRole = (p: Profile) =>
  currentRole(p) ?? [...p.experience].sort((a, b) => (b.end ?? "").localeCompare(a.end ?? ""))[0];

function link(p: Profile, kind: "linkedin" | "github" | "twitter" | "portfolio") {
  const links = p.contact.links;
  if (kind === "portfolio")
    return (
      links.find((l) => /portfolio|website|site|blog|personal/i.test(l.label))?.url ??
      links.find((l) => !/linkedin|github|twitter|x\.com/i.test(l.url))?.url
    );
  const host = kind === "twitter" ? /twitter\.com|x\.com/i : new RegExp(`${kind}\\.com`, "i");
  return links.find((l) => host.test(l.url) || new RegExp(kind, "i").test(l.label))?.url;
}

const authorizedCodes = (prefs: Preferences) =>
  new Set(prefs.authorizedCountries.map((c) => countryCode(c)).filter((c): c is string => !!c));

// The countries a question is about: named in the question, else the job's.
function targetCountries(label: string, ctx: PlanContext) {
  const named = countriesIn(label).filter((c) => c !== "*");
  if (named.length) return named;
  const job = ctx.job.countryCodes.length ? ctx.job.countryCodes : countriesIn(ctx.job.location);
  return job.filter((c) => c !== "*");
}

function money(m: Money, field: FormField): Answer {
  if (field.options.length) {
    const opts = field.options.join(" ");
    let n = m.amount;
    if (/lpa|lakh|lac/i.test(opts)) n = (m.period === "month" ? m.amount * 12 : m.amount) / 100_000;
    else if (/\d+\s*k\b/i.test(opts)) n = m.amount / 1000;
    const o = pickRange(field.options, n);
    return o ? { value: [o], source: "Screening answers: salary" } : null;
  }
  const locale = m.currency === "INR" ? "en-IN" : "en-US";
  return {
    value: [`${m.amount.toLocaleString(locale)} ${m.currency} per ${m.period}`],
    source: "Screening answers: salary",
  };
}

function number(n: number, field: FormField, source: string, unit: string): Answer {
  if (field.options.length) {
    const o = pickRange(field.options, n);
    return o ? { value: [o], source } : null;
  }
  return { value: [n === 0 && unit === "days" ? "Immediately" : `${n} ${unit}`], source };
}

function choose(field: FormField, text: string, source: string): Answer {
  if (!field.options.length) return { value: [text], source };
  const o = pickOption(field.options, text);
  return o ? { value: [o], source } : null;
}

function boolean(field: FormField, yes: boolean, source: string): Answer {
  if (!field.options.length) return { value: [yes ? "Yes" : "No"], source };
  const o = yesNo(field.options, yes);
  return o ? { value: [o], source } : null;
}

function eeo(field: FormField, stored: string, what: string): Answer {
  const source = `Screening answers: ${what}`;
  if (!field.options.length) return { value: [stored], source };
  if (stored === DECLINE || DECLINE_RE.test(stored)) {
    const o = field.options.find((x) => DECLINE_RE.test(x));
    return o ? { value: [o], source } : null;
  }
  return choose(field, stored, source);
}

// ---------- rules ----------

type Rule = { test: RegExp; keys?: RegExp; answer: (f: FormField, ctx: PlanContext) => Answer };

const L = (f: FormField) => f.label.toLowerCase();

// Order matters: the first rule whose pattern matches the label (or the key) decides.
const COVER_LETTER = { test: /^cover letter/, keys: /^cover_letter$/ };

// A cover letter upload the form won't go without: the one case Sortie writes a letter (D-058).
export const requiresCoverLetter = (f: FormField) =>
  f.kind === "file" && f.required && (COVER_LETTER.test.test(L(f)) || COVER_LETTER.keys.test(f.key));

const RULES: Rule[] = [
  // documents
  { test: /^resume|^cv\b|resume\/cv/, keys: /^resume$/, answer: (f, c) => (f.kind === "file" && c.documents.resume ? { value: ["resume"], source: "Your resume" } : null) },
  { ...COVER_LETTER, answer: (f, c) => (f.kind === "file" && c.documents.coverLetter ? { value: ["cover"], source: "Cover letter written for this job (PDF)" } : null) },

  // names and contact
  { test: /^first name|^given name/, keys: /^first_name$/, answer: (_, c) => nameAnswer(c, "first") },
  { test: /^last name|^surname|^family name/, keys: /^last_name$/, answer: (_, c) => nameAnswer(c, "last") },
  { test: /^(full )?name\b(?! pronunciation)/, keys: /^name$/, answer: (_, c) => nameAnswer(c, "full") },
  { test: /^e-?mail|email address/, keys: /^email$/, answer: (_, c) => (c.profile.contact.email ? { value: [c.profile.contact.email], source: "Profile: email" } : null) },
  { test: /^(phone|mobile|contact number|telephone)/, keys: /^phone$/, answer: (_, c) => (c.profile.contact.phone ? { value: [c.profile.contact.phone], source: "Profile: phone" } : null) },

  // Greenhouse's country picker for the phone number
  {
    test: /^country \(for phone\)/,
    answer: (f, c) => {
      const [code] = countriesIn(c.profile.contact.location).filter((x) => x !== "*");
      if (!code) return null;
      return choose(f, new Intl.DisplayNames(["en"], { type: "region" }).of(code)!, "Profile: location");
    },
  },

  // links
  { test: /linkedin/, answer: (_, c) => urlAnswer(c, "linkedin") },
  { test: /git ?hub/, answer: (_, c) => urlAnswer(c, "github") },
  { test: /twitter|\bx url/, answer: (_, c) => urlAnswer(c, "twitter") },
  { test: /portfolio|personal (web)?site|^website|other website/, answer: (_, c) => urlAnswer(c, "portfolio") },

  // work authorization and sponsorship
  {
    test: /sponsor|visa (support|status)|require .*(work permit|visa)/,
    answer: (f, c) => {
      const targets = targetCountries(f.label, c);
      if (!targets.length) return null;
      const auth = authorizedCodes(c.prefs);
      const needs = targets.some((t) => !auth.has(t)) && c.prefs.needsSponsorshipElsewhere;
      return boolean(f, needs, "Preferences: work authorization and sponsorship");
    },
  },
  {
    test: /authori[sz]ed to work|legally (authori[sz]ed|eligible|permitted|able) to work|right to work|eligible to work|work authori[sz]ation/,
    answer: (f, c) => {
      const targets = targetCountries(f.label, c);
      if (!targets.length) return null;
      const auth = authorizedCodes(c.prefs);
      return boolean(f, targets.every((t) => auth.has(t)), "Preferences: authorized countries");
    },
  },

  // where you live, where you'd work
  {
    test: /country .*(reside|live|located|residence)|country of residence|which country are you (in|based)/,
    answer: (f, c) => {
      const [code] = countriesIn(c.profile.contact.location).filter((x) => x !== "*");
      if (!code) return null;
      if (!f.options.length) return { value: [new Intl.DisplayNames(["en"], { type: "region" }).of(code)!], source: "Profile: location" };
      const o = f.options.find((x) => countryCode(x) === code);
      return o ? { value: [o], source: "Profile: location" } : null;
    },
  },
  {
    test: /countr(y|ies) .*(anticipate|expect|plan|intend|want) .*work|which (country|countries) .*(apply|role|position)/,
    answer: (f, c) => {
      const targets = targetCountries("", c);
      const picked = f.options.filter((o) => targets.includes(countryCode(o) ?? ""));
      if (!picked.length) return null;
      return { value: f.kind === "checkbox" ? picked : [picked[0]], source: "The job's location" };
    },
  },
  { test: /^(current )?location|where are you (currently )?(located|based)|city you (live|reside)|current city/, keys: /^location$|^candidate-location$/, answer: (f, c) => {
      const loc = c.profile.contact.location;
      if (!loc) return null;
      // A city search finds "Bengaluru, Karnataka, India" from "Bengaluru", not from "Bengaluru, India".
      const city = loc.split(",")[0].trim();
      return { value: [loc], source: "Profile: location", fallbacks: f.kind === "search" && city !== loc ? [city] : undefined };
    },
  },
  {
    test: /(comfortable|willing|able|open|ok|okay) .*(work|relocat|commut|based|join)\w* .*\b(from|to|in|at|out of) ([a-z][a-z .-]+)\??$/,
    answer: (f, c) => {
      const place = /\b(?:from|to|in|at|out of) ([a-z][a-z .-]+?)\s*(?:office)?\??$/i.exec(f.label)?.[1];
      if (!place) return null;
      const lives = mentionsCity(c.profile.contact.location, place) || c.profile.contact.location.toLowerCase().includes(place.toLowerCase());
      const wants = c.prefs.cities.some((x) => mentionsCity(place, x) || x.toLowerCase() === place.toLowerCase());
      return boolean(f, lives || wants || c.prefs.willingToRelocate, "Preferences: cities and relocation");
    },
  },
  { test: /willing to relocate|open to relocation|relocate\?/, answer: (f, c) => boolean(f, c.prefs.willingToRelocate, "Preferences: relocation") },
  {
    // Only a clear preference answers it: remote-only says yes, no remote says no.
    test: /work remotely|remote (work|location|option)|working remotely/,
    answer: (f, c) => {
      const m = c.prefs.workModes;
      if (m.length === 1 && m[0] === "remote") return boolean(f, true, "Preferences: work modes (remote only)");
      if (!m.includes("remote")) return boolean(f, false, "Preferences: work modes (no remote)");
      return null;
    },
  },
  { test: /hybrid|in[- ]office|on[- ]?site|work from (the |our )?office/, answer: (f, c) => (f.options.length && f.options.some((o) => YES.test(o)) ? boolean(f, c.prefs.workModes.some((m) => m !== "remote"), "Preferences: work modes") : null) },

  // employment
  { test: /current (or (most recent|previous) )?(employer|company)|current or previous employer|most recent (employer|company)/, keys: /^org$/, answer: (f, c) => roleAnswer(f, c, "company") },
  { test: /current (or (most recent|previous) )?(job )?title|current or previous job title|most recent (job )?title/, answer: (f, c) => roleAnswer(f, c, "title") },
  {
    // Your total years answers only the general question. "Years as a data
    // analyst" or "years with Python" is a different claim: left to you.
    test: /years of (\w+ )?(experience|exp)|how many years/,
    answer: (f, c) =>
      c.prefs.yearsOfExperience == null || specificExperience(f.label)
        ? null
        : number(c.prefs.yearsOfExperience, f, "Preferences: years of experience", "years"),
  },
  {
    test: /(ever|previously|before) (been )?(employed|worked) (by|for|at)|worked (at|for) .+ before|former (employee|intern)/,
    answer: (f, c) => {
      const company = norm(c.job.company);
      if (!company) return null;
      const worked = c.profile.experience.some((e) => norm(e.company).includes(company) || company.includes(norm(e.company)));
      return boolean(f, worked, worked ? "Profile: experience" : `Profile: experience (no role at ${c.job.company})`);
    },
  },
  { test: /notice period|how soon can you (join|start)|earliest (start|joining)|when can you (join|start)/, answer: (f, c) => (c.prefs.noticePeriodDays == null ? null : number(c.prefs.noticePeriodDays, f, "Preferences: notice period", "days")) },

  // pay
  { test: /(expected|desired|expectation|target).*(salary|ctc|compensation|pay)|(salary|ctc|compensation) expectation/, answer: (f, c) => (c.answers.expectedSalary ? money(c.answers.expectedSalary, f) : f.options.length ? null : { value: [c.answers.salaryFallback], source: "Screening answers: salary fallback" }) },
  { test: /current (salary|ctc|compensation|pay)|present (salary|ctc)/, answer: (f, c) => (c.answers.currentSalary ? money(c.answers.currentSalary, f) : null) },

  // how you heard
  {
    test: /how did you (hear|find|learn)|where did you (hear|find|learn)|source of (application|referral)|how you heard/,
    answer: (f, c) => {
      const source = "Screening answers: how you heard";
      if (!f.options.length) return { value: [c.answers.hearAbout], source };
      const o =
        pickOption(f.options, c.answers.hearAbout) ??
        f.options.find((x) => /career|company (web)?site|website|job board/i.test(x)) ??
        f.options.find((x) => /^other/i.test(x));
      return o ? { value: [o], source } : null;
    },
  },

  // education
  { test: /(university|college|school|institution).*(attend|graduat|studied|name)|which (university|college|school)|^(university|college|school)\b/, keys: /^school--\d+$/, answer: (f, c) => educationAnswer(f, c, "school") },
  { test: /^degree|highest (level of )?(education|degree)|degree (type|level)|(most recent|latest) degree|degree (you )?(obtained|earned|completed|hold)/, keys: /^degree--\d+$/, answer: (f, c) => educationAnswer(f, c, "degree") },
  { test: /discipline|field of study|major\b/, keys: /^discipline--\d+$/, answer: (f, c) => educationAnswer(f, c, "field") },
  { test: /\bgpa\b|\bcgpa\b|grade point/, answer: (f, c) => educationAnswer(f, c, "grade") },
  { test: /graduat\w* (year|date)|year of graduation/, answer: (f, c) => educationAnswer(f, c, "end") },

  // self-identification (US EEO and similar): what the owner stored, usually "decline"
  { test: /^gender\b|gender identity|^sex\b/, keys: /^eeo\[gender\]$|^gender$/, answer: (f, c) => eeo(f, c.answers.gender, "gender") },
  { test: /race|ethnic/, keys: /^eeo\[race\]$|^race$/, answer: (f, c) => eeo(f, c.answers.ethnicity, "race/ethnicity") },
  { test: /veteran/, keys: /^eeo\[veteran\]$|^veteran_status$/, answer: (f, c) => eeo(f, c.answers.veteran, "veteran status") },
  { test: /disabilit/, keys: /^eeo\[disability\]$|^disability_status$/, answer: (f, c) => eeo(f, c.answers.disability, "disability") },
  { test: /sexual orientation|transgender|lgbt|pronoun/, answer: (f) => { const o = f.options.find((x) => DECLINE_RE.test(x)); return o ? { value: [o], source: "Declined (nothing stored)" } : null; } },
];

function nameAnswer(c: PlanContext, part: "first" | "last" | "full"): Answer {
  const full = c.profile.contact.fullName.trim();
  if (!full) return null;
  const parts = full.split(/\s+/);
  const value = part === "full" ? full : part === "first" ? parts[0] : parts.length > 1 ? parts.slice(1).join(" ") : "";
  return value ? { value: [value], source: "Profile: name" } : null;
}

function urlAnswer(c: PlanContext, kind: Parameters<typeof link>[1]): Answer {
  const url = link(c.profile, kind);
  return url ? { value: [url], source: `Profile: ${kind} link` } : null;
}

function roleAnswer(f: FormField, c: PlanContext, what: "company" | "title"): Answer {
  // "Current company" needs a role you still hold; "current or previous" takes the latest.
  const current = currentRole(c.profile);
  const latestOk = !/current/i.test(f.label) || /previous|most recent|last/i.test(f.label);
  const role = current ?? (latestOk ? latestRole(c.profile) : undefined);
  if (!role) return null;
  return choose(f, role[what], `Profile: ${role === current ? "current" : "latest"} role`);
}

// The usual name for a degree's level, as dropdowns list it.
export function degreeLevel(degree: string): string | undefined {
  const d = degree.toLowerCase().replace(/[.\s]/g, "");
  if (/^(phd|dphil|doctor(ate|ofphilosophy))/.test(d)) return "Doctor of Philosophy (Ph.D.)";
  if (/^mba|masterofbusiness/.test(d)) return "Master of Business Administration (M.B.A.)";
  if (/^(m(s|sc|a|e|tech|eng|com|ca|phil)$|master)/.test(d)) return "Master's Degree";
  if (/^(b(s|sc|a|e|tech|eng|com|ca|ba)$|bachelor)/.test(d)) return "Bachelor's Degree";
  if (/^associate/.test(d)) return "Associate's Degree";
  return undefined;
}

function educationAnswer(f: FormField, c: PlanContext, what: "school" | "degree" | "field" | "grade" | "end"): Answer {
  const e = [...c.profile.education].sort((a, b) => (b.end ?? "9999").localeCompare(a.end ?? "9999"))[0];
  if (!e) return null;
  const raw = what === "end" ? (e.end ?? "").slice(0, 4) : e[what];
  if (!raw) return null;
  const source = "Profile: education";
  if (f.kind === "search") {
    // The list is only known once you type. Try the profile's words, then the
    // degree's level ("B.Tech" → "Bachelor's Degree"), then "Other".
    const level = what === "degree" ? degreeLevel(raw) : undefined;
    const fallbacks = [level, what === "end" || what === "grade" ? undefined : "Other"].filter((x): x is string => !!x);
    return { value: [raw], source, fallbacks };
  }
  if (!f.options.length) return { value: [raw], source };
  const o = pickOption(f.options, raw) ?? (what === "degree" ? pickOption(f.options, degreeLevel(raw) ?? "") : undefined) ?? (what === "school" ? f.options.find((x) => /^other\b/i.test(x)) : undefined);
  return o ? { value: [o], source: o === raw || norm(o) === norm(raw) ? source : `${source} (not listed: "${raw}")` } : null;
}

// "Years of experience as a data analyst", "with Python", "in fintech": the
// question is about part of your experience, not all of it.
const GENERIC_EXPERIENCE = new Set(["total", "overall", "professional", "work", "working", "full", "time", "industry", "paid", "relevant"]);
export function specificExperience(label: string) {
  const l = label.toLowerCase().replace(/\([^)]*\)/g, " ");
  if (/\b(as an?|with|using|working (on|with))\s+\w/.test(l)) return true;
  if (/\bin (?!total\b|the industry\b|industry\b|years?\b)\w/.test(l)) return true;
  const of = /years of ((?:[\w-]+,? ){1,3})(?:experience|exp)/.exec(l)?.[1];
  return !!of && of.trim().split(/[\s,-]+/).some((w) => w && !GENERIC_EXPERIENCE.has(w));
}

// ---------- consent and the answer bank ----------

const CONSENT =
  /consent|i agree|agree to|acknowledge|certify|attest|opt[- ]?in\b|subscribe|marketing (messages|emails|communications)|privacy (notice|policy)|terms (and|&) conditions|\brecord(ed|ing)?\b|transcri|notetaker|note-taker|background check|true and (complete|accurate)/i;
export const isConsent = (f: FormField) => CONSENT.test(f.label);

const STOP = new Set("a an the you your are do does is of to in for will be with have has any this that what please".split(" "));
const tokens = (s: string) => new Set(norm(s).split(" ").filter((t) => t && !STOP.has(t)));

export function bankMatch(bank: CustomAnswer[], label: string): CustomAnswer | undefined {
  const a = tokens(label);
  if (!a.size) return undefined;
  let best: { c: CustomAnswer; score: number } | undefined;
  for (const c of bank) {
    const b = tokens(c.question);
    const inter = [...a].filter((t) => b.has(t)).length;
    const score = inter / (a.size + b.size - inter);
    if (score >= 0.8 && (!best || score > best.score)) best = { c, score };
  }
  return best?.c;
}

function fromBank(f: FormField, bank: CustomAnswer[]): Answer {
  const hit = bankMatch(bank, f.label);
  if (!hit || !hit.answer.trim()) return null;
  const source = `Answer bank: "${hit.question}"`;
  if (!f.options.length) return { value: [hit.answer], source };
  if (f.kind === "checkbox") {
    // One option per line (how Sortie saves them; options can hold commas), else comma-separated.
    const lines = hit.answer.split("\n").map((s) => s.trim()).filter(Boolean);
    const wanted = lines.every((w) => pickOption(f.options, w)) ? lines : hit.answer.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    const picked = wanted.map((w) => pickOption(f.options, w)).filter((o): o is string => !!o);
    return picked.length === wanted.length ? { value: picked, source } : null;
  }
  const o = pickOption(f.options, hit.answer) ?? (YES.test(hit.answer) ? yesNo(f.options, true) : NO.test(hit.answer) ? yesNo(f.options, false) : undefined);
  return o ? { value: [o], source } : null;
}

// Free-text fields Sortie never fills on its own: the resume/cover-letter
// paste-in alternatives and catch-all comment boxes.
const ALWAYS_SKIP = /^(resume_text|cover_letter_text|comments)$/;

export function planField(f: FormField, ctx: PlanContext): PlannedField {
  const done = (a: NonNullable<Answer>, by: PlannedField["by"]): PlannedField => ({
    ...f,
    value: a.value,
    state: "ok",
    by,
    source: a.source,
    ...(a.fallbacks?.length ? { fallbacks: a.fallbacks } : {}),
  });
  const empty = (state: PlannedField["state"], source: string): PlannedField => ({ ...f, value: [], state, by: null, source });

  if (ALWAYS_SKIP.test(f.key)) return empty("skip", "Left empty on purpose");

  // Consent is the owner's call, every time, unless they answered this exact question before.
  if (isConsent(f)) {
    const bank = fromBank(f, ctx.answers.custom);
    if (bank) return done(bank, "bank");
    return empty(f.required ? "decide" : "skip", f.required ? "Consent: needs your decision" : "Optional consent left empty");
  }

  const label = L(f);
  for (const rule of RULES) {
    if (!(rule.test.test(label) || rule.keys?.test(f.key))) continue;
    const a = rule.answer(f, ctx);
    if (a && a.value.length && a.value.every((v) => v !== "")) return done(a, "rule");
    break; // the right rule had no data: don't let a looser rule guess
  }

  const bank = fromBank(f, ctx.answers.custom);
  if (bank) return done(bank, "bank");
  return empty(f.required ? "missing" : "skip", f.required ? "Nothing stored answers this" : "Optional, nothing stored");
}

export const planForm = (fields: FormField[], ctx: PlanContext) => fields.map((f) => planField(f, ctx));

export const unresolved = (plan: PlannedField[]) => plan.filter((p) => p.state === "missing" || p.state === "decide");
