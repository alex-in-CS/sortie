# Decision log

Every decision that shaped Sortie: what we chose, what else we could have done, and what it costs us.
Entries are append-only (see [docs/README.md](README.md)). **Status:** Accepted, Proposed (planned but
not yet built), or Superseded.

Index

| ID | Decision | Status |
| --- | --- | --- |
| [D-001](#d-001-personal-tool-not-a-multi-user-product) | Personal tool, not multi-user | Accepted |
| [D-002](#d-002-typescript-end-to-end) | TypeScript end to end | Accepted |
| [D-003](#d-003-one-nextjs-app-for-ui-and-api-a-separate-worker-later) | One Next.js app for UI + API; worker later | Accepted |
| [D-004](#d-004-nodes-built-in-sqlite) | Node's built-in SQLite | Accepted |
| [D-005](#d-005-settings-as-validated-json-documents) | Settings as validated JSON documents | Accepted |
| [D-006](#d-006-zod-schemas-are-the-single-source-of-truth) | Zod schemas as the single source of truth | Accepted |
| [D-007](#d-007-claude-opus-55-structured-outputs-refusal-fallback) | Claude Opus 5.5, structured outputs, refusal fallback | Accepted |
| [D-008](#d-008-pdfs-go-to-claude-directly-docx-is-converted-to-text) | PDFs go to Claude directly; DOCX → text | Accepted |
| [D-009](#d-009-resume-merge-the-users-edits-always-win) | Resume merge: the user's edits always win | Accepted |
| [D-010](#d-010-store-an-upload-only-after-it-parses) | Store an upload only after it parses | Accepted |
| [D-011](#d-011-skill-model-category-four-levels-years) | Skill model: category, four levels, years | Accepted |
| [D-012](#d-012-no-linkedinglassdoor-scraping-company-career-feeds-instead) | No LinkedIn/Glassdoor scraping | Accepted |
| [D-013](#d-013-hybrid-apply) | Hybrid apply | Accepted |
| [D-014](#d-014-caps-per-company-and-per-day) | Caps per company and per day | Accepted |
| [D-015](#d-015-searches-start-in-review-mode) | Searches start in review mode | Accepted |
| [D-016](#d-016-tailoring-is-truthful-and-checked) | Tailoring is truthful and checked | Accepted (built in phase 3) |
| [D-017](#d-017-local-only-by-default) | Local only by default | Accepted |
| [D-018](#d-018-telegram-for-notifications) | Telegram for notifications | Accepted |
| [D-019](#d-019-several-searches-instead-of-one-set-of-role-filters) | Several searches instead of one set of role filters | Accepted |
| [D-020](#d-020-screening-answers-and-an-answer-bank-that-learns) | Screening answers and an answer bank that learns | Accepted |
| [D-021](#d-021-self-identification-defaults-to-decline) | Self-identification defaults to decline | Accepted |
| [D-022](#d-022-schema-v2-one-keyed-settings-table) | Schema v2: one keyed settings table | Accepted |
| [D-023](#d-023-open-the-database-lazily-wait-on-locks) | Open the database lazily, wait on locks | Accepted |
| [D-024](#d-024-db-backed-pages-render-inside-suspense-after-connection) | DB-backed pages: Suspense + `connection()` | Accepted |
| [D-025](#d-025-dates-use-a-fixed-locale) | Dates use a fixed locale | Accepted |
| [D-026](#d-026-explicit-save-not-autosave) | Explicit save, not autosave | Accepted |
| [D-027](#d-027-testing-strategy) | Testing strategy | Accepted |
| [D-028](#d-028-the-repository-stays-local-for-now) | The repository stays local for now | Accepted |
| [D-029](#d-029-how-rea-and-jobcopilot-are-used) | How REA and JobCopilot are used | Accepted |
| [D-030](#d-030-jobcopilot-features-taken-and-skipped) | JobCopilot features taken and skipped | Accepted |
| [D-031](#d-031-check-feeds-every-2-hours) | Check feeds every 2 hours | Proposed |
| [D-032](#d-032-deterministic-prefilter-before-any-llm-scoring) | Deterministic prefilter before LLM scoring | Proposed |
| [D-033](#d-033-a-separate-worker-process-with-a-sqlite-backed-queue) | Separate worker process, SQLite-backed queue | Proposed |
| [D-034](#d-034-tailwind-and-design-tokens-no-component-library) | Tailwind + tokens, no component library | Accepted |

---

### D-001: Personal tool, not a multi-user product
- **Date:** 2026-10-19 · **Status:** Accepted (owner's choice)
- **Context:** The original idea mentioned signing in "with phone and email". A multi-user product
  needs auth, per-user storage, encrypted OAuth tokens, and (for Gmail) Google's restricted-scope
  security assessment before launch.
- **Decision:** A single-user tool that runs on the owner's machine with the owner's keys. Phone and
  email are profile fields used to fill forms, not a login.
- **Alternatives:** A hosted multi-user SaaS like JobCopilot.
- **Tradeoffs:** Far less to build and nothing to certify, and the owner's data never sits on a
  server. In exchange it only runs while the PC is on, and nobody else can use it without cloning it.
- **Consequences:** No auth layer. The server binds to localhost ([D-017](#d-017-local-only-by-default)).
  Gmail can use OAuth "testing" mode with the owner as the only test user (see R-06).

### D-002: TypeScript end to end
- **Date:** 2026-10-19 · **Status:** Accepted
- **Context:** The machine has Node 24 and no Python. The pieces we need (Playwright, the Gmail API,
  Telegram, the Anthropic SDK, a web UI) all have first-class Node libraries.
- **Decision:** One language, TypeScript, for the UI, API, worker and scripts.
- **Alternatives:** Python + FastAPI backend with a JS frontend, which is common for scraping/AI work.
- **Tradeoffs:** One toolchain, shared types between UI and server, nothing extra to install. The
  cost is losing Python's scraping and PDF ecosystem, which we don't need: Claude reads PDFs directly
  ([D-008](#d-008-pdfs-go-to-claude-directly-docx-is-converted-to-text)) and Playwright is native to Node.
- **Consequences:** Every module can import the same Zod schemas ([D-006](#d-006-zod-schemas-are-the-single-source-of-truth)).

### D-003: One Next.js app for UI and API, a separate worker later
- **Date:** 2026-10-19 · **Status:** Accepted
- **Context:** We need a dashboard, a JSON API for it, and (from phase 2) long-running background jobs.
- **Decision:** Next.js 16 (App Router) serves pages and route handlers. Background work will run in a
  separate Node process ([D-033](#d-033-a-separate-worker-process-with-a-sqlite-backed-queue)) that
  imports the same `src/lib`.
- **Alternatives:** (a) An Express API plus a Vite SPA, two apps. (b) Running the scheduler inside the
  Next server.
- **Tradeoffs:** One dev server and file-based routing, and server components read the DB directly.
  Next 16 has new defaults that bit us twice (Cache Components, see D-024, and build-time page-data
  collection, see D-023). Running cron inside Next is fragile: dev reloads restart it and serverless
  assumptions fight it. Hence a separate worker.
- **Consequences:** `src/lib` must stay framework-free (no `next/*` imports) so the worker can use it.

### D-004: Node's built-in SQLite
- **Date:** 2026-10-19 · **Status:** Accepted
- **Context:** We need local, zero-ops storage. npm 11 on this machine blocks package install scripts
  by default (`allow-scripts`), which breaks native modules like `better-sqlite3` unless they're
  approved one by one.
- **Decision:** `node:sqlite` (`DatabaseSync`), built into Node 24, file at `data/sortie.db`, WAL mode.
- **Alternatives:** `better-sqlite3` (a native build), Postgres (a server to run), Drizzle/Prisma ORMs,
  or JSON files.
- **Tradeoffs:** No native build, no server, synchronous and fast for one user, real SQL and
  transactions. Downsides: the API is newer and less widely used, there's no ORM (we write SQL), and it
  requires Node ≥ 22.5 (we document 24+).
- **Consequences:** Schema changes go through hand-written, versioned migrations in `src/lib/db.ts`,
  tracked with `PRAGMA user_version`.

### D-005: Settings as validated JSON documents
- **Date:** 2026-10-19 · **Status:** Accepted
- **Context:** Profile, preferences, searches and answers are each one document, edited as a whole
  from one page, nested, and only ever read whole.
- **Decision:** Store each as JSON under a key in a `settings` table, validated with Zod on every read
  and write.
- **Alternatives:** Normalised tables (skills, experience rows and so on).
- **Tradeoffs:** The shape changes cheaply (a Zod change, plus a migration only when old data must be
  transformed), saves are atomic, and the code is simple. We give up SQL queries into the documents,
  which nothing needs. High-volume data (jobs, applications, emails) **will** use real tables, because
  we query and join it.
- **Consequences:** Reads must tolerate older JSON. Zod strips unknown keys, and missing ones need a
  migration (as in D-022).

### D-006: Zod schemas are the single source of truth
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** `src/lib/schema.ts` defines every shape once. TypeScript types come from
  `z.infer`, API routes validate with `safeParse`, the store validates on read and write, and the same
  schema is handed to Claude as its structured-output format.
- **Tradeoffs:** One definition can't drift between UI, DB and LLM. Structured outputs limit which Zod
  features we can use in LLM-facing schemas (we use `.nullable()`, not `.optional()`, and avoid fancy
  refinements there).

### D-007: Claude Opus 5.5, structured outputs, refusal fallback
- **Date:** 2026-10-19 · **Status:** Accepted
- **Context:** Resume parsing must be accurate and well-formed every time.
- **Decision:** Default model `claude-opus-5-5` (overridable with `SORTIE_MODEL`), called through
  `client.beta.messages.parse` with `betaZodOutputFormat(ParsedResume)`, effort `medium`, and the
  server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`), so a
  false-positive safety decline is retried on a fallback model in the same call.
- **Alternatives:** Free-text JSON with retries; a cheaper model; local parsing.
- **Tradeoffs:** Structured outputs guarantee valid JSON matching the schema. Opus costs more per call
  ($4/$20 per million input/output tokens); a resume parse is roughly $0.05–0.20, which is negligible
  for a one-off. **Bulk work (scoring thousands of jobs, sorting email) is a different cost profile:**
  see D-032 and Q-1 in [risks.md](risks.md). The model choice for those is left open for the owner.
- **Consequences:** We handle `refusal` and `max_tokens` stop reasons and map SDK error classes to
  plain messages (`describeError`).

### D-008: PDFs go to Claude directly, DOCX is converted to text
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** PDFs are sent as base64 `document` blocks; Claude reads layout, columns and tables
  natively. DOCX goes through `mammoth.extractRawText`. TXT/MD are passed as is.
- **Alternatives:** Extract PDF text locally (pdf.js), or OCR.
- **Tradeoffs:** Two-column and table resumes are read correctly with no extraction code. Every page
  costs input tokens. DOCX loses its formatting, which doesn't matter for extraction.

### D-009: Resume merge: the user's edits always win
- **Date:** 2026-10-19 · **Status:** Accepted
- **Context:** People re-upload updated resumes. Overwriting would destroy hand-tuned skill levels and
  bullets.
- **Decision:** `mergeResume` fills only empty contact/headline/summary fields and appends only entries
  that aren't there yet. Dedup keys: skills by normalised name (`"Node.js"` = `"node js"`), roles by
  company + title, projects by name, education by school + degree, certifications by name, links by URL.
- **Alternatives:** Replace everything; or show a diff and let the user choose per field.
- **Tradeoffs:** Safe and simple. It won't notice a *changed* fact (say, an updated end date on an
  existing role); the user edits that by hand. A diff view would be better UX and is a later nicety.
- **Consequences:** Unit-tested in `src/lib/merge.test.ts`.

### D-010: Store an upload only after it parses
- **Date:** 2026-10-19 · **Status:** Accepted
- **Context:** Bug found in testing: a failed parse still saved the file and registered it as the
  current resume, so the overview showed "Resume ✓" when nothing had been read.
- **Decision:** Parse first; write the file and the `documents` row only on success.
- **Tradeoffs:** A failed upload leaves nothing behind. The user has to re-upload after a failure,
  which is fine.

### D-011: Skill model: category, four levels, years
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** Each skill has `category` (language, framework, database, cloud, tool, concept, soft,
  other), `level` (learning, working, strong, expert), optional `years`, and `source` (resume or manual).
  Hand-typed skills get a category from a ~200-entry dictionary (`src/lib/skills.ts`), defaulting to
  `other`.
- **Alternatives:** A flat list of strings; a 1–10 rating.
- **Tradeoffs:** Levels let matching weigh "expert in Go" above "learning Go" and stop tailoring from
  overstating. Four named levels are easier to set honestly than a number.

### D-012: No LinkedIn/Glassdoor scraping, company career feeds instead
- **Date:** 2026-10-19 · **Status:** Accepted
- **Context:** The original idea named LinkedIn and Glassdoor as sources.
- **Decision:** Never automate LinkedIn or Glassdoor. Jobs come from companies' own careers sites
  through the public job-board feeds their careers pages use (Greenhouse, Lever, Ashby, SmartRecruiters,
  Workday). Optionally, a jobs aggregator API handles discovery.
- **Alternatives:** Scrape LinkedIn/Glassdoor with a logged-in session.
- **Tradeoffs:** Both sites forbid automated access in their terms and actively ban accounts; LinkedIn
  in particular, and losing the owner's real profile is unacceptable. Official career sites are where
  postings appear first, and applying there is what employers want. We lose jobs listed *only* on
  those boards, which is mostly agency noise.
- **Consequences:** Phase 2 needs a curated company → provider registry. Coverage depends on which
  provider each company uses (see [research.md](research.md)).

### D-013: Hybrid apply
- **Date:** 2026-10-19 · **Status:** Accepted (owner's choice; built in phase 4)
- **Decision:** Auto-submit only when the form is a known, simple provider form (e.g. Greenhouse,
  Lever, Ashby) **and** every required field is answered from stored data **and** the search is in
  auto mode. Portals that need per-company accounts or show CAPTCHAs (Workday, SuccessFactors, Taleo,
  which covers much of the Big 4 and large enterprises) are prefilled and handed to the user to submit.
- **Alternatives:** Full autopilot everywhere, or review everything.
- **Tradeoffs:** Full autopilot breaks on account walls and CAPTCHAs and risks confidently wrong
  answers on custom questions. Reviewing everything defeats the purpose. Hybrid gets most of the
  automation with no evasion and no blind submissions.

### D-014: Caps per company and per day
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** At most 3 applications per company (best matches win) and 25 per day across all
  searches, both configurable (1–10 and 1–200).
- **Tradeoffs:** Recruiters on systems like Workday see every application a candidate has made there.
  Thirty applications to one firm reads as spam and hurts the good one. We give up raw volume.

### D-015: Searches start in review mode
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** New searches default to `mode: review` and `minMatch: 70`. The owner switches a
  search to auto once its picks look right (JobCopilot recommends the same progression).
- **Tradeoffs:** Slower on day one; safer while the matcher and form filler earn trust.

### D-016: Tailoring is truthful and checked
- **Date:** 2026-10-19 · **Status:** Accepted (built in phase 3)
- **Decision:** A tailored resume may select, reorder, reword and emphasise only what's in the
  profile. A separate truth-check pass compares every claim (skills, employers, titles, dates, numbers)
  against the profile and rejects the document if anything doesn't trace back.
- **Tradeoffs:** Costs one extra LLM call per document and sometimes produces a less flashy resume.
  The Big 4 and most large employers run background checks, and invented claims fall apart in
  interviews.

### D-017: Local only by default
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** `npm run dev` / `npm start` bind to `127.0.0.1`. All personal data (DB, uploads) lives
  in `data/` (gitignored, movable with `SORTIE_DATA_DIR`). Secrets live in `.env.local` (gitignored).
  `.env.example` is committed with no values.
- **Tradeoffs:** Nothing is reachable from the LAN. There's no auth, because nothing outside the
  machine can reach the server; if it's ever exposed, auth has to come first (see R-10).

### D-018: Telegram for notifications
- **Date:** 2026-10-19 · **Status:** Accepted (owner's choice; built in phase 6)
- **Decision:** A Telegram bot (token from BotFather), messaging only the owner's chat ID.
- **Alternatives:** WhatsApp Business API (paid per message, template approval), Twilio SMS (paid,
  one-way), email.
- **Tradeoffs:** Free, instant, and two-way (approve or answer from the phone). The owner needs a
  Telegram account.

### D-019: Several searches instead of one set of role filters
- **Date:** 2026-10-19 · **Status:** Accepted
- **Context:** Taken from JobCopilot's multiple "copilots". Someone may want "Backend" at a strict bar
  in auto mode and "ML engineer" at a lower bar in review mode at the same time.
- **Decision:** Role-specific settings (titles, seniority, employment type, excluded keywords,
  selectivity, mode, on/off) live in a list of **searches**. Facts and global limits stay in
  preferences.
- **Alternatives:** One search, plus a separate resume per search as JobCopilot does.
- **Tradeoffs:** More flexible; a job can match several searches, so the per-company and daily caps
  apply across searches. We use one master profile plus per-job tailoring instead of a resume per
  search, which is simpler and better targeted.

### D-020: Screening answers and an answer bank that learns
- **Date:** 2026-10-19 · **Status:** Accepted (learning built in phase 4)
- **Context:** Taken from JobCopilot: answer standard screening questions once, and when the user edits
  an AI-written answer, remember it.
- **Decision:** An `answers` document holds salary answers, a free-text salary fallback ("Negotiable"),
  "how did you hear", self-ID, and `custom` Q&A entries with `source: manual | learned`. In phase 4,
  answers corrected in review are written back as `learned`.
- **Alternatives:** JobCopilot's tip of typing "1" into mandatory salary fields. **Rejected:** it's a
  misleading answer, and a fallback string or a real figure is honest.
- **Tradeoffs:** Requires matching new questions to stored ones (fuzzy/semantic match in phase 4).
  Questions the bank can't answer are escalated, never guessed (FR-23).

### D-021: Self-identification defaults to decline
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** Gender, ethnicity, veteran and disability answers default to "Decline to
  self-identify". They're never used for matching or anything else.
- **Tradeoffs:** Sensitive data stays out of the system unless the owner chooses otherwise.

### D-022: Schema v2: one keyed settings table
- **Date:** 2026-10-19 · **Status:** Accepted
- **Context:** v1 had a single-row table per document (`profile`, `preferences`). Adding searches and
  answers would have meant more one-row tables.
- **Decision:** Migration v2 creates `settings(key, data, updated_at)`, copies the v1 rows in, turns
  any old role filters (`targetRoles`, `seniority`, `employmentTypes`, `excludeKeywords`,
  `autoSubmitThreshold`) into the first search (`minMatch` = the old threshold, `mode: review`), and
  drops the v1 tables. Migrations can now be SQL strings or functions.
- **Tradeoffs:** Existing data carries over (tested in `src/lib/db.test.ts`). Old preference keys are
  stripped on read by Zod.

### D-023: Open the database lazily, wait on locks
- **Date:** 2026-10-19 · **Status:** Accepted
- **Context:** Bug found in testing: `next build` collects page data with ~10 worker processes, each of
  which imported `db.ts`, and that opened the DB at import time. On a fresh machine they raced on the
  first migration: `database is locked`.
- **Decision:** `getDb()` opens on first use, never at import. Opening sets a 10 s busy timeout.
  Migrations take the write lock with `BEGIN IMMEDIATE` and re-read `user_version` under the lock, so
  only one process migrates.
- **Tradeoffs:** Builds never touch the DB. The worker process and the web server can safely open the
  same file at once.

### D-024: DB-backed pages render inside Suspense after `connection()`
- **Date:** 2026-10-19 · **Status:** Accepted
- **Context:** Next 16 enables Cache Components by default. `export const dynamic = "force-dynamic"` is
  rejected, and synchronous DB reads during prerender would be frozen into static HTML.
- **Decision:** Each page renders a static shell (header) and an async child inside `<Suspense>` that
  calls `await connection()` before reading the DB.
- **Tradeoffs:** Pages are partially prerendered (the shell is instant, the data streams in), and data
  is always fresh. There's slightly more boilerplate per page.

### D-025: Dates use a fixed locale
- **Date:** 2026-10-19 · **Status:** Accepted
- **Context:** Bug found in testing: the server formatted `10/19/2026` (en-US) and the browser
  `19/10/2026` (en-IN), which caused a React hydration error.
- **Decision:** `src/lib/format.ts` formats with `Intl.DateTimeFormat("en-GB")` on both sides
  ("19 Oct 2026").
- **Tradeoffs:** The format is fixed rather than following the browser locale. For a one-person tool,
  that's fine.

### D-026: Explicit save, not autosave
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** Editors keep a local buffer (`useSavedState`) with a sticky save bar (dirty state,
  Discard, Save) and warn before leaving with unsaved changes. Resume upload is blocked while there are
  unsaved edits, so the merge never races local changes.
- **Alternatives:** Debounced autosave.
- **Tradeoffs:** One extra click. In return, a half-typed value never reaches the autopilot.

### D-027: Testing strategy
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** Vitest unit tests for anything that transforms or moves user data (resume merge, DB
  migrations; next up: filters, scoring, form-field mapping, email classification fixtures). API routes
  are smoke-tested with HTTP calls against a production build. UI is checked with headless-Chrome
  screenshots at 1366 px and 390 px. `tsc` and ESLint must be clean.
- **Tradeoffs:** No browser E2E suite yet (time). LLM calls aren't unit-tested; their parsing and
  validation are, and their behaviour is checked against real inputs.

### D-028: The repository stays local for now
- **Date:** 2026-10-19 · **Status:** Accepted (owner's instruction: "dont publish on github right now")
- **Decision:** Local git only: no `gh repo create`, no remote, no push, until the owner says so.
  Commits use the private identity. Docs are still written to a public-repo standard.

### D-029: How REA and JobCopilot are used
- **Date:** 2026-10-19 · **Status:** Accepted
- **Context:** The owner shared [REA](https://github.com/morluto/rea) (an MIT-licensed reverse-engineering
  MCP for agents) and asked to take useful features from [JobCopilot](https://jobcopilot.com/).
- **Decision:** JobCopilot is studied from its **public pages only**, for its feature set; we build our
  own versions. We don't inspect, extract or copy its app or extension code. REA is used as a
  **development-time inspection tool**: its passive Chrome DevTools Protocol page inspection
  (`inspect_web_page`, `observe_web_session`, `analyze_web_bundle`) on **public careers pages** shows
  which job-list endpoints those pages call and how their application forms are structured. That's
  interoperability work that feeds phase 2 fetchers and phase 4 form mapping. REA isn't a runtime
  dependency, and no REA code is vendored.
- **Tradeoffs:** Copying a commercial product's code would breach its rights and REA's own disclaimer
  (no copying proprietary code, no bypassing bot protection). Using REA to *understand* public pages
  is exactly its intended use. Installing REA (`npx rea-agents setup`) changes the agent's MCP
  configuration, so it's done only with the owner's go-ahead.

### D-030: JobCopilot features taken and skipped
- **Date:** 2026-10-19 · **Status:** Accepted
- **Taken:** multiple searches (D-019), per-search apply mode (D-015), screening answers once plus an
  answer bank that learns (D-020), selectivity (FR-7), 2-hour checks (D-031), a kanban tracker with the
  job snapshot and step history (FR-26), an autofill extension as the Workday handoff (FR-27, stretch),
  a daily recap (FR-32), mock interviews triggered by a real invite (FR-34/35, stretch).
- **Skipped:** buying hiring-manager emails (needs a paid contact-data provider, and cold outreach is a
  separate product); career-personality and advisor tools (low value); the "type 1 in salary fields"
  trick (dishonest).
- **Where Sortie goes further:** Gmail triage that moves the board automatically, Telegram, a truth
  check on tailoring, per-company caps, local and private, bring-your-own-key.

### D-031: Check feeds every 2 hours
- **Date:** 2026-10-19 · **Status:** Proposed (phase 2)
- **Decision:** Fetch company feeds every ~2 h (JobCopilot's cadence) instead of daily, with jitter and
  per-host politeness. Applying early matters, and the feeds are cheap public JSON.
- **Tradeoffs:** More requests. Mitigated by conditional requests where supported and by skipping
  unchanged boards.

### D-032: Deterministic prefilter before any LLM scoring
- **Date:** 2026-10-19 · **Status:** Proposed (phase 2)
- **Decision:** Every job first passes hard filters (location/mode/authorization, exclusions,
  seniority, employment type, salary floor) and a cheap deterministic score (skill overlap weighted by
  level, title match). Only the top candidates per search get an LLM score with reasons.
- **Tradeoffs:** 250 companies can mean thousands of open roles. Scoring them all with an LLM every
  2 h would cost real money and time. The prefilter can drop a good job with an odd title; we keep its
  recall high and log what it rejected.

### D-033: A separate worker process with a SQLite-backed queue
- **Date:** 2026-10-19 · **Status:** Proposed (phase 2–4)
- **Decision:** `npm run worker` starts a Node process (run with `tsx`) that owns the schedule and a
  `tasks` table (type, payload, status, attempts, run_after, last_error). Steps are idempotent; a
  unique constraint on (job, search) prevents double applications. The UI only reads state and
  enqueues tasks.
- **Alternatives:** Cron inside Next; Redis/BullMQ (another service); OS Task Scheduler running scripts.
- **Tradeoffs:** No extra infrastructure; survives restarts; easy to inspect. One process, so throughput
  is modest, which is fine at ≤ 25 applications a day.

### D-034: Tailwind and design tokens, no component library
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** Tailwind 4 with CSS-variable tokens (`--bg`, `--panel`, `--ink`, `--accent` and so
  on), light and dark via `prefers-color-scheme`, Geist and Geist Mono. Small in-house primitives in
  `src/components/ui.tsx`.
- **Tradeoffs:** No dependency weight and full control of the look. We write our own inputs and
  toggles, which is a small amount of code.
