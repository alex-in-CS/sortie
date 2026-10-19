# Sortie

A personal job-application copilot. You give it your resume and every skill you have. It finds software
jobs at good companies that you're actually eligible for, tailors your resume to each one, applies, and
watches your Gmail so you only hear about the replies that need you.

It runs on your own machine, with your own Anthropic API key. Your resume and profile never leave your
computer except in the requests Sortie sends to Claude.

> **Status: phases 1–3 of 6 done.** Profile, resume reading, searches, answers and preferences; live job
> sourcing from 217 verified company boards with filtering and match scores; and Claude reviews,
> selection under your limits, and a tailored, fact-checked resume and cover letter PDF per job.
> Applying, Gmail and Telegram are next (see [Roadmap](#roadmap)). The full engineering record (requirements, architecture, data model,
> every decision and tradeoff, plan, risks) is in **[docs/](docs/README.md)**.

![Overview](docs/screenshots/overview.png)

| Profile | Preferences |
| --- | --- |
| ![Profile](docs/screenshots/profile.png) | ![Preferences](docs/screenshots/preferences.png) |
| **Jobs** | **Applications** |
| ![Jobs](docs/screenshots/jobs.png) | ![Applications](docs/screenshots/applications.png) |
| **Companies** | |
| ![Companies](docs/screenshots/companies.png) | |

_Screenshots use a made-up demo profile._

## What works now

- **Resume reading.** Drop in a PDF, DOCX, TXT or Markdown resume. Claude reads it into a structured
  profile: contact details, skills, roles, projects, education and certifications. It copies facts and
  doesn't invent them.
- **Skills editor.** Every skill gets a category, a level (learning, working, strong, expert) and
  optional years. You can paste a comma-separated list to add many at once, and common skills are
  categorised automatically. Jobs will be matched against this list.
- **Safe re-uploads.** Uploading a newer resume only fills gaps and adds new entries. Anything you've
  already edited by hand is kept.
- **Searches.** Run several hunts at once (say "Backend" and "ML engineer"), each with its own titles
  (or none, to let your skills decide), seniority, employment type, excluded keywords, selectivity and
  mode: *review first* or *auto-apply*.
- **Screening answers.** Expected and current salary, a free-text fallback, "how did you hear",
  US self-identification (defaults to decline), and an answer bank for anything else forms ask, with
  common questions one click away. Answers you correct during review will be learned (phase 4).
- **Preferences.** Work mode, countries and cities, work authorization and sponsorship, notice period,
  a salary floor, companies to exclude, and the autopilot limits: a cap per company and a daily cap.
- **Jobs from 217 companies.** Sortie reads the public job boards of companies on Greenhouse, Lever,
  Ashby, SmartRecruiters and Workday: Stripe, Databricks, OpenAI, Cloudflare, Palantir, Accenture,
  PwC, Intel, Cisco, Salesforce, Adobe, Visa, Mastercard, Citi, Freshworks, Razorpay, Meesho, CRED and
  more. Every board on the list answered a live check before it was added. Big names on portals with
  no public feed (Deloitte, EY, KPMG, SanDisk, Google, Microsoft, Infosys and others) are listed with a
  careers link instead of being scraped.
- **Filtering with reasons.** Each job is checked against each search: software role or your titles,
  seniority, job type, work mode, your countries and cities, visa sponsorship, salary floor, years
  asked for, excluded companies and keywords. Rejected jobs say why in plain words.
- **Match scores.** Jobs that pass get a 0–100 score from your skills (weighted by level), the title,
  years asked for and freshness, with the skills you have and the ones the posting wants that you
  don't list.
- **Claude's second opinion.** Jobs near or above a search's bar get a review from Claude (Sonnet 5.5):
  a score, a verdict, the reasons, the must-haves you're missing, and any dealbreaker such as a
  citizenship requirement. Reviews are cached, so a job is only reviewed again when it or your profile
  changes.
- **Picking within your limits.** Each cycle picks the best jobs that clear your bar, best first, at
  most N per company in 30 days and M a day. You can also press **Apply** on any job yourself.
- **Tailored resume and cover letter, fact-checked.** For each pick, Claude (Opus 5.5) rewords and
  reorders your profile for that job and writes a short cover letter. A truth check then removes
  anything your profile doesn't back up: first with rules (no new numbers, skills or technologies, and
  a bullet may only use facts from its own role), then with a second Claude pass. Employers, titles
  and dates always come straight from your profile. The result is a clean one-column PDF that
  applicant tracking systems can read, and the **Applications** page shows exactly what the check
  changed.
