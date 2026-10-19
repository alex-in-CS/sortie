# Operations

## Requirements

- Windows 11 (developed on it; macOS/Linux should work but are untested)
- **Node.js 24+** (`node:sqlite`; checked: v24.19.0), npm 11
- Google Chrome (used by Playwright and PDF rendering from phase 2, via `channel: "chrome"`, so no
  separate browser download)
- An Anthropic API key

## Setup

```bash
npm install
cp .env.example .env.local     # fill ANTHROPIC_API_KEY
npm run dev                    # http://127.0.0.1:3000
```

## Configuration (`.env.local`, never committed)

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | one of these two | | Claude: resume parsing, reviews, tailoring, form answers, email sorting. |
| `GEMINI_API_KEY` | one of these two | | Gemini instead of Claude (D-057). Create it at aistudio.google.com/apikey on a project **with billing enabled**: the free tier may use your data for training. |
| `SORTIE_LLM` | no | whichever key is set, Claude first | `claude` or `gemini`. |
| `SORTIE_MODEL` | no | `claude-opus-5-5` / `gemini-4-argon` | Resume reading, tailoring and the truth check (D-035, D-057). |
| `SORTIE_DATA_DIR` | no | `./data` | Database and uploads. Absolute or relative to the project. |
| `SORTIE_FETCH_HOURS` | no | `2` | Hours between fetch cycles in the worker (±10% jitter). |
| `SORTIE_BULK_MODEL` | no | `claude-sonnet-5-5` / `gemini-3.8-flash` | Job reviews and answers to form questions; later email sorting (D-035, D-055, D-057). |
| `SORTIE_REVIEWS_PER_CYCLE` | no | `40` | Most Claude job reviews per cycle (D-050). |
| `SORTIE_TAILOR_PER_CYCLE` | no | `10` | Most applications tailored per cycle. |
| `SORTIE_APPLY_PER_CYCLE` | no | `10` | Most forms read, filled and checked per cycle (D-056). |
| `SORTIE_AUTO_SUBMIT` | no | off | `on` lets searches in auto mode send forms that pass every check (D-056). Off, you submit everything. |
| `SORTIE_HANDOFF_MINUTES` | no | `20` | How long **Open in Chrome** waits for you to submit before the form goes back to held. |
| `SORTIE_CHROME_PATH` | no | Chrome | A Chromium-based browser for PDFs and forms, if Google Chrome isn't installed (D-052). |
| *(Day 3)* `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for Gmail | | From the Desktop OAuth client. |
| *(Day 3)* `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | for alerts | | Chat ID is captured on the first `/start`. |
| *(optional)* `JOBS_API_KEY` | for discovery | | JSearch/SerpAPI. |

Restart the dev server after changing `.env.local`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on 127.0.0.1:3000 (Turbopack, hot reload). |
| `npm run build` | Production build. Doesn't touch the database (D-023). |
| `npm start` | Production server on 127.0.0.1:3000. |
| `npm test` | Vitest (merge rules, migrations, adapters, matching, job store, queue). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint (flat config). |
| `npm run worker` | Background worker: fetches every ~2 h and runs queued tasks ("Fetch now"). Leave it running in a second terminal. |
| `npm run fetch` | One full cycle now (fetch, match, review, select, tailor, fill forms), printed line by line, then exit. Doesn't need the worker. |
| `npm run try-apply -- greenhouse <board> <jobId>` or `-- lever <applyUrl>` | Dry run of the form filler on a live form with your stored data: prints the plan and what read back, saves `try-apply-<provider>.png`. Never submits and never attaches files. Add `--headed` to watch. |
| `npm run registry:verify` | Re-probe every candidate and enterprise feed live and rewrite `src/lib/registry/companies.json` (takes a few minutes). |

Before every commit: `npm run typecheck && npm run lint && npm test && npm run build`.

## Running the job pipeline

1. Fill in your profile, a search and preferences (countries especially), then start the app with
   `npm run dev`.
2. In a second terminal, run `npm run worker` and leave it running. It fetches every board on start
   and then every ~2 h. Or run `npm run fetch` once to fetch and exit.
3. Open **Jobs**. Matching reruns on every page load for anything that changed (D-041), so edits to
   skills, searches or preferences show up straight away.
