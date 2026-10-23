# Architecture

## 1. Today (phases 1–4)

```
 Browser (127.0.0.1:3000)
   │  pages: / · /jobs · /applications · /companies · /profile · /searches · /answers · /preferences
   ▼
 Next.js 16 server  ─────────────────────────────────────────────────────────────────────
   app/*/page.tsx         server components: static shell + <Suspense> data child (D-024)
   app/jobs               runs matchAll() (cheap, hash-skipped) then lists matches, reviews, Apply (D-041)
   app/applications       picked jobs by status: review, PDFs, truth report, form plan, screenshot,
                          open questions, Open in Chrome / I submitted it / fill again / skip
   app/companies          syncs the registry, lists boards, on/off switches, Fetch now
   app/api/resume         POST multipart → parseResume (Claude or Gemini) → mergeResume → save
   app/api/profile        GET / PUT (zod-validated, blank bullet lines stripped)
   app/api/{searches,answers,preferences}  GET / PUT via settingRoute()
   app/api/companies/[id] PATCH {enabled}
   app/api/fetch          POST → enqueue("fetch") · GET → last fetch task
   app/api/applications   POST {jobId, searchId} → manual pick + enqueue("prepare")
   app/api/applications/[id]              PATCH {action: skip | restore | retailor | refill | open | submitted}
   app/api/applications/[id]/answers      POST your answers → answer bank (learned) → fill again
   app/api/applications/[id]/files/[kind] GET resume | cover-letter PDF | form screenshot
        │
        ▼
 src/lib  (framework-free; the worker imports it too, D-003)
   schema.ts     zod: Profile, ParsedResume, Preferences, Search(es), Answers   (D-006)
   store.ts      setting(key, schema, fallback) → get/save; documents table
   db.ts         getDb(): lazy open, WAL, busy timeout, migrations v1–v5        (D-023)
   llm.ts        Claude or Gemini behind one structured() call; parseResume   (D-007, D-035, D-057)
   merge.ts      mergeResume: fill gaps, append new, never overwrite             (D-009)
   sources/      one adapter per ATS → SourceJob; polite fetch (http.ts)         (D-039)
   registry.ts   the verified company list (registry/companies.json)             (D-038)
   jobs.ts       companies, jobs (upsert/close), matches, tasks queue
   geo.ts        location text → ISO countries; city aliases
   match.ts      hard filters + deterministic score with reasons                (D-032, D-040)
   pipeline.ts   runCycle(): registry → fetch boards → details → matchAll() → prepare()
   autopilot.ts  prepare(): reviewAll → selectJobs → prepareDocuments × N → applyOne × N (D-050, D-056, D-058)
   review.ts     Claude (Sonnet) review per (job, search), hash-cached           (D-050)
   select.ts     pure: bar, dealbreakers, per-company and daily caps            (D-050)
   tailor.ts     Claude (Opus) tailoring + Claude truth check                   (D-051)
   truth.ts      pure: rule truth check, claims, apply rejections               (D-051)
   resume-html.ts  pure: ATS-friendly resume + cover letter HTML                (D-052)
   pdf.ts        HTML → PDF via playwright-core + installed Chrome; launchChrome (D-052)
   apply/
     types.ts    FormField, PlannedField, FillResult                            (D-054)
     forms.ts    Greenhouse questions from its API; Lever questions from the page (D-054)
     plan.ts     pure: consent → rules → answer bank → missing, per field        (D-055)
     ground.ts   Claude (Sonnet) answers missing questions, quote-checked        (D-055)
     fill.ts     fill + read back, dropdown matching, CAPTCHA check, submit      (D-056)
     gate.ts     pure: the auto-submit conditions                                (D-056)
     answers.ts  your answers → the answer bank (learned)                        (D-055)
     index.ts    applyOne (read → plan → ground → fill → hold | submit), handoff (D-056)
   applications.ts  reviews, applications, events, caps usage
   profile-text.ts  the profile and constraints as prompt text
        │
        ▼
 data/  (gitignored)
   sortie.db   settings, documents, companies, jobs, matches, tasks, reviews, applications, events
   uploads/    original resumes
   resumes/    <application id>/<Name>-Resume.pdf, <Name>-Cover-Letter.pdf
   applications/  <application id>/form.png (the filled form)

 Worker (npm run worker | npm run fetch, D-033, D-042)
   src/worker/index.ts  schedule a cycle every ~2 h ± 10%, claim tasks (fetch, prepare, match,
                        handoff), run, record result, close Chrome after each task. handoff opens
                        filled forms in a visible Chrome, one at a time, and waits for you to submit

 External: api.anthropic.com (parsing, reviews, tailoring, truth check, form answers); local Chrome
           (PDF, forms); job-boards.greenhouse.io and jobs.lever.co (application forms);
           boards-api.greenhouse.io, api.lever.co,
           api.ashbyhq.com, api.smartrecruiters.com, *.myworkdayjobs.com (job feeds)
```