- **Background worker.** `npm run worker` runs a cycle every ~2 hours: fetch, match, review, pick,
  tailor. **Companies** shows every board with its last result and an on/off switch. A board that
  rate-limits Sortie is rested for 12 hours instead of being hammered.
- **Setup checklist** on the overview page.

## Design rules

These shape every phase, not just the current one:

1. **Never invent anything.** Tailored resumes and form answers can reorder, reword and emphasise
   what's in your profile, but they can't add skills or experience you don't have.
2. **Respect the sites.** No scraping of LinkedIn or Glassdoor, since both ban accounts for it. Jobs
   come from companies' own career sites (Greenhouse, Lever, Ashby, SmartRecruiters and Workday
   feeds) and a jobs API for discovering new companies.
3. **Quality over volume.** There's a cap per company (3 by default), because recruiters see every
   application you send them. There's also a daily cap.
4. **Hybrid autopilot.** Simple forms are submitted automatically above your match threshold. Portals
   like Workday, which need a separate account and throw CAPTCHAs, are prefilled and wait for your
   one click.
5. **Local and private.** Everything lives in `data/` (SQLite plus your uploads), which is gitignored.
   The server only listens on `127.0.0.1`.

## Architecture

```
 browser ──▶ Next.js app (127.0.0.1)
              pages: Overview · Jobs · Companies · Profile · Searches · Answers · Preferences
              API:   /api/resume /api/profile /api/searches /api/answers /api/preferences
                     /api/companies/[id] /api/fetch
                       │
                       ▼
              src/lib  (shared, framework-free)
                llm.ts ──▶ Claude            store.ts / jobs.ts ──▶ node:sqlite  data/sortie.db
                sources/* ──▶ Greenhouse · Lever · Ashby · SmartRecruiters · Workday (public JSON)
                match.ts + geo.ts   filters and scores          pipeline.ts  fetch → store → match
                       ▲
              worker (npm run worker): every ~2 h, and on "Fetch now"
```

| Path | What it does |
| --- | --- |
| `src/lib/schema.ts` | Zod schemas for the profile, the parsed resume, searches, answers and preferences. They're the single source of truth for types and validation. |
| `src/lib/llm.ts` | Anthropic client and resume parsing (structured outputs, server-side refusal fallback). |
| `src/lib/merge.ts` | Folds a parsed resume into the profile without overwriting your edits. |
| `src/lib/db.ts` | Opens `data/sortie.db` lazily with Node's built-in SQLite and runs versioned migrations. |
| `src/lib/store.ts` | Keyed settings documents (profile, preferences, searches, answers) and uploaded documents. |
| `src/lib/setting-route.ts` | One GET/PUT handler pattern shared by the settings APIs. |
| `src/lib/skills.ts` | Category guesses for hand-typed skills, plus the labels. |
| `src/lib/sources/*` | One adapter per ATS, turning public job feeds into one job shape; polite HTTP (User-Agent, per-host gap, retries). |
| `src/lib/registry/companies.json` | The verified company list, generated by `npm run registry:verify`. |
| `src/lib/jobs.ts` | Companies, jobs, matches and the worker's task queue. |
| `src/lib/match.ts`, `src/lib/geo.ts` | Hard filters and the deterministic score; location text to countries. |
| `src/lib/pipeline.ts` | One cycle: registry, fetch boards, fill descriptions, match, then prepare. |
| `src/lib/autopilot.ts` | Prepare: Claude reviews, selection under the caps, tailoring, PDFs. |
| `src/lib/review.ts`, `src/lib/select.ts` | Claude's job review (cached by input hash); the pure selection rules. |
| `src/lib/tailor.ts`, `src/lib/truth.ts` | Tailoring and the two-pass truth check. |
| `src/lib/resume-html.ts`, `src/lib/pdf.ts` | The ATS-friendly resume and cover letter, printed to PDF by your installed Chrome. |
| `src/lib/applications.ts` | Reviews, applications and their step history. |
| `src/worker/index.ts` | The background worker. |
| `src/app/api/*` | Route handlers for resume upload, settings, company switches, Fetch now, Apply, application actions and PDF downloads. |
| `src/components/*` | The editors (profile, skills, entry lists, preferences) and small UI primitives. |

