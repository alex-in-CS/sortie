# Dev log

Newest first. What was built, what broke, how it was fixed, and how it was checked.

## 2026-10-19 (Mon)

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
