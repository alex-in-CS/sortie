# Dev log

Newest first. What was built, what broke, how it was fixed, and how it was checked.

## 2026-10-23 (Fri)

### First live AI calls; tailor only when it helps (D-058)
- **Keys.** A Gemini key was added but its project is on the free tier (`gemini-4-argon` free quota
  is 0; D-057 requires billing anyway), so the owner switched to Claude. A test prompt to Opus 5.5
  and Sonnet 5.5 returned 200.
- **First resume read.** The owner's DOCX resume parsed in 44 s: 52 skills, 3 roles, 2 projects, 1
  education entry, 6 certifications.
- **Cost.** Tailoring every pick (resume, cover letter, Opus truth check) was about $0.20 of the
  estimated $0.25 per application. Owner: tailor only if necessary, send their uploaded resume
  otherwise, write cover letters only when a form requires one, and tailor where the resume as
  written has a low chance of a shortlist.
  - The review (Sonnet) now reads the resume as written and returns `resumeAdvice`. Only when it's
    set does Opus tailor, guided by that sentence. Prompt version 2; DB v6 adds
    `reviews.resume_advice`.
  - Otherwise the upload is copied as `Name-Resume.<ext>`. With no upload, the profile is rendered as is.
  - The form step writes a cover letter (Opus + truth check) only when a required file field is a
    cover letter.
  - The UI says which resume went out and why one was tailored. The file route serves DOCX.
- Checked: new tests for the as-uploaded path (bytes untouched, renamed, only reviews paid for, the
  review sees the resume text), tailoring guided by the advice, the cover-letter detector and
  storage, and DB v6. 95 tests, tsc and lint pass. **Not yet checked:** a live cycle against real
  boards with the new review prompt.

## 2026-10-19 (Mon)

### Gemini as a second AI provider (D-057)
- The owner has Gemini (Google AI Pro) and asked to use it, or free OpenRouter models, instead of
  Claude. `structured()` now runs on Claude or Gemini (the `@google/genai` 2.30 SDK), picked by
  `SORTIE_LLM` or by whichever key is set. Schemas are trimmed to Gemini's JSON Schema subset, PDFs
  go in as `inlineData`, effort maps to `thinkingLevel`, and the same plain errors come out. UI text
  names the active provider.
- Checked the facts first: the current Gemini model list (`gemini-4-argon`, `gemini-3.8-flash`) and
  the API terms. The unpaid tier may train on and human-review prompts, and says not to send
  personal data. A Google AI Pro subscription doesn't cover API keys. So the docs require a
  billing-enabled key. OpenRouter free models were rejected (about 50 requests a day, logging, no
  PDFs).
- Checked: 8 new tests (the schema subset for every real schema; the request shape; MAX_TOKENS,
  safety, blocked, bad JSON and wrong shape; retry without thinking; key errors; provider choice).
  93 tests, tsc, lint and build all pass. **Not yet checked:** a live Gemini call (no key yet).

### Phase 4: filling application forms, held for you to submit
- **Form model (D-054):** Greenhouse questions come from its public API (with the phone country, the
  city search and education added). Lever questions are read from the page. Other boards hand off by
  link.
- **Answers (D-055):** consent → rules → answer bank → Claude (Sonnet, must quote your data; code checks
  the quote, the options and every number) → you. Your answers go into the bank as `learned`.
- **Fill and check (D-056):** headless Chrome fills every field and reads it back, without attaching
  files, and saves a screenshot. Then the application is held, sent to Needs you, or (auto mode +
  `SORTIE_AUTO_SUBMIT=on` + nothing from Claude + all read back + no CAPTCHA) submitted. **Open in
  Chrome** fills everything in a visible window, files included, and waits for the confirmation page.
- **DB v5:** `apply_url`, `plan`, `fill`, `screenshot`, `submitted_at`, `submitted_by`. New statuses:
  applying, held, submitting, submitted.
- **UI:** the Applications page has Needs you (with the open questions as a form), Ready to submit,
  Being prepared, Submitted and Skipped; a plan table showing each value and its source, with Claude's
  answers highlighted; the screenshot; and Open in Chrome, Fill again, I submitted it and Skip.
- **Worker:** a `handoff` task (one window at a time); `applying` and `submitting` are reset on start;
  the form step runs at the end of every cycle (no API key needed).
- **Live checks (read-only, nothing submitted, D-037):** `npm run try-apply` and the full form step
  ran against Stripe's Greenhouse form and Hevo's Lever form with the demo profile. Both went
  questions → answered → filled → **held**, with a screenshot. **Open in Chrome** was run once on
  Stripe's form with a 20-second timeout: everything filled, both PDFs attached, and it went back to
  held when no confirmation came.
