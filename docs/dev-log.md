# Dev log

Newest first. What was built, what broke, how it was fixed, and how it was checked.

## 2026-10-19 (Mon), Day 1

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
