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
| 3 | `companies`, `jobs`, `matches`, `tasks` | Phase 2: job sourcing and matching (§6). |

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
| `custom[]` | `{id, question, answer, source: manual\|learned}`, the answer bank. `learned` entries are answers you give on the Applications page (D-055). |

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

## 6. Jobs (v3, phase 2)

All defined in `db.ts` migration v3 and accessed only through `src/lib/jobs.ts`.

### `companies`

| Column | Meaning |
| --- | --- |
| `id` | Integer key. |
| `name` | Display name, refreshed from the registry on every sync. |
| `provider`, `board` | `greenhouse` · `lever` · `ashby` · `smartrecruiters` · `workday`, and the board id. Workday ids look like `tenant.wd5/Site`. Unique together. |
| `origin` | `registry` today; `manual` and `discovered` are reserved for FR-13. |
| `careers_url` | Public careers page, when known. |
| `enabled` | 1/0. The owner's switch; registry syncs never change it. Off = not fetched, hidden from matches. |
| `last_fetched_at`, `last_job_count`, `last_error` | Result of the last fetch of this board. |

The registry itself lives in `src/lib/registry/companies.json` (D-038), with `unsupported` (big names
on portals we can't read, with their ATS) and `notFound` lists for the Companies page.

### `jobs`

| Column | Meaning |
| --- | --- |
| `company_id`, `provider_job_id` | Unique together. Workday uses the requisition suffix of the path (`JR2026102-1`). |
| `title`, `location` | As posted. Multi-location postings are joined with `; `. |
| `country_codes` | JSON array of ISO alpha-2 codes the provider stated (text locations are resolved at match time). |
| `work_mode`, `employment_type`, `department`, `level` | Normalised when stated, else null. `level` is the provider's own seniority label. |
| `description` | Plain text. Null until `detail()` runs for Workday/SmartRecruiters jobs (D-039). |
| `url`, `apply_url` | Public posting and apply links. |
| `salary` | JSON `{min, max, currency, period}` when the provider states it (Lever, Ashby). |
| `posted_at` | First value seen is kept (Workday dates are relative). |
| `first_seen_at`, `last_seen_at`, `closed_at` | Lifecycle. Closed when missing from a complete fetch; reopened if it comes back (D-043). |
| `hash` | Hash of the normalised content; changes trigger a re-match. |

### `matches`

One row per (job, search). `score` 0–100, `rejected` (the first failed hard filter, or null),
`seniority` (inferred), `matched` / `missing` / `notes` (JSON string arrays), `input_hash` (D-041),
`scored_at`. (The unused `llm_score` and `llm_reasons` columns were dropped in v4; Claude's view lives in `reviews`.) Rows for deleted searches are
pruned on every match run.

### `tasks`

The worker queue and run log (D-033, D-042): `type` (`fetch`, `match`, `prepare`, `handoff`), `payload` (JSON), `status`
(`queued` · `running` · `done` · `failed`), `attempts`, `run_after`, `started_at`, `finished_at`,
`result` (JSON stats of the run), `last_error`, `created_at`.

## 7. Reviews and applications (v4, phase 3; v5, phase 4)

### `reviews`
Claude's review of one (job, search): `score` 0–100, `verdict` (strong, good, stretch, poor), `reasons`
and `gaps` (JSON string arrays), `dealbreaker` (text or null), `model`, `input_hash`, `reviewed_at`.
Primary key (`job_id`, `search_id`). It's kept apart from `matches` so the daily rule re-score never
discards a paid review. The hash has no date in it (D-050). Rows for deleted searches are pruned.

### `applications`
One row per job Sortie (or you) chose, **unique on `job_id`**: `search_id`, `origin` (auto, manual),
`status`, `score` (the score it was picked on), `mode` (auto, review, copied from the search),
`resume` (JSON `TailoredResume`), `truth` (JSON `TruthReport`), `resume_file` (path under `data/`),
`error`, `attempts`, `created_at`, `updated_at`.

Statuses (`APPLICATION_STATUSES` in `schema.ts`):

```text
queued → tailoring → ready → applying → held → submitting → submitted
                       ↑         │          │        │
                       │         └──────────┴────────┴──→ needs_you
                       └── refill (after you answer questions)
```

- `queued` → `tailoring` → `ready`, or back to `queued` on failure until the third attempt, then
  `needs_you` (phase 3).
- `applying`: the form step is reading and filling the form (D-056).
- `held`: filled and checked, waiting for you. `submitting`: open in Chrome for you to submit.
- `submitted`: sent, by Sortie (auto mode, confirmation seen) or by you.
- `needs_you`: a question only you can answer, an unsupported board, or a failure. `skipped` is the
  owner's no.

Caps count every status except `skipped` (D-050).

Phase 4 columns (v5):
- `apply_url`: the form.
- `plan`: JSON `PlannedField[]`, each field's value, state and source (D-055).
- `fill`: JSON `FillResult[]`, what read back from the page.
- `screenshot`: path under `data/` of the filled form.
- `submitted_at` and `submitted_by` (`sortie` or `you`).

### `application_events`
The step history (NFR-6): `application_id`, `at`, `kind` (selected, tailoring, ready, retry, applying,
held, submitting, opened, submitted, needs_you, skipped, queued…), `detail`. The latest `detail` is shown
on the card: why it's held, or what failed.

Files: `data/resumes/<application id>/<Name>-Resume.pdf` and `<Name>-Cover-Letter.pdf`; the filled
form's screenshot is `data/applications/<application id>/form.png`.

## 8. Planned tables (phases 4–6)

| Table | Key columns | Purpose |
| --- | --- | --- |
| `applications` (more columns) | `stage` | After submitted: stage ∈ applied, in_process, interview, offer, rejected, withdrawn, set from the inbox (phase 5). |
| `emails` | `id (gmail id), thread_id, from, subject, received_at, category, application_id, snippet` | Classified inbox items (no bodies stored beyond what's needed). |