4. With an API key and a complete profile, each cycle then reviews the best candidates with Claude,
   picks jobs within your limits, and tailors a resume and cover letter for each (D-050 to D-052).
   **Applications** shows them with their PDFs and what the truth check changed. Press **Apply** on
   any job to pick it by hand; the worker tailors it within ~30 s.
6. Then the form step reads each application's form and fills it from your stored data (D-054 to
   D-056). On **Applications**:
   - **Needs you** lists the questions nothing stored answers. Answer them once; they go into your
     answer bank and the form is filled again.
   - **Ready to submit** has filled, checked forms. Press **Open in Chrome to submit**: within ~30 s
     the worker opens a Chrome window with everything filled in, files included. Look it over, solve a
     CAPTCHA if one shows, and press Submit there. Sortie sees the confirmation page and marks it
     submitted.
   - Ashby, SmartRecruiters and Workday forms aren't filled: open the link, apply with the PDFs, then
     press **I submitted it**.
   - Sortie submits on its own only for a search in auto mode with `SORTIE_AUTO_SUBMIT=on`, and only
     when nothing about the form needs a person.
5. **Companies** lists every board with its last result. Switch off companies you don't want, or use
   **Fetch now**, which queues a run for the worker.

### Changing the company list

- Product companies: add a line to `scripts/candidates.txt` (`Name` or `Name | slug1, slug2`).
- Enterprises on Workday or SmartRecruiters: add an entry to `scripts/enterprise.json`
  (`{"company", "provider", "board", "careersUrl"}`; Workday boards are `tenant.wdN/Site`).
  To find a board, open the company's careers page and look for `myworkdayjobs.com` or
  `smartrecruiters.com` in the network requests or the page source.
- Then `npm run registry:verify` and check the first jobs of any new board belong to the right
  company (R-16). Commit the regenerated `companies.json`.

## Data

- Everything personal is in `data/` (`sortie.db`, `sortie.db-wal`, `sortie.db-shm`, `uploads/`).
- **Back up:** stop the server, copy the folder.
- **Reset:** stop the server, delete `data/`. The next start recreates an empty database.
- **Inspect:** `node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('data/sortie.db');console.log(d.prepare('select key,updated_at from settings').all())"`
- Schema changes: add an entry to `MIGRATIONS` in `src/lib/db.ts` (SQL string or function), never edit
  a shipped one, and add a test in `src/lib/db.test.ts`.

## Testing

