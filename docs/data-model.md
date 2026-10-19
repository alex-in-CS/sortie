# Data model

All shapes are defined once in [`src/lib/schema.ts`](../src/lib/schema.ts) (D-006). This page explains
what each field means and why it exists.

## 1. Storage

SQLite file `data/sortie.db` (WAL), opened by `getDb()` in `src/lib/db.ts`. Schema version is in
`PRAGMA user_version`.

| Version | Change | Why |
| --- | --- | --- |
| 1 | `profile`, `preferences` (single-row tables), `documents` | Phase 1. |
| 2 | `settings(key PK, data, updated_at)`; v1 rows moved in; old role filters → first search; v1 tables dropped | One home for every single-document setting (D-022). |

### `settings`

| key | Schema | Default when missing |
| --- | --- | --- |
| `profile` | `Profile` | `emptyProfile()` |
| `preferences` | `Preferences` | `defaultPreferences()` |
| `searches` | `Search[]` | one draft search, "Software engineering" (unsaved; `updatedAt = null`) |
| `answers` | `Answers` | `defaultAnswers()` |

`updated_at` is an ISO timestamp. `null` from the store means "never saved", which the overview uses
to decide what's still to do.

### `documents`

| Column | Meaning |
| --- | --- |
| `id` | UUID; also the stored file's name. |
| `kind` | `resume` today; later `tailored_resume`, `cover_letter`. |
| `filename` | Original name as uploaded. |
| `path` | Absolute path under `data/uploads/`. |
| `mime` | Detected from the extension first, falling back to the browser's type. |
| `created_at` | Upload time; the latest `resume` is the "current" one. |

## 2. Profile (the master record)

Invariant (NFR-1): **everything here is a fact the owner stands behind.** Every generated artifact
must trace back to it.

| Field | Type | Notes |
| --- | --- | --- |
| `contact.fullName/email/phone/location` | string | Used verbatim on forms. Phone includes the country code. |
| `contact.links[]` | `{label, url}` | Label inferred from the host (LinkedIn, GitHub). |
| `headline` | string | One-line positioning. |
| `summary` | string | Short bio. |
| `skills[]` | `Skill` | See below. |
| `experience[]` | `{id, company, title, location, start, end\|null, bullets[], skills[]}` | Dates as `YYYY-MM` or `YYYY`; `end: null` = current. Bullets verbatim. |
| `projects[]` | `{id, name, url, description, bullets[], skills[]}` | |
| `education[]` | `{id, school, degree, field, start, end\|null, grade}` | |
| `certifications[]` | `{id, name, issuer, year}` | |

**Skill:** `{id, name, category, level, years|null, source}`
- `category`: language · framework · database · cloud · tool · concept · soft · other
- `level`: learning · working · strong · expert (evidence-based when parsed, see the prompt in `llm.ts`)
- `source`: `resume` (parsed) or `manual` (typed in). Manual entries are never overwritten.

`ParsedResume` is the same shape minus `id` and `source` fields. It's what Claude must return; ids
and provenance are added in `mergeResume`.

## 3. Searches

| Field | Type | Meaning |
| --- | --- | --- |
| `id`, `name` | string | |
| `enabled` | bool | Paused searches are kept but not run. |
| `titles[]` | string[] | Optional title keywords. **Empty means skills decide**: any software role the profile fits. |
| `seniority[]` | intern · entry · mid · senior · lead | |
| `employmentTypes[]` | full-time · internship · contract · part-time | |
| `excludeKeywords[]` | string[] | Matched against title and description. |
| `minMatch` | 0–100 (UI 40–95) | Selectivity. Jobs scoring below this are ignored for this search. |
| `mode` | `review` · `auto` | Review: prepare and wait. Auto: submit where allowed (D-013). |

## 4. Answers

| Field | Meaning |
| --- | --- |
| `expectedSalary`, `currentSalary` | `Money \| null` (`{amount, currency, period: year\|month}`). Null current salary = don't disclose. |
| `salaryFallback` | Text for free-text salary fields when no figure fits. Default "Negotiable" (D-020). |
| `hearAbout` | Default "Company careers page". |
| `gender`, `ethnicity`, `veteran`, `disability` | US self-ID. Default "Decline to self-identify" (D-021). Never used for matching. |
| `custom[]` | `{id, question, answer, source: manual\|learned}`, the answer bank. `learned` entries come from review edits (phase 4). |

## 5. Preferences (global)

| Field | Meaning |
| --- | --- |
| `workModes[]` | remote · hybrid · onsite |
| `countries[]`, `cities[]` | Where the owner would work; cities narrow onsite and hybrid roles. |
| `authorizedCountries[]` | Can work there without sponsorship. |
| `needsSponsorshipElsewhere` | If true, jobs elsewhere that state "no sponsorship" are filtered out. |
| `willingToRelocate` | Relaxes the city filter. |
| `yearsOfExperience`, `noticePeriodDays` | Form answers; also a seniority sanity check. |
| `minSalary` | `Money \| null`. Applied only when a posting lists pay. |
| `excludeCompanies[]` | Never apply, in any search. |
| `maxPerCompany` (1–10, default 3), `dailyLimit` (1–200, default 25) | Global caps (D-014). |
| `discovery` | Use the jobs API to find new companies (when configured). |

## 6. Planned tables (phases 2–6)

Designed now so the phases fit together. Exact columns are finalised as each phase lands.

| Table | Key columns | Purpose |
| --- | --- | --- |
| `companies` | `id, name, provider, board, tier, careers_url, enabled, last_fetched_at, last_error` | The registry (FR-11). `provider` ∈ greenhouse, lever, ashby, smartrecruiters, workday, other. |
| `jobs` | `id, company_id, provider_job_id, title, location, remote, employment_type, salary_min/max/currency, description, url, apply_url, posted_at, first_seen_at, last_seen_at, closed_at, hash` | Normalised postings; unique (`company_id`, `provider_job_id`); `hash` detects edits. |
| `matches` | `job_id, search_id, det_score, llm_score, reasons(json), filtered_reason, scored_at` | Why a job did or didn't qualify. |
| `applications` | `id, job_id, search_id, status, resume_doc_id, cover_doc_id, answers(json), submitted_at, stage, updated_at` | Unique (`job_id`); status ∈ saved, ready, review, handoff, applied, failed, skipped; stage ∈ applied, in_process, interview, offer, rejected, withdrawn. |
| `application_events` | `id, application_id, at, kind, detail(json)` | The step history (NFR-6). |
| `emails` | `id (gmail id), thread_id, from, subject, received_at, category, application_id, snippet` | Classified inbox items (no bodies stored beyond what's needed). |
| `tasks` | `id, type, payload(json), status, attempts, run_after, last_error, created_at` | The worker queue (D-033). |