## Setup

Requirements: **Node.js 24+** (for built-in `node:sqlite`), **Google Chrome** (for PDFs), and an
[Anthropic API key](https://console.anthropic.com/).

```bash
git clone https://github.com/alex-in-CS/sortie.git
cd sortie
npm install
cp .env.example .env.local   # then put your key in ANTHROPIC_API_KEY
npm run dev                  # http://127.0.0.1:3000
```

Then upload your resume on **Profile**, fill in any skills it missed, and set **Preferences**.
In a second terminal start the worker, which fetches jobs now and every ~2 hours:

```bash
npm run worker               # or: npm run fetch  (one cycle, then exit)
```

Open **Jobs** to see matches, and **Applications** for the jobs Sortie picked and their tailored PDFs.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | (required) | Reading resumes, reviewing jobs, tailoring and the truth check. |
| `SORTIE_MODEL` | `claude-opus-5-5` | Resume reading, tailoring and the truth check. |
| `SORTIE_BULK_MODEL` | `claude-sonnet-5-5` | Job reviews. |
| `SORTIE_REVIEWS_PER_CYCLE` / `SORTIE_TAILOR_PER_CYCLE` | `40` / `10` | Spending limits per cycle. |
| `SORTIE_CHROME_PATH` | Chrome | Another Chromium browser for PDFs, if Chrome isn't installed. |
| `SORTIE_DATA_DIR` | `./data` | Where the database and uploads are stored. |
| `SORTIE_FETCH_HOURS` | `2` | Hours between fetch cycles. |

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on 127.0.0.1:3000 |
| `npm run build` / `npm start` | Production build and server |
| `npm run worker` | Background worker (a cycle every ~2 h, plus queued tasks) |
| `npm run fetch` | One full cycle now: fetch, match, review, pick, tailor |
| `npm run registry:verify` | Re-check every company board live and rewrite the registry |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## Tech stack

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript · Tailwind CSS 4 · Node 24
`node:sqlite` · Zod 4 · Anthropic TypeScript SDK (structured outputs) · mammoth (DOCX) · playwright-core with the installed Chrome (PDFs; form filling next) · tsx (worker) · Vitest.

## Roadmap

| # | Phase | Status |
| --- | --- | --- |
| 1 | Profile, resume reading, skills, searches, screening answers, preferences | **Done** |
| 2 | Jobs: 217 verified company boards, checks every 2 hours, deduplication, filters with reasons, and a match score against your skills | **Done** (discovery API pending a key) |
| 3 | Tailoring: Claude reviews the best matches; picks within your caps; a resume and cover letter per job, with a two-pass truth check, exported to PDF | **Done** |
| 4 | Applying: Playwright submits simple forms, Workday-style portals are prefilled and handed off, answers learned from your edits, and a kanban tracker with step history | Next |
| 5 | Inbox: read-only Gmail that matches replies to applications and moves them on the board | Planned |
| 6 | Telegram: alerts only when something needs you, a daily recap, and approving from your phone | Planned |
| 7 | Interview prep: a prep pack and mock interview when an invite arrives | Stretch |

The build plan is in [docs/plan.md](docs/plan.md).

## License

[MIT](LICENSE)
