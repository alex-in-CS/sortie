# Sortie

A personal job-application copilot. You give it your resume and every skill you have. It finds software
jobs at good companies that you're actually eligible for, tailors your resume to each one, applies, and
watches your Gmail so you only hear about the replies that need you.

It runs on your own machine, with your own Anthropic API key. Your resume and profile never leave your
computer except in the requests Sortie sends to Claude.

> **Status: phase 1 of 6, plus searches and screening answers.** Profile, resume reading, searches,
> answers and preferences work today. Job sourcing, tailoring, applying, Gmail and Telegram are next
> (see [Roadmap](#roadmap)). The full engineering record (requirements, architecture, data model,
> every decision and tradeoff, plan, risks) is in **[docs/](docs/README.md)**.

![Overview](docs/screenshots/overview.png)

| Profile | Preferences |
| --- | --- |
| ![Profile](docs/screenshots/profile.png) | ![Preferences](docs/screenshots/preferences.png) |

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
            ┌──────────────────────────── Next.js app (127.0.0.1) ──────────────────────────┐
 browser ──▶│  pages: Overview · Profile · Preferences                                       │
            │  API routes: /api/resume  /api/profile  /api/preferences                       │
            │        │                       │                                               │
            │        ▼                       ▼                                               │
            │  lib/llm.ts ──▶ Claude     lib/store.ts ──▶ node:sqlite  data/sortie.db         │
            │  (structured output,       (profile, preferences, documents)                   │
            │   zod-validated)           data/uploads/  original resumes                     │
            └────────────────────────────────────────────────────────────────────────────────┘
   later phases add a background worker (job fetchers, scheduler, Playwright applier,
   Gmail watcher) and a Telegram bot, sharing the same lib/ and database.
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
| `src/app/api/*` | Route handlers for resume upload, profile and preferences. |
| `src/components/*` | The editors (profile, skills, entry lists, preferences) and small UI primitives. |

## Setup

Requirements: **Node.js 24+** (for built-in `node:sqlite`) and an
[Anthropic API key](https://console.anthropic.com/).

```bash
git clone https://github.com/alex-in-CS/sortie.git
cd sortie
npm install
cp .env.example .env.local   # then put your key in ANTHROPIC_API_KEY
npm run dev                  # http://127.0.0.1:3000
```

Then upload your resume on **Profile**, fill in any skills it missed, and set **Preferences**.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | (required) | Used to read resumes, and later to score and tailor. |
| `SORTIE_MODEL` | `claude-opus-5-5` | The Claude model to use. |
| `SORTIE_DATA_DIR` | `./data` | Where the database and uploads are stored. |

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on 127.0.0.1:3000 |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## Tech stack

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript · Tailwind CSS 4 · Node 24
`node:sqlite` · Zod 4 · Anthropic TypeScript SDK (structured outputs) · mammoth (DOCX) · Vitest.

## Roadmap

| # | Phase | Status |
| --- | --- | --- |
| 1 | Profile, resume reading, skills, searches, screening answers, preferences | **Done** |
| 2 | Jobs: a registry of ~250 top companies mapped to their career-site feeds, checks every 2 hours, optional discovery, deduplication, and a match score against your skills | Next |
| 3 | Tailoring: a resume and cover letter per job, with a truth check that every claim traces back to the profile, exported to PDF | Planned |
| 4 | Applying: Playwright submits simple forms, Workday-style portals are prefilled and handed off, caps, answers learned from your edits, and a kanban tracker with step history | Planned |
| 5 | Inbox: read-only Gmail that matches replies to applications and moves them on the board | Planned |
| 6 | Telegram: alerts only when something needs you, a daily recap, and approving from your phone | Planned |
| 7 | Interview prep: a prep pack and mock interview when an invite arrives | Stretch |

The day-by-day schedule is in [docs/plan.md](docs/plan.md).

## License

[MIT](LICENSE)