- **Bugs the live forms found, all fixed:**
  - The phone country "India" picked "British Indian Ocean Territory". Dropdowns now take only an
    exact option, or one that starts with the wanted words.
  - Clicking an open dropdown closed it, so the second value tried never matched. Each try now starts
    closed and types key by key.
  - The city search found nothing for "Bengaluru, India"; it now falls back to "Bengaluru". "B.Tech"
    now maps to "Bachelor's Degree", and an unlisted school to "Other".
  - Greenhouse removes the file input once a file is attached, so the read-back waited 30 s and
    failed. It now checks that the file name is showing.
  - Stripe asked for "years of experience **as a data analyst**", and the general years rule answered
    it with total years: a false claim. That rule now answers only the general question.
  - A WhatsApp opt-in was treated as a missing answer; opt-ins and marketing questions now count as
    consent. "Ever employed by Stripe" is answered from your roles, and "most recent degree" is
    recognised.
- Checked: tsc, lint, 85 tests (Lever forms filled in real Chrome from saved copies; Stripe's API
  response planned; grounding, the gate, dropdown matching and the full status flow on a temp DB), a
  prod build, API smoke tests (screenshot 200 and 404; answers 400 and 200; open, refill 409 while
  open, submitted, skip 409 after), and screenshots at 1280 px and 390 px.
- **Not yet checked:** Claude's grounded answers live (no API key); a real submission (by design).

### Phase 3: Claude reviews, selection, tailoring, truth check, PDFs
- **Review (D-050):** Sonnet 5.5 reviews the best rule candidates (within 10 points of a search's bar,
  with a description, at most 40 per cycle). Its output is structured: score, verdict, reasons, gaps
  and dealbreaker. Reviews go in their own `reviews` table, hashed without the date. An auth error
  stops the batch instead of failing 40 times.
- **Select (D-050):** pure `selectJobs()`: Claude's score when present; the bar; dealbreakers and
  `poor` verdicts out; best first; each job once; the per-company cap (30 days) and the daily cap.
  Manual **Apply** skips the bar and the caps but counts toward them.
- **Tailor + truth check (D-051):** Opus 5.5 returns wording only. Rule checks: skills, ids, and
  numbers and technologies per entry. Then a second Opus pass flags unsupported statements. Flagged
  text is removed, or reverted to the profile's text. The truth report is stored and shown.
- **PDF (D-052):** a one-column HTML template, printed by playwright-core through the installed Chrome
  (0.5 s per document). Resume and cover letter go to `data/resumes/<id>/`.
- **DB v4:** `reviews`, `applications` (unique per job), `application_events`. Dropped the unused
  `llm_*` columns from `matches`. Migrated the real 30k-job database in 74 ms; a v3 backup is in the
  session scratchpad.
- **UI:** an Applications page (needs you, ready, being prepared, skipped; review; PDFs; truth report;
  skip, restore, re-tailor); Claude's verdict and an Apply button on Jobs; an overview step; nav.
- **Worker:** a `prepare` task type for manual picks; applications interrupted mid-tailoring are
  requeued on start; Chrome is closed after each task.
- **Bugs found and fixed:**
  - The truth check removed a cover-letter sentence that named the employer ("…role at ClickHouse"),
    reading it as a claimed skill. The cover letter may now name the employer and the role; bullets
    still may not. There's a test for it.
  - A killed `npm run fetch` left its task `running` forever, so the Fetch button showed
    "Fetching…" forever. Such tasks are now abandoned after 3 h (D-053), with a test.
  - Phone layout: the action buttons squeezed job titles into a narrow column. They now stack under
    the content below 640 px. Raw statuses ("needs_you") now show as words.
- **Third live fetch (phase 2 fixes):** 440 s; 216 boards fetched, 0 failed; Salesforce rested after
  its 429 (D-048); 1,157 descriptions fetched. Jobs without a description went from 4,941 to 2,909.
- Checked: tsc, lint, 65 tests (`autopilot.test.ts` runs review → select under caps → tailor → both
  truth passes → files on disk, with Claude and Chrome faked; retries → needs_you; blocked without a
  profile), and a prod build. On demo data: real PDFs rendered and inspected; all pages 200; API smoke
  test (manual pick 201, then 200 on repeat; skip/restore/409/400; PDF 200; an unknown file 404); and
  screenshots at 1366 px and 390 px.
- **Not yet checked:** any live Claude call (no API key on the machine).

### Phase 2: job sourcing, filtering and match scores
- **Registry (D-038, D-044):** probed about 317 candidate names on Greenhouse, Lever and Ashby, plus
  113 enterprises on Workday and SmartRecruiters (`scripts/verify-registry.ts`). 217 boards answered
  live and went into `companies.json`. 56 run portals with no public feed (Deloitte, EY, KPMG,
  SanDisk, Google…) and are listed by hand; 141 had no board. Ambiguous slugs were dropped or pinned
  (Navi, Neon → `neondatabase`, Gong).
- **Adapters (D-039):** Greenhouse, Lever, Ashby, SmartRecruiters and Workday behind one `SourceJob`
  shape. A polite client handles the User-Agent, the per-host gap, timeouts and backoff. Contract tests
  run on trimmed real responses in `sources/fixtures`.