## 2. Target

```
                         ┌──────────────── Next.js (UI + API) ────────────────┐
  Browser ──────────────▶│ Overview · Profile · Searches · Answers · Prefs    │
                         │ Jobs · Applications (kanban) · Inbox                │
                         │ actions: approve / skip / retry  → enqueue task     │
                         └───────────────┬────────────────────────────────────┘
                                         │ same src/lib, same SQLite file
                         ┌───────────────▼────────────────────────────────────┐
                         │ Worker (npm run worker, D-033)                     │
                         │  scheduler ─▶ tasks table (idempotent steps)       │
                         │   fetch.board   every ~2h per company (D-031)      │
                         │   match.job     filters + det. score → LLM score   │
                         │   tailor.app    your resume, or tailored → truth ck│
                         │   apply.app     Playwright fill → submit | hold    │
                         │   inbox.poll    Gmail → classify → move stage      │
                         │   notify        Telegram (alerts, daily recap)     │
                         └──┬──────────┬──────────┬──────────┬───────────────┘
                            ▼          ▼          ▼          ▼
               career-site feeds   Anthropic   Gmail API   Telegram Bot API
               (Greenhouse, Lever,  (Claude)   (read-only)
               Ashby, SmartRecruiters, or Google (Gemini)
               Workday)   + optional jobs API (discovery)
```

### The pipeline, step by step

1. **fetch.board.** For each company in the registry, call its provider adapter (`fetchJobs(board)`)
   and upsert normalised jobs. Jobs no longer in the feed are marked closed.
2. **match.job.** For each new or changed open job × enabled search: apply the hard filters, then the
   deterministic score. Candidates above a recall threshold get an LLM score (0–100) with reasons.
   Results go in `matches`.
3. **select.** Pick the best qualifying matches while respecting the per-company and daily caps, and
   create `applications` (status `queued`).
4. **tailor.app.** Copy your uploaded resume in as is, unless the job's review left `resumeAdvice`:
   then tailor the resume from the profile, run the truth check and render the PDF (D-058). Status
   becomes `ready`. Cover letters are written in step 5, only for forms that require one.
5. **apply.app** (built, D-054 to D-056). Read the form, plan every answer from stored data, fill it
   and read it back. Submit only through the auto-submit gate; otherwise hold it for you to open in
   Chrome and submit, or ask you the questions nothing stored answers. Phase 5 will send those
   questions to Telegram too.
6. **inbox.poll.** Fetch new Gmail messages, classify them, match them to an application (by
   company/domain/role), and move its stage. Alert on interviews and needs-input.
7. **notify.** Send alerts as events happen, and a daily recap.

Every step writes to `application_events`, so the history of any application can be replayed (NFR-6).

## 3. Source map

