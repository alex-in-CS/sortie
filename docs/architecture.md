# Architecture

## 1. Today (phase 1 + searches/answers)

```
 Browser (127.0.0.1:3000)
   │  pages: / · /profile · /searches · /answers · /preferences      (React client editors)
   │  fetch JSON
   ▼
 Next.js 16 server  ─────────────────────────────────────────────────────────────────────
   app/*/page.tsx         server components: static shell + <Suspense> data child (D-024)
   app/api/resume         POST multipart → parseResume (Claude) → mergeResume → save
   app/api/profile        GET / PUT (zod-validated, blank bullet lines stripped)
   app/api/searches       GET / PUT  ┐
   app/api/answers        GET / PUT  ├─ settingRoute(): one helper, same contract
   app/api/preferences    GET / PUT  ┘
        │
        ▼
 src/lib  (framework-free; the future worker imports it too, D-003)
   schema.ts   zod: Profile, ParsedResume, Preferences, Search(es), Answers   (D-006)
   store.ts    setting(key, schema, fallback) → get/save; documents table
   db.ts       getDb(): lazy open, WAL, busy timeout, versioned migrations    (D-023)
   llm.ts      Anthropic client, parseResume (structured output + fallback)  (D-007)
   merge.ts    mergeResume: fill gaps, append new, never overwrite             (D-009)
   skills.ts   category dictionary + labels
   format.ts   fixed-locale dates                                             (D-025)
        │
        ▼
 data/  (gitignored)
   sortie.db          settings(profile|preferences|searches|answers), documents
   uploads/<uuid>.*   original resumes (written only after a successful parse, D-010)

 External: api.anthropic.com (resume parsing)
```

## 2. Target at the end of the 3 days

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
                         │   tailor.app    resume + cover letter → truth check│
                         │   apply.app     Playwright fill → submit | hold    │
                         │   inbox.poll    Gmail → classify → move stage      │
                         │   notify        Telegram (alerts, daily recap)     │
                         └──┬──────────┬──────────┬──────────┬───────────────┘
                            ▼          ▼          ▼          ▼
               career-site feeds   Anthropic   Gmail API   Telegram Bot API
               (Greenhouse, Lever,  (Claude)   (read-only)
               Ashby, SmartRecruiters,
               Workday)   + optional jobs API (discovery)
```

### The pipeline, step by step

1. **fetch.board.** For each company in the registry, call its provider adapter (`fetchJobs(board)`)
   and upsert normalised jobs. Jobs no longer in the feed are marked closed.
2. **match.job.** For each new or changed open job × enabled search: apply the hard filters, then the
   deterministic score. Candidates above a recall threshold get an LLM score (0–100) with reasons.
   Results go in `matches`.
3. **select.** Pick the best qualifying matches while respecting the per-company and daily caps, and
   create `applications` (status `saved`).
4. **tailor.app.** Generate the resume and cover letter, run the truth check, render the PDF. Status
   becomes `ready`.
5. **apply.app.** Open the application page in Playwright and map fields to profile/answers/documents.
   Then: if the provider is known-simple, every required field is grounded, and the search mode is
   auto, submit (`applied`). Otherwise hold (`review`) or hand off (`handoff`, for account or CAPTCHA
   portals). Unknown required questions become a Telegram question.
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
| `src/lib/*` | See §1. Must not import `next/*`. |
| `src/lib/*.test.ts` | Vitest: merge rules, migrations. |
| `src/test/empty.ts` | Stub for `server-only` under Vitest. |
| `docs/` | This documentation. |

## 4. Conventions

- **Server-only modules** (`db`, `store`, `llm`, `setting-route`) start with `import "server-only"` so
  they can't leak into client bundles.
- **Validation at the edges:** every API write goes through `safeParse`, and every DB read through
  `parse`.
- **Errors for humans:** API errors return `{ error: "<plain sentence>" }` with a fitting status.
  Details go to the server log.
- **No secrets in code or logs.** Keys come from the environment only.
- **Comments explain why, not what.**
