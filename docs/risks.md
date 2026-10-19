# Risks and open questions

Likelihood/Impact: L · M · H.

## Risk register

| ID | Risk | L | I | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- |
| R-01 | **Terms of service / account bans** from automating job sites | M | H | No LinkedIn/Glassdoor automation (D-012). Only public career-site feeds, polite rates with jitter, no CAPTCHA solving or bot-protection bypass, handoff on account walls (D-013). | Dev |
| R-02 | **A wrong or invented answer gets submitted** | M | H | Truth check on documents (D-016); field-level grounding (FR-23); review mode by default (D-015); unknown required questions escalate instead of being guessed. | Dev |
| R-03 | **Spam signal to employers** from too many applications | M | H | Per-company and daily caps (D-014); selectivity per search. | Owner (settings) |
| R-04 | **Form variety**: custom fields and multi-step flows break the filler | H | M | Start with Greenhouse and Lever (consistent forms); per-provider adapters; screenshot and hold on anything unrecognised; step history for debugging. | Dev |
| R-05 | **Feed endpoints change or are unverified** (especially Workday's internal JSON) | M | M | Adapters isolated per provider, with contract tests on recorded fixtures; verify live shapes with REA page inspection (D-029); a failing board logs `last_error` and doesn't stop the run. | Dev |
| R-06 | **Gmail OAuth in testing mode** expires refresh tokens after 7 days | H | L | Documented weekly reconnect; the Inbox page shows token status and a reconnect button; Telegram alert when the token dies. Moving the app to production without verification is an option for personal use (unverified-app warning). **Unverified:** exact behaviour for restricted scopes in production-unverified mode. | Owner |
| R-07 | **Gmail data sensitivity** | M | M | `gmail.readonly` only; query restricted to likely recruiting mail; store classification + snippet, not full bodies; token in `data/` (gitignored). | Dev |
| R-08 | **LLM cost** from scoring thousands of jobs | M | M | Deterministic prefilter, LLM only for top candidates (D-032); cache scores by job hash; consider the Batch API (50% off) for scoring; daily spend shown on the overview. Depends on Q-1. | Dev + Owner |
| R-09 | **Hallucinated resume parse** | L | H | Prompt forbids inference; the owner reviews the profile after upload; manual edits win (D-009). | Owner |
| R-10 | **Local server exposed** to the network | L | H | Bound to 127.0.0.1 (D-017). There's no auth layer; adding one is a prerequisite for any remote access. | Dev |
| R-11 | **Schedule:** six phases in three days | H | H | Cut order in [plan.md](plan.md); daily acceptance checks; safety rules never cut. | Dev |
| R-12 | **Blocked on external setup** (API key, Google OAuth client, Telegram token) | M | H | Asked for up front with deadlines ([plan.md](plan.md)); phases that don't need them are built first. | Owner |
| R-13 | **Applying from a home IP** gets rate limited by some ATS | L | M | Low volume by design; backoff; handoff when blocked. | Dev |
| R-14 | **Next.js 16 behaviour differs from common knowledge** | M | L | Read the bundled docs in `node_modules/next/dist/docs` before using an API (see `AGENTS.md`); D-023/D-024 record what bit us. | Dev |
| R-15 | **Data loss** (single SQLite file) | L | M | WAL mode; documented backup; migrations tested and never edited after shipping. | Owner |

## Open questions

| ID | Question | Default if unanswered | Needed by |
| --- | --- | --- | --- |
| Q-1 | Model for **bulk** work (job scoring, email sorting). Options: keep `claude-opus-5-5` (best, ~$4/$20 per M tokens), `claude-sonnet-5-5` ($2/$10), or `claude-haiku-5-5` ($0.10/$0.50, far cheaper for classification). | Opus for everything, with the prefilter keeping volume low. | Day 2 |
| Q-2 | Which companies make the ~250? I'll draft a list (Big 4, product companies, top Indian and global tech, semiconductors/storage like SanDisk) for you to prune. | Draft list as seeded. | Day 2 morning |
| Q-3 | Should auto mode ever submit **without** a final Telegram confirmation? | Yes for searches set to auto; review mode always asks. | Day 2 |
| Q-4 | Is a test application to a real employer OK for the Day 2 end-to-end check? | No: hold at review and don't submit. | Day 2 |
| Q-5 | Install REA as an MCP server in Claude Code (`npx rea-agents setup`)? It changes the agent config. | Not installed; endpoint mapping is done manually. | Day 1 (phase 2) |
| Q-6 | Publish to GitHub at the end? | Stays local (D-028). | Any time |
