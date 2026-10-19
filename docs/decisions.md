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
| [D-031](#d-031-check-feeds-every-2-hours) | Check feeds every 2 hours | Accepted |
| [D-032](#d-032-deterministic-prefilter-before-any-llm-scoring) | Deterministic prefilter before LLM scoring | Accepted (LLM half built: D-050) |
| [D-033](#d-033-a-separate-worker-process-with-a-sqlite-backed-queue) | Separate worker process, SQLite-backed queue | Accepted |
| [D-034](#d-034-tailwind-and-design-tokens-no-component-library) | Tailwind + tokens, no component library | Accepted |
| [D-035](#d-035-sonnet-55-for-bulk-work-opus-55-for-quality-critical-work) | Sonnet 5.5 for bulk, Opus 5.5 for quality-critical work | Accepted |
| [D-036](#d-036-rea-installed-for-claude-code-only) | REA installed for Claude Code only | Accepted |
| [D-037](#d-037-the-end-to-end-test-stops-at-review) | The end-to-end test stops at review | Accepted |
| [D-038](#d-038-the-registry-holds-only-live-verified-boards) | The registry holds only live-verified boards | Accepted |
| [D-039](#d-039-one-adapter-per-ats-descriptions-fetched-only-for-plausible-jobs) | One adapter per ATS; descriptions only for plausible jobs | Accepted |
| [D-040](#d-040-deterministic-match-rules-and-score-weights) | Deterministic match rules and score weights | Accepted |
| [D-041](#d-041-matching-re-runs-on-demand-skipped-by-input-hash) | Matching re-runs on demand, skipped by input hash | Accepted |
| [D-042](#d-042-worker-runs-under-tsx-with-the-react-server-condition) | Worker runs under tsx with the react-server condition | Accepted |
| [D-043](#d-043-close-jobs-only-after-a-complete-fetch) | Close jobs only after a complete fetch | Accepted |
| [D-044](#d-044-big-company-coverage-workday-yes-custom-portals-no) | Big-company coverage: Workday yes, custom portals no | Accepted |
| [D-045](#d-045-locations-resolve-through-intl-region-names-state-lists-and-state-codes) | Locations via Intl region names, state lists and codes | Accepted |
| [D-046](#d-046-software-role-classifier-and-a-rules-version-in-the-match-hash) | Software-role classifier; rules version in the match hash | Accepted |
| [D-047](#d-047-rows-passed-to-client-components-are-copied-to-plain-objects) | Rows passed to client components are plain objects | Accepted |
| [D-048](#d-048-rate-limits-host-hold-wider-gap-then-a-12-hour-rest) | Rate limits: host hold, wider gap, then a 12-hour rest | Accepted |
| [D-049](#d-049-detail-budget-of-100-per-board-per-cycle) | Detail budget of 100 per board per cycle | Accepted |
| [D-050](#d-050-claude-reviews-the-best-candidates-selection-respects-the-caps) | Claude reviews the best candidates; selection respects the caps | Accepted |
| [D-051](#d-051-the-truth-check-runs-in-two-passes-rules-then-claude-and-only-removes) | Truth check: rules then Claude, and it only removes | Accepted |
| [D-052](#d-052-pdfs-come-from-html-through-the-installed-chrome-playwright-core) | PDFs from HTML through the installed Chrome | Accepted |
| [D-053](#d-053-tasks-left-running-by-a-dead-process-are-abandoned-after-3-hours) | Stale running tasks abandoned after 3 hours | Accepted |
| [D-054](#d-054-one-form-model-greenhouse-from-its-api-lever-from-the-page) | One form model: Greenhouse from its API, Lever from the page | Accepted |
| [D-055](#d-055-answers-come-from-rules-then-the-answer-bank-then-grounded-claude-consent-is-yours) | Answers: rules, then the bank, then grounded Claude; consent is yours | Accepted |
| [D-056](#d-056-fill-and-check-without-files-hold-for-you-auto-submit-only-through-a-strict-gate) | Fill and check without files, hold for you, auto-submit through a strict gate | Accepted |
| [D-057](#d-057-claude-or-gemini-behind-one-structured-call-paid-tier-only) | Claude or Gemini behind one structured call; paid tier only | Accepted |

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
- **Date:** 2026-10-19 · **Status:** Accepted (owner's choice; built in phase 4, see D-054 to D-056)
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
- **Date:** 2026-10-19 · **Status:** Accepted (learning built in phase 4, D-055)
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
- **Date:** 2026-10-19 · **Status:** Accepted (built in phase 2; `SORTIE_FETCH_HOURS`, ±10% jitter)
- **Decision:** Fetch company feeds every ~2 h (JobCopilot's cadence) instead of daily, with jitter and
  per-host politeness. Applying early matters, and the feeds are cheap public JSON.
- **Tradeoffs:** More requests. Mitigated by conditional requests where supported and by skipping
  unchanged boards.

### D-032: Deterministic prefilter before any LLM scoring
- **Date:** 2026-10-19 · **Status:** Accepted (deterministic half: D-040; LLM half: D-050)
- **Decision:** Every job first passes hard filters (location/mode/authorization, exclusions,
  seniority, employment type, salary floor) and a cheap deterministic score (skill overlap weighted by
  level, title match). Only the top candidates per search get an LLM score with reasons.
- **Tradeoffs:** 250 companies can mean thousands of open roles. Scoring them all with an LLM every
  2 h would cost real money and time. The prefilter can drop a good job with an odd title; we keep its
  recall high and log what it rejected.

### D-033: A separate worker process with a SQLite-backed queue
- **Date:** 2026-10-19 · **Status:** Accepted (built in phase 2, see D-042)
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

### D-035: Sonnet 5.5 for bulk work, Opus 5.5 for quality-critical work
- **Date:** 2026-10-19 · **Status:** Accepted (owner's answer to Q-1)
- **Decision:** High-volume calls (LLM job scoring after the prefilter, email classification) use
  `claude-sonnet-5-5` (`SORTIE_BULK_MODEL`). Resume parsing, tailoring and the truth check stay on
  `claude-opus-5-5` (`SORTIE_MODEL`).
- **Alternatives:** Haiku 5.5 for bulk (≈20x cheaper than Sonnet); Opus for everything.
- **Tradeoffs:** Sonnet costs half of Opus with strong judgment for ranking and classifying. Haiku
  would be cheaper still, and can be swapped in through the env var if the bills say so.
- **Consequences:** Sonnet 5.5 specifics: thinking can't be set to `disabled` (use low effort, or
  `between_tools`); forced `tool_choice` is rejected, so use structured outputs. The refusal fallback
  uses `fallbacks: "default"` on the Claude API.

### D-036: REA installed for Claude Code only
- **Date:** 2026-10-19 · **Status:** Accepted (owner's answer to Q-5)
- **Decision:** `npx rea-agents@6.7.0 setup --client claude_code --yes`. This registers REA's MCP server
  in `~/.claude.json` (backup at `~/.claude.json.rea.backup`) and installs its skill under
  `~/.claude/skills/reverse-engineer-anything`. The "all detected agents" plan would also have changed
  Claude Desktop, Codex, Cursor, Gemini CLI, Antigravity, Copilot CLI, VS Code and DeepSeek Harness;
  those were deliberately left alone. Native back-ends (Ghidra, IDA, Hopper) weren't installed; only
  website inspection is needed.
- **Consequences:** The MCP tools appear after Claude Code restarts. Until then REA's CLI
  (`npx rea-agents@6.7.0 <command>`) is used against a Chrome started with a remote-debugging port and
  a throwaway profile. REA stays a dev tool, not a dependency of Sortie (D-029). **To undo:** restore
  the backup and delete the skill folder.

### D-037: The end-to-end test stops at review
- **Date:** 2026-10-19 · **Status:** Accepted (owner's answer to Q-4)
- **Decision:** The Day 2 end-to-end check fills a real application completely and holds it at review.
  Nothing is submitted to a real employer as a test.
- **Consequences:** The submit step is verified against a local fixture form instead. The first real
  submission happens when the owner approves one they actually want.

### D-038: The registry holds only live-verified boards
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** `src/lib/registry/companies.json` is generated, never hand-edited. `npm run
  registry:verify` probes every candidate live:
  - Guessed slugs (`scripts/candidates.txt`) are tried on Greenhouse, then Ashby, then Lever. They're
    kept only if the board returns open jobs that include at least one software role.
  - Hand-found enterprise feeds (`scripts/enterprise.json`) are kept if they return any jobs.
  - Companies that can't be read are listed as *unsupported* (with their ATS) or *not found*. Both
    lists show on the Companies page.
- **Alternatives:** A hand-written list of ~250 board IDs; a paid company-to-ATS database.
- **Tradeoffs:** Coverage is honest: every listed company really is fetched. The cost is that a
  guessed slug can belong to a different company with the same name. That happened twice in the first
  run: "Navi" on Ashby is a US aviation startup, and "Neon" is a game-payments company, not the
  database. Short or generic names are now pinned to explicit slugs, and the first jobs of each new
  board are eyeballed (R-16).
- **Consequences:** 217 boards verified on 2026-10-19: Greenhouse 107, Ashby 43, Workday 34, Lever 18,
  SmartRecruiters 15. 56 big names are unsupported. 141 candidates weren't found on the three ATSs we
  can guess.

### D-039: One adapter per ATS; descriptions fetched only for plausible jobs
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** Each `src/lib/sources/<provider>.ts` turns a provider's public JSON into one `SourceJob`
  shape. Fields a provider doesn't state are `null`, never guessed.
  - Greenhouse, Lever and Ashby return full descriptions in one call.
  - Workday and SmartRecruiters lists don't include descriptions. So they're searched server-side
    (each search's titles, or "software" when skills decide) and capped at 200 per query. `detail()`
    is called only for jobs whose title looks relevant, at most 100 per board per cycle (D-049).
  - All requests go through `http.ts`: an honest User-Agent, a 400 ms gap per host, a 30 s timeout,
    and retries with backoff on 429/5xx (honouring `Retry-After`).
- **Alternatives:** Fetch every description (thousands of extra calls per cycle on big Workday
  tenants); a headless browser (slower, more fragile, closer to scraping).
- **Tradeoffs:**
  - Workday's JSON is undocumented (R-05), so contract tests run on recorded fixtures.
  - Workday's dates are relative ("Posted 30+ Days Ago"), so the first value seen is kept.
  - A job with an odd title at a Workday company may never get its description fetched. We accept
    that, to keep request volume down.

### D-040: Deterministic match rules and score weights
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** Hard filters run in this order, and each rejection gives a plain-English reason:
  1. Excluded company.
  2. Title: matches one of the search's titles, or looks like a software role when the search has
     none.
  3. Excluded keywords in the title or description.
  4. Seniority, inferred from the title (and the provider's level label).
  5. Employment type.
  6. Work mode.
  7. Country. Job countries come from provider codes plus `geo.ts` text resolution. An unknown
     country passes, with a note.
  8. City, unless the job is remote or you're willing to relocate.
  9. Sponsorship: rejected only when the posting says it won't sponsor; otherwise a note.
  10. Salary floor, compared only in the same currency.
  11. Years asked for: rejected when more than your years + 2.

  **Score** = 60% skill fit + 15% title fit + 15% years fit + 10% freshness.
  **Skill fit** = the sum of matched skills weighted by level (learning 0.4 … expert 1), divided by
  (matched skills + 0.5 × known skills the posting names that the profile lacks).
- **Alternatives:** Embedding similarity; LLM for everything.
- **Tradeoffs:**
  - It's transparent and testable, fast over thousands of jobs, and every rejection is explainable.
  - It's weak on synonyms and can't tell must-haves from nice-to-haves. That's why missing skills
    count half, and why the LLM re-scores the survivors in phase 3.
  - Short or ambiguous skill names ("Go", "R", "C", "Excel", "Spark") only count in their usual
    capitalisation. Extra guards stop "R&D", "Series C" and "go to market" from counting as skills.

### D-041: Matching re-runs on demand, skipped by input hash
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** `matchAll()` stores an input hash per (job, search) covering the job, the search, the
  profile's skills and roles, the preferences, today's date and the rules version (D-046). It runs after every fetch and whenever
  the Jobs page loads, and re-scores only rows whose hash changed.
- **Tradeoffs:** An edit to a search or a skill shows up immediately, with no "rescore" button or
  queued task. The first page load after a big change takes a moment. Because the date is in the hash,
  everything is re-scored once a day, so freshness stays right.

### D-042: Worker runs under tsx with the react-server condition
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** `npm run worker` runs `tsx --conditions=react-server src/worker/index.ts`;
  `npm run fetch` adds `--once`.
  - The condition makes `import "server-only"` resolve to its empty module outside Next.
  - The worker loads `.env.local` with `process.loadEnvFile` before importing `src/lib`.
  - Tasks: one queued or running task per type, claimed atomically (`UPDATE … RETURNING`), retried up
    to 3 times with 5^n-minute backoff. Stale `running` tasks are requeued on start.
  - The task row's `result` is the run log the Companies page shows.
- **Alternatives:** Compile the worker with a bundler; drop `server-only` from `src/lib`.
- **Tradeoffs:** One more dev dependency: tsx, which uses esbuild's prebuilt binary and needs no
  install script. In return, the Next app keeps its guard against server code leaking into client
  bundles.

### D-043: Close jobs only after a complete fetch
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** A job missing from a fetch is closed only if that fetch was complete. A capped Workday
  or SmartRecruiters query (200 results) proves nothing about absent jobs, so nothing is closed then.
  A closed job that reappears is reopened. When a later list omits them, upserts keep the fetched
  description, the known countries and the first posted date.
- **Tradeoffs:** A capped board can keep a few dead jobs open until it's fetched uncapped. Applying
  (phase 4) re-checks that the posting still exists before submitting.

### D-044: Big-company coverage: Workday yes, custom portals no
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** Enterprises on Workday and SmartRecruiters are fetched like any other board. There are
  34 on Workday, for example Accenture, PwC, Intel, Cisco, Salesforce, Adobe, Visa, Mastercard, Citi,
  Micron and Broadcom. 56 companies use their own portals or Avature, SuccessFactors, Eightfold, Oracle
  Cloud HCM, iCIMS or Phenom: Deloitte, EY, KPMG, SanDisk, Google, Microsoft, Amazon, Infosys, TCS,
  Goldman Sachs and others. They're listed as *not covered automatically*, with a careers link.
- **Alternatives:** Browser automation of each portal's search page; a paid jobs API that aggregates
  them (FR-13, discovery).
- **Tradeoffs:** Several names the owner asked for (Deloitte, EY, KPMG, SanDisk) aren't fetched. They
  have no public feed, and scraping their portals would mean fighting bot protection (D-013). The
  planned discovery API (FR-13) is the route to cover them later.

### D-045: Locations resolve through Intl region names, state lists and state codes
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** `geo.ts` turns a free-text location into ISO country codes:
  - every region name `Intl.DisplayNames` knows, plus a hand list of aliases (USA, UK, UAE, Korea…);
  - major cities and all US states, Canadian provinces and Indian states;
  - `", XX"` state codes ("Hawthorne, CA", "Toronto, ON");
  - region words (Europe, EMEA, APAC, LATAM…) and `*` for anywhere/worldwide.
  Names that are also places elsewhere (Georgia, Jersey, Jordan, Chad) aren't matched as countries,
  and "IN"/"DE" aren't read as state codes.
- **Why:** The first live fetch left thousands of US jobs ("City, ST") without a country, so country
  filters let them through with an "unknown country" note.
- **Tradeoffs:** It's a list, not a geocoder: a small town with no country or state named still
  resolves to nothing and passes with a note. A geocoding API would add a dependency and a network
  call per job.

### D-046: Software-role classifier and a rules version in the match hash
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** `isSoftwareRole(title)` = not a non-builder role (sales, support, recruiter…) **and**
  either a strong software signal (software/backend/frontend/full stack/SRE/data/ML/platform engineer,
  developer, member of technical staff…) or a generic engineering word with no other discipline
  (electrical, mechanical, manufacturing, controls…). Titles have `_` turned into spaces first
  ("EMT3_VM_Gen_AI_ML_Senior_Developer" is senior). Skills the posting names that are the company's own
  product ("ClickHouse" at ClickHouse) aren't counted as missing. `MATCH_RULES_VERSION` is part of
  every match hash, so changing the rules re-scores everything once.
- **Why:** On real data, "engineer" alone matched electrical, operations and support roles at SpaceX
  and others; an underscore title hid "Senior"; and stored hashes kept stale scores after rule fixes.
- **Tradeoffs:** Hand-tuned patterns need a test per real title that fooled them (`match.test.ts`
  keeps them). The LLM pass in phase 3 catches what the patterns miss.

### D-047: Rows passed to client components are copied to plain objects
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** `node:sqlite` returns rows with a `null` prototype. React refuses those as props to
  Client Components ("Only plain objects can be passed…"). Every query whose rows can reach the client
  goes through `plain()` in `jobs.ts`, and a test asserts the prototype.
- **Tradeoffs:** One shallow copy per row, which costs nothing at our sizes.

### D-048: Rate limits: host hold, wider gap, then a 12-hour rest
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** On HTTP 429, `http.ts` waits for `Retry-After` or 5 s, 15 s, 45 s. It also holds every
  other request to that host for the same time, and quadruples that host's gap (up to 8 s) for the
  rest of the process. If a board still fails with 429, the cycle records it and skips that board for
  12 hours (`coolingDown()` in `pipeline.ts`). The Companies page shows it as "Rate-limited, resting"
  and its stored jobs stay open.
- **Why:** Salesforce's Workday tenant (behind Cloudflare) returned 429 after two or three requests,
  even with a 6-second gap, and kept doing so for minutes after a burst. Hitting it again every two
  hours would only extend the block.
- **Alternatives:** Rotate User-Agents or IPs. That's evasion, ruled out by D-013.
- **Tradeoffs:** A strict board updates at most twice a day. Its jobs can be up to 12 hours stale.

### D-049: Detail budget of 100 per board per cycle
- **Date:** 2026-10-19 · **Status:** Accepted (replaces "40" in D-039)
- **Decision:** Workday and SmartRecruiters `detail()` calls are capped at 100 per board per cycle,
  newest plausible titles first. Descriptions are kept once fetched (D-043), so the backlog shrinks
  every cycle.
- **Why:** At 40, the first live fetch left 4,941 jobs without a description. 100 clears a typical
  board's relevant backlog in one or two cycles. At a 400 ms gap that's about 40 s per board, and
  boards run four at a time.
- **Tradeoffs:** The first cycle on a fresh database is slower (about 8 minutes for 217 boards).

### D-050: Claude reviews the best candidates; selection respects the caps
- **Date:** 2026-10-19 · **Status:** Accepted (completes D-032)
- **Decision:**
  - **Review.** After matching, every enabled search's open jobs that passed the rules, scored within
    10 points of its bar (`REVIEW_MARGIN`) and have a description get a Claude review: Sonnet 5.5 at
    low effort, with structured output `{score, verdict, reasons, gaps, dealbreaker}`. The best go
    first, at most `SORTIE_REVIEWS_PER_CYCLE` (default 40) per cycle.
  - Reviews live in their own `reviews` table, keyed by (job, search). Each carries a hash of the prompt
    version, the model, the profile text, the constraints, the search's titles and seniority, and the
    job's content hash. The date is **not** in the hash, so the daily rule re-score (D-041) never pays
    for a review twice.
  - **Select.** The final score is Claude's when there is one, otherwise the rule score. A job is picked
    when that score clears the search's bar, it has no dealbreaker, and the verdict isn't `poor`.
    Picking goes best first, each job once across searches. Two caps apply: `maxPerCompany` (counted
    over 30 days) and `dailyLimit` (since local midnight). With an API key, a job must be reviewed
    before it's picked. Without one, the rule score decides, so picking still works.
  - Jobs you pick by hand (Apply on the Jobs page) skip the bar and the caps, but count toward them.
- **Alternatives:** Review every rule-qualified job (cost); review only above the bar (Claude could
  never rescue a job the rules under-scored); put the review in `matches` (the daily re-score would
  overwrite or orphan it).
- **Tradeoffs:**
  - Cost is bounded by the per-cycle limit: about 4k input and 500 output tokens per review, roughly
    1–1.5 US cents on Sonnet 5.5. The candidate profile sits in a cached system block.
  - A big backlog drains over several cycles, best first.

### D-051: The truth check runs in two passes, rules then Claude, and only removes
- **Date:** 2026-10-19 · **Status:** Accepted (FR-19, NFR-1)
- **Decision:** Tailoring (Opus 5.5) returns only wording: headline, summary, skills (names), bullets
  per profile entry id, project picks, and a cover letter. Names, contact details, employers, titles,
  dates, education and certifications are rendered from the profile, so tailoring can't change them.
  Then the check runs in two passes:
  1. **Rules** (`truth.ts`, deterministic):
     - skills must be profile skills, re-spelled the profile's way;
     - entry ids must exist;
     - each bullet may only contain numbers and known technologies that appear in **its own entry**,
       so a skill you have can't be claimed for a job where you didn't use it;
     - the headline, summary and cover letter are checked against the whole profile plus your stated
       years. The cover letter may also name the employer and the role.
  2. **Claude** (Opus, a separate call): every remaining statement goes in with a key, and Claude
     flags whatever the profile doesn't support. It's told that rewording and summarising are fine.

  Anything flagged is **removed**. If that would empty an entry, or it's the headline or summary, the
  profile's own text is **reverted** in. Nothing is ever rewritten by the checker. Every change is
  recorded in the application's truth report, which the Applications page shows.
- **Alternatives:** Ask the tailoring prompt to be honest and trust it; let the checker rewrite flagged
  text (that's a second unchecked generation).
- **Tradeoffs:**
  - The rules are strict and sometimes drop a fair paraphrase that adds a number (for example "two
    services"). That's accepted: a weaker bullet beats an untrue one.
  - Two Opus calls per application, roughly 10–20 US cents.

### D-052: PDFs come from HTML through the installed Chrome (playwright-core)
- **Date:** 2026-10-19 · **Status:** Accepted (FR-20)
- **Decision:** `resume-html.ts` renders a one-column, text-only, standard-heading HTML resume and cover
  letter. `pdf.ts` prints them to A4 with `playwright-core` driving the machine's Chrome
  (`channel: "chrome"`, or `SORTIE_CHROME_PATH`). One browser per worker task is closed when the task
  ends. Files go to `data/resumes/<application id>/<Name>-Resume.pdf` and `…-Cover-Letter.pdf`.
- **Alternatives:** `@react-pdf/renderer` or pdfkit (a layout engine of its own; text extraction by
  ATSs is less predictable); full `playwright` (downloads browsers and needs an install script, see
  D-004); a DOCX template.
- **Tradeoffs:** It needs Chrome installed, and the error says so. Phase 4 uses the same
  `playwright-core` for form filling, so it's one dependency for both.

### D-053: Tasks left "running" by a dead process are abandoned after 3 hours
- **Date:** 2026-10-19 · **Status:** Accepted
- **Decision:** `enqueue()` marks a task of the same type that has been `running` for more than 3 hours
  as `failed` ("Abandoned: the process running it stopped") before queueing a new one. `lastTask()` no
  longer shows such a task as live. Worker start still requeues anything running (D-042), and
  applications left mid-tailoring go back to `queued`.
- **Why:** A killed `npm run fetch` left its task `running` forever. That blocked new fetches and kept
  the Fetch button on "Fetching…".
- **Tradeoffs:** A real cycle longer than 3 hours would be wrongly abandoned. A full cycle takes about
  8 minutes plus tailoring.

### D-054: One form model: Greenhouse from its API, Lever from the page
- **Date:** 2026-10-19 · **Status:** Accepted (FR-21)
- **Decision:** Every provider's application form becomes the same list of `FormField`s
  (`apply/types.ts`): `{key, label, kind, required, options, optionKeys?}`. The kind is text, textarea,
  file, select, radio, checkbox, or search (a dropdown whose options load as you type).
  - **Greenhouse.** The public Job Board API (`/v1/boards/{board}/jobs/{id}?questions=true`) lists
    every question, its type and its options. Sortie adds what the page has but the API doesn't
    describe: the phone's country picker, the city search when location questions are required, and
    school, degree and discipline when education is asked. The form opens at
    `job-boards.greenhouse.io/embed/job_app?for={board}&token={id}`, which also works for boards that
    host their careers page elsewhere.
  - **Lever.** The form is plain HTML, so `readLeverDom()` runs in the page and reads each question
    block: its label (a ✱ means required) and the inputs that share a name.
  - **Other providers** (Ashby, SmartRecruiters, Workday and the rest) aren't filled. Their
    applications go to "Needs you" with the link and the tailored PDFs, and you mark them submitted
    (D-013).
- **Alternatives:** Read every form from the page (Greenhouse's React form hides its option lists until
  each one is opened); write a reader per company.
- **Tradeoffs:**
  - Greenhouse fields the API doesn't describe are added by hand.
  - If Greenhouse changes its page ids (`#first_name`, `#question_<id>`, `school--0`), filling fails
    loudly: the read-back catches it and the application goes to Needs you.
  - The test fixtures are saved copies of real Lever forms and a Greenhouse API response.

### D-055: Answers come from rules, then the answer bank, then grounded Claude; consent is yours
- **Date:** 2026-10-19 · **Status:** Accepted (FR-23, FR-25, NFR-1)
- **Decision:** `planForm()` gives each field a value, a state (ok, skip, missing or decide) and a source
  in plain words. The first of these that applies decides:
  1. **Consent.** Questions about recording, privacy notices, attestations, opt-ins and marketing
     messages are "decide": only you answer them. The answer bank may hold your earlier answer to the
     same question.
  2. **Rules**, in a fixed order, from the profile, preferences and screening answers. They cover name,
     email, phone, links, current employer and title, years of experience, notice period, salary,
     school and degree, how you heard, and self-ID (D-021).
     - Work authorization and sponsorship are worked out for the countries the question names, or else
       the job's countries.
     - Options are chosen by meaning: yes/no, ranges like "15 - 30 days" or "20 - 25 LPA", country
       names, and "decline".
     - When the matching rule has no data, no looser rule may guess.
  3. **The answer bank**, when a stored question uses nearly the same words (a token overlap of at
     least 0.8, after removing stop words). A paraphrase with a different meaning doesn't match.
  4. **Claude** (Sonnet 5.5, `apply/ground.ts`), only for required questions that are still missing.
     It gets your stored data and must quote the line it relied on. Code accepts an answer only if:
     - the quote really is in that data;
     - a choice is one of the form's options;
     - every number in a text answer appears in your data.

     Claude's answers are marked on the page, and they keep the application from auto-submitting.
  5. **You.** Anything left is "missing" and comes to you. Your answer is saved to the bank as
     `learned`, so the same question on any later form gets the same answer.
  - **Total years answer only the general question.** "Years of experience as a data analyst" or
    "years with Python" is a different claim, so it's left to you. A live Stripe form showed why: the
    general rule would have claimed years as a data analyst.
- **Alternatives:**
  - Let Claude answer every question. It's fast, but the answers can't be checked, and it invents
    plausible facts.
  - Fuzzy or semantic matching in the bank. It's too likely to reuse an answer for a different
    question.
- **Tradeoffs:** More questions come to you at first. Each one is asked only once.

### D-056: Fill and check without files, hold for you, auto-submit only through a strict gate
- **Date:** 2026-10-19 · **Status:** Accepted (FR-21, FR-22, D-013)
- **Decision:** After tailoring, each `ready` application goes through the form step
  (`apply/index.ts`). At most `SORTIE_APPLY_PER_CYCLE` run per cycle, and no API key is needed.
  1. **Read and plan.** Sortie opens the form in headless Chrome, reads the fields and plans the
     answers (D-055). If a required question is unanswered, the application goes to `needs_you` with
     the questions.
  2. **Fill and check.** It fills every field and **reads each value back** from the page.
     - Dropdowns take only the exact option, or one that starts with the wanted words: "India" gives
       "India +91", never "British Indian Ocean Territory".
     - Search dropdowns try fallbacks: "Bengaluru, India", then "Bengaluru"; "B.Tech", then
       "Bachelor's Degree", then "Other".
     - Files are **not attached** in this pass, because boards upload a file the moment it's attached.
     - It saves a full-page screenshot.
  3. **Decide.** A required field that didn't fill sends the application to `needs_you`. Otherwise it's
     `held`, with the reason, unless every auto-submit condition holds:
     - the search is in auto mode, and the job wasn't picked by hand;
     - `SORTIE_AUTO_SUBMIT=on`;
     - no field is missing or awaiting your decision, and no answer came from Claude;
     - every field read back correctly;
     - no CAPTCHA puzzle is showing.

     Only then are the files attached and submit pressed.
     - "Submitted" is recorded only when the confirmation page shows.
     - A CAPTCHA puts it back to `held`.
     - If no confirmation shows, it goes to `needs_you` and is never retried on its own, since it may
       have gone through.
  - **Open in Chrome** (`handoff`): the worker fills the form, files included, in a visible Chrome
    window. It waits up to `SORTIE_HANDOFF_MINUTES` (default 20) for the confirmation page.
    - If the confirmation shows, it's `submitted`.
    - If the window closes or the time runs out, it's `held` again.
    - You can also mark any application "I submitted it".
  - **Restarts:** `applying` goes back to `ready`. `submitting` (a window that was open) goes back to
    `held`.
- **Alternatives:**
  - Submit whenever filling worked. No person would see Claude's answers.
  - Always hand off. That's no autopilot at all.
  - Solve or route around CAPTCHAs. Ruled out by D-013.
- **Tradeoffs:**
  - Greenhouse and Lever show CAPTCHAs (reCAPTCHA, hCaptcha), so in practice most applications end at
    "Open in Chrome". That's deliberate: one click and a look, against a wrong application sent in
    your name.
  - The worker handles one handoff at a time and waits on it. A fetch cycle can be delayed by up to
    20 minutes while a window is open.
  - The screenshot shows the form without files, since those are attached when it's sent.

### D-057: Claude or Gemini behind one structured call; paid tier only
- **Date:** 2026-10-19 · **Status:** Accepted (owner's request; amends D-007 and D-035)
- **Context:** The owner has a Google AI Pro subscription and asked to use Gemini (or free OpenRouter
  models) instead of Claude.
- **Decision:** `llm.ts` has two providers behind the same `structured()` call.
  - **Choosing.** `SORTIE_LLM=claude|gemini` picks one. Otherwise Sortie uses whichever key is set,
    Claude first.
  - **Gemini** goes through the official `@google/genai` SDK (`models.generateContent`).
    - The zod schema is sent as `responseJsonSchema`, trimmed to the JSON Schema subset Gemini reads.
      The answer is still validated against the full zod schema.
    - PDFs go in as `inlineData`.
    - Effort maps to `thinkingLevel`, and the call is retried without it if a model refuses one.
    - Every unusable answer becomes the same plain error as with Claude.
  - **Models.** For Gemini, `gemini-4-argon` handles quality work (resume reading, tailoring, the
    truth check) and `gemini-3.8-flash` handles bulk work (reviews, form answers). For Claude, Opus
    5.5 and Sonnet 5.5 as before. Both can be overridden with `SORTIE_MODEL` and
    `SORTIE_BULK_MODEL`.
  - **Messages.** Every message, label and banner names the active provider ("Gemini: 82, good",
    "Add GEMINI_API_KEY…"). A refused key stops a batch on either provider (`isAuthError`).
  - **Gemini needs a key on a project with billing enabled.** The Gemini API terms say the unpaid
    tier uses what you send to improve Google products, may have human reviewers read it, and should
    not be sent personal information. Sortie sends your resume, contact details and salary with
    nearly every call. A Google AI Pro subscription covers the AI Studio website, not API keys.
    Google's docs say subscribers with Cloud Billing enabled are eligible for monthly Developer
    Program cloud credits.
- **Alternatives:**
  - OpenRouter free models. Rejected: about 50 requests a day without credit, free endpoints may log
    or train on prompts, most can't read a PDF, and structured output varies.
  - A generic multi-provider library. Rejected: one more dependency for two providers, and Claude
    would lose its structured-output and refusal-fallback features.
- **Tradeoffs:**
  - Prompts were written and tuned for Claude, and Gemini's output hasn't been checked live yet
    (no key). The safety checks don't depend on the model: the truth check's rules, the quote check
    on form answers, and the read-back.
  - Claude's explicit prompt caching becomes Gemini's implicit caching. The repeated profile text is
    kept at the end of the system instruction so its prefix can be reused.
  - Reviews are cached by a hash that includes the model, so switching provider re-reviews jobs once.