- **Store (DB v3):** companies, jobs, matches and tasks. Upserts keep descriptions, countries and the
  first posted date; jobs close only after a complete fetch (D-043).
- **Matching (D-040, D-041):** hard filters with plain-English reasons, a 0–100 score, an input-hash
  skip. The Jobs page has Qualifying, Below your bar and Filtered out views.
- **Worker (D-042):** `npm run worker` runs every 2 h ±10%; `npm run fetch` does one run. A SQLite
  task queue backs the Fetch now button.
- **First live fetch:** 457 s, 217 boards, 30,017 jobs (Greenhouse 17,770, Workday 5,563, Ashby 3,792,
  Lever 1,966, SmartRecruiters 926), 4,941 without a description, 3 boards failed.
- **Bugs found on real data, and their fixes:**
  - Accenture and PwC crashed with `reading 'trim'`: some Workday rows lack fields. All adapters now
    drop malformed rows, with a regression test.
  - Salesforce returned HTTP 429. Added a host hold, an adaptive gap and a 12 h board rest (D-048).
  - US "City, ST" locations had no country. Fixed with Intl region names, state lists and codes (D-045).
  - "Engineer" matched electrical and support roles, and an underscore title hid "Senior". Fixed with
    the new role classifier and title normalisation (D-046).
  - The company's own product was listed as a missing skill. Now filtered (D-046).
  - Stale scores remained after rule changes. `MATCH_RULES_VERSION` is now in the hash (D-046).
  - The Companies page crashed with "Only plain objects…": null-prototype rows. Fixed with `plain()`
    (D-047).
  - The Fetch button showed the last finished run while another was queued. `lastTask()` now prefers
    live tasks.
  - 4,941 jobs had no description. The detail budget went from 40 to 100 (D-049).
- **Second live fetch (pre-fix code):** 427 s, +404 new (Accenture and PwC now fetched, +200 each),
  1 closed, only Salesforce failed. Re-fetching everything else added 0 new, so upserts are idempotent.
- **Demo matching** (made-up profile): the "Software engineering" search gave 59 qualifying, 383 below
  the bar and 29,575 filtered out. `matchAll` takes 1.6 s for 60k pairs and 0.7 s when all are
  skipped.
- Checked: tsc, lint, 51 tests, prod build, and every page returns 200 on demo data. API smoke test:
  switching a company on/off works, a bad body gets 400 and an unknown id 404, and Fetch now queues a
  run without duplicating one. Screenshots of Jobs and Companies.

### Searches, screening answers, docs (`a99551c` + docs commit)
- Studied JobCopilot's public pages and REA's docs (research.md). Took searches, per-search mode and
  selectivity, screening answers and an answer bank; the rest went into the roadmap (D-029, D-030).
- Split role filters out of preferences into **searches** (D-019). Added **answers** (D-020, D-021).
- DB v2: keyed `settings` table, function migrations, and v1 data carried over (D-022).
- Generic `setting()` store and `settingRoute()` GET/PUT helper.
- Tests: Vitest config with `@` alias and a `server-only` stub; migration tests (fresh DB; v1 → v2
  with old role filters becoming a search). 5/5 pass.
- Checked: tsc, lint, build; prod server smoke test (all pages 200, searches/answers PUT round-trip,
  invalid search → 400); screenshots of Searches and Answers.
- Owner set the deadline: **3 days**, full documentation. Wrote this docs folder.

### Phase 1 (`6950d9e`)
- Scaffolded Next.js 16.4 / React 19.3 / Tailwind 4 / TypeScript. Built on `node:sqlite` because
  npm 11 blocks native install scripts (D-004).
- Resume upload → Claude Opus 5.5 structured parse → merge → profile; editors for skills, roles,
  projects, education and certs; preferences; overview checklist.
- **Bug:** a failed parse still stored the file and marked the resume done. **Fix:** store only after
  a successful parse (D-010).
- **Bug:** hydration mismatch, with en-US server dates vs en-IN browser dates. **Fix:** fixed en-GB
  formatter (D-025).
- **Bug:** `next build` failed with `database is locked`: 10 build workers opened the DB at import and
  raced on the first migration. **Fix:** lazy `getDb()`, busy timeout, `BEGIN IMMEDIATE` with a
  version re-check (D-023).
- **Gotcha:** Next 16 Cache Components rejects `export const dynamic`; pages use Suspense +
  `connection()` (D-024).
- Checked: tsc, lint, 3 merge tests, a prod build from a fresh state, API PUT/validation, upload error
  paths (no key → 502 with a message; .exe → 415), 5 concurrent requests on a fresh DB, screenshots at
  1366 px and 390 px.
- **Not yet checked:** a real resume parse (no API key on the machine yet).
- Repo is local only, by the owner's instruction (D-028).
