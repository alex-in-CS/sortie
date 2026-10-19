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
| `ANTHROPIC_API_KEY` | yes | | Resume parsing, scoring, tailoring, email sorting. |
| `SORTIE_MODEL` | no | `claude-opus-5-5` | Model for LLM calls. |
| `SORTIE_DATA_DIR` | no | `./data` | Database and uploads. Absolute or relative to the project. |
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
| `npm test` | Vitest (merge rules, migrations). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint (flat config). |
| *(planned)* `npm run worker` | Background worker (D-033). |

Before every commit: `npm run typecheck && npm run lint && npm test && npm run build`.

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
| `database is locked` during build | (Fixed by D-023.) Something opened the DB at import time | Keep DB access behind `getDb()`; never at module scope. |
| Build error: `Route segment config "dynamic" is not compatible with nextConfig.cacheComponents` | Next 16 Cache Components | Use `<Suspense>` + `await connection()` (D-024). |
| React "hydration mismatch" on dates | Server/browser locale differ | Use `formatDate`/`formatDateTime` from `src/lib/format.ts` (D-025). |
| `npm warn allow-scripts … not yet covered` | npm 11 blocks install scripts by default | Harmless for current deps. Approve only what you've reviewed: `npm approve-scripts <pkg>`. This is why we use `node:sqlite` and not `better-sqlite3` (D-004). |
| PowerShell reports exit code 1/255 though the command worked | Windows PowerShell 5.1 treats native stderr output as an error | Run through `cmd /c "… 2>&1"` or check the real exit code. |
| Git warns "LF will be replaced by CRLF" | Windows autocrlf | `.gitattributes` pins LF for source files. |
| Turbopack warning: "Dynamic filesystem access causes tracing of the whole project" | A computed path in a server module | Keep paths scoped (`path.join(process.cwd(), "data")`) or mark them `/*turbopackIgnore: true*/` (see `db.ts`). |