| Path | Responsibility |
| --- | --- |
| `src/app/layout.tsx` | Root layout: fonts, sidebar nav, main column. |
| `src/app/page.tsx` | Overview: setup checklist (API key, resume, skills, contact, searches, answers, preferences) and roadmap. |
| `src/app/profile/page.tsx` | Loads the profile and the latest resume metadata → `ProfileEditor`. |
| `src/app/searches/page.tsx` | Loads searches → `SearchesEditor`. |
| `src/app/answers/page.tsx` | Loads answers → `AnswersEditor`. |
| `src/app/preferences/page.tsx` | Loads preferences → `PreferencesForm`. |
| `src/app/api/resume/route.ts` | Upload: size/type checks → parse → store file → merge → save. |
| `src/app/api/profile/route.ts` | Profile GET/PUT; strips blank bullet lines on save. |
| `src/app/api/{searches,answers,preferences}/route.ts` | One-liners over `settingRoute`. |
| `src/components/ui.tsx` | Primitives: PageHeader, Section, Field, inputs, Button, TagInput, ChoiceGroup, Toggle, SaveBar, Loading, Empty. |
| `src/components/use-saved-state.ts` | Edit buffer: dirty tracking, save (PUT), discard, replace, unload warning. |
| `src/components/entry-list.tsx` | Generic collapsible list editor (add, reorder, delete) used for roles, projects, searches and Q&A. |
| `src/components/profile-editor.tsx` | Profile page body. |
| `src/components/resume-upload.tsx` | Drag-and-drop upload with progress and a merge summary. |
| `src/components/skills-editor.tsx` | Skills grouped by category with level bars and an inline detail editor. |
| `src/components/searches-editor.tsx` | Searches: titles, seniority, type, exclusions, selectivity slider, mode cards. |
| `src/components/answers-editor.tsx` | Salary, standard questions, self-ID, answer bank with suggestions. |
| `src/components/preferences-form.tsx` | Location/eligibility, pay floor, exclusions, caps, discovery. |
| `src/components/money-input.tsx` | Amount + currency + period input. |
| `src/components/nav.tsx` | Sidebar / top nav, with live and upcoming sections. |
| `src/app/jobs/page.tsx` | Jobs: per-search tabs; Qualifying / Below your bar / Filtered out; score, matched and missing skills, notes, rejection reason. |
| `src/app/applications/page.tsx` | Applications grouped by status (needs you, ready to submit, being prepared, submitted, skipped): Claude's review, PDF links, the truth report, the form plan with each value's source, the screenshot, open questions, actions. |
| `src/app/api/applications/**` | Manual pick (POST), actions (PATCH), answers to a form's questions (POST `answers`), PDF and screenshot download (GET, confined to `data/`). |
| `src/components/apply-button.tsx` | Apply on a job row; shows the application's status once it exists. |
| `src/components/application-actions.tsx` | Per status: Open in Chrome, Fill again, I submitted it, Redo documents, Try again, Skip, Restore. |
| `src/components/application-questions.tsx` | The form's open questions as inputs; saves them to the answer bank and fills again. |
| `src/lib/apply/*` | The form step: readers, planner, grounded answers, filler, auto-submit gate, orchestration (D-054 to D-056). `fixtures/` holds saved real forms. |
| `src/app/companies/page.tsx` | Companies: registry table with switches, last fetch result, unsupported and not-found lists. |
| `src/app/api/companies/[id]/route.ts` | Switch a company on or off. |
| `src/app/api/fetch/route.ts` | Queue a fetch for the worker; read the last fetch task. |
| `src/components/company-list.tsx` | Filterable company table with optimistic on/off switches. |
| `src/components/fetch-button.tsx` | Queues a fetch, polls until done, refreshes; hints when no worker is running. |
| `src/lib/sources/*` | `greenhouse`, `lever`, `ashby`, `smartrecruiters`, `workday` adapters; `http.ts` (UA, per-host gap, retries); `text.ts` (HTML → text, dates, enums); `fixtures/` recorded responses. |
| `src/lib/registry/companies.json` | Generated by `npm run registry:verify`. Do not edit by hand; edit `scripts/candidates.txt` / `scripts/enterprise.json` and re-run. |
| `src/worker/index.ts` | The worker process. |
| `scripts/verify-registry.ts` | Probes candidates and enterprise feeds live, writes the registry. |
| `scripts/try-apply.ts` | Dry run of the filler on a live Greenhouse or Lever form: plan, fill, read back, screenshot. Never submits or attaches files. |
| `scripts/candidates.txt`, `scripts/enterprise.json` | Registry inputs: guessed slugs for product companies; hand-found feeds (and unsupported ATS notes) for enterprises. |
| `src/lib/*` | See §1. Must not import `next/*`. |
| `src/lib/*.test.ts`, `src/lib/sources/sources.test.ts` | Vitest: merge rules, migrations, adapters on fixtures, geo, filters and scoring, job store, queue, matchAll, truth rules, selection caps, resume HTML, and the whole prepare path with Claude and Chrome faked (`autopilot.test.ts`). |
| `src/test/empty.ts` | Stub for `server-only` under Vitest. |
| `docs/` | This documentation. |

## 4. Conventions

- **Server-only modules** (`db`, `store`, `llm`, `setting-route`, `jobs`, `pipeline`, `applications`,
  `review`, `tailor`, `autopilot`, `pdf`) start with
  `import "server-only"` so they can't leak into client bundles. The worker runs Node with
  `--conditions=react-server`, which resolves that import to an empty module (D-042).
- **Pure modules** (`match`, `geo`, `sources/*`, `skills`, `schema`) have no server-only import, so
  scripts and tests can use them directly.
- **Validation at the edges:** every API write goes through `safeParse`, and every DB read through
  `parse`.
- **Errors for humans:** API errors return `{ error: "<plain sentence>" }` with a fitting status.
  Details go to the server log.
- **No secrets in code or logs.** Keys come from the environment only.
- **Comments explain why, not what.**