| Layer | How |
| --- | --- |
| Pure logic | Vitest, `src/**/*.test.ts`. `server-only` is stubbed by `vitest.config.mts`. |
| Forms | `apply/apply.test.ts` reads and fills saved copies of real Lever forms in Chrome (skipped if Chrome can't start) and plans a real Greenhouse API response; `apply/flow.test.ts` covers grounding, the gate and the status flow. Live: `npm run try-apply` (never submits). |
| Database | `db.test.ts` opens a temp `SORTIE_DATA_DIR`, resets modules, closes the cached connection after each test. |
| API | Start a prod build on a spare port with a scratch `SORTIE_DATA_DIR` and curl the routes (see the dev log for the exact checks run). |
| UI | Headless Chrome screenshots at 1366 px and 390 px (phone widths through an iframe, since desktop Chrome won't go narrower than ~500 px). |
| LLM | Run against real inputs; assert on the validated structure, not the wording. |

## Gmail setup (Day 3)

1. <https://console.cloud.google.com/> → new project "sortie".
2. APIs & Services → Library → enable **Gmail API**.
3. OAuth consent screen → External → add your own address as a **test user**. Scope: `gmail.readonly`.
4. Credentials → Create OAuth client ID → **Desktop app** → copy the ID and secret into `.env.local`.
5. In Sortie: Inbox → Connect Gmail (opens the Google consent page; the token is stored in `data/`).

Note R-06: in "Testing" mode Google expires refresh tokens after 7 days, so you'll need to reconnect
weekly unless the app is moved to production (see [risks.md](risks.md)).

## Telegram setup (Day 3)

1. In Telegram, message **@BotFather** → `/newbot` → copy the token into `TELEGRAM_BOT_TOKEN`.
2. Send `/start` to your new bot; Sortie records the chat ID and only ever messages that chat.

## Troubleshooting and gotchas

| Symptom | Cause | Fix |
| --- | --- | --- |
| Overview says the API key is missing | `.env.local` absent or the server wasn't restarted | Add the key; restart. |
| "The Anthropic API key was rejected." | Wrong or revoked key | Replace it. |
| "The Gemini API key was rejected (or billing isn't set up for it)." | Wrong key, or a project without billing | Check the key in AI Studio and that its Cloud project has billing enabled. |
| "Rate limited by the Gemini API (or out of quota)" | Free-tier or project quota reached | Enable billing, or lower `SORTIE_REVIEWS_PER_CYCLE` and `SORTIE_TAILOR_PER_CYCLE`. |
| `database is locked` during build | (Fixed by D-023.) Something opened the DB at import time | Keep DB access behind `getDb()`; never at module scope. |
| Build error: `Route segment config "dynamic" is not compatible with nextConfig.cacheComponents` | Next 16 Cache Components | Use `<Suspense>` + `await connection()` (D-024). |
| React "hydration mismatch" on dates | Server/browser locale differ | Use `formatDate`/`formatDateTime` from `src/lib/format.ts` (D-025). |
| `npm warn allow-scripts … not yet covered` | npm 11 blocks install scripts by default | Harmless for current deps. Approve only what you've reviewed: `npm approve-scripts <pkg>`. This is why we use `node:sqlite` and not `better-sqlite3` (D-004). |
| PowerShell reports exit code 1/255 though the command worked | Windows PowerShell 5.1 treats native stderr output as an error | Run through `cmd /c "… 2>&1"` or check the real exit code. |
| Git warns "LF will be replaced by CRLF" | Windows autocrlf | `.gitattributes` pins LF for source files. |
| A company shows "Failed: HTTP 404" | The board moved or was renamed | Re-run `npm run registry:verify`; fix its entry in the candidates or enterprise file. |
| A company shows "Rate-limited, resting 12 h" | The board answered HTTP 429 even after backoff (D-048) | Nothing to do: it's retried after 12 hours. Its stored jobs stay open. |
| "Couldn't start Chrome to make the PDF" | Google Chrome isn't installed where Playwright looks | Install Chrome, or set `SORTIE_CHROME_PATH` to `msedge.exe` / `chrome.exe` (D-052). |
| An application sits in **Needs you** | Tailoring failed three times, the form has questions nothing stored answers, the board isn't fillable, or a field didn't fill (the card says which) | Fix the cause, then **Try again** (tailoring) or **Fill again** (form); answer the questions; or **Open in Chrome** and finish it there. |
| **Open in Chrome** does nothing | The worker isn't running; it opens the window | Start `npm run worker`. The card says "Opening in Chrome" until it does. |
| "Clicked submit but saw no confirmation" | Auto mode pressed submit and no confirmation page appeared | It may have gone through. Check your email and the company's site before applying again; Sortie never retries it (D-056). |
| A dropdown field "didn't fill" | No option matched the stored value exactly or by its first words (D-056) | Open in Chrome and pick it there; or store an answer in the answer bank worded like the option. |
| Applications page says tailoring is paused | No API key, or the profile lacks a name, email, a role/project or skills | Add what it names; the next cycle continues. |
| "Fetching…" never ends after a killed `npm run fetch` | The task row was left `running` | Fixed by D-053: after 3 h it's abandoned automatically; starting the worker requeues it at once. |
| Page error: "Only plain objects can be passed to Client Components" | A `node:sqlite` row (null prototype) reached a client prop | Return it through `plain()` in `jobs.ts` (D-047). |
| "Waiting for the worker" never clears | No worker is running | Start `npm run worker`, or run `npm run fetch`. |
| A Workday company has jobs but few matches | Only titles matching the queries get a description fetched, at most 100 per board per cycle (D-039, D-049) | Wait a few cycles, or add the role title to a search. |
| Turbopack warning: "Dynamic filesystem access causes tracing of the whole project" | A computed path in a server module | Keep paths scoped (`path.join(process.cwd(), "data")`) or mark them `/*turbopackIgnore: true*/` (see `db.ts`). |
