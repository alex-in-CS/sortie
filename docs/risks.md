# Risks and open questions

Likelihood/Impact: L · M · H.

## Risk register

| ID | Risk | L | I | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- |
| R-01 | **Terms of service / account bans** from automating job sites | M | H | No LinkedIn/Glassdoor automation (D-012). Only public career-site feeds, polite rates with jitter, no CAPTCHA solving or bot-protection bypass, handoff on account walls (D-013). | Dev |
| R-02 | **A wrong or invented answer gets submitted** | M | H | Truth check on documents, rules + Claude, built (D-016, D-051); field-level grounding (FR-23); review mode by default (D-015); unknown required questions escalate instead of being guessed. | Dev |
| R-03 | **Spam signal to employers** from too many applications | M | H | Per-company and daily caps (D-014); selectivity per search. | Owner (settings) |
| R-04 | **Form variety**: custom fields and multi-step flows break the filler | H | M | Start with Greenhouse and Lever (consistent forms); per-provider adapters; screenshot and hold on anything unrecognised; step history for debugging. | Dev |
| R-05 | **Feed endpoints change** (especially Workday's internal JSON) | M | M | All five verified live 2026-10-19. Adapters isolated per provider, contract tests on recorded fixtures, malformed rows skipped; a failing board records `last_error` (shown on Companies) and doesn't stop the run; `npm run registry:verify` re-checks everything. | Dev |
| R-06 | **Gmail OAuth in testing mode** expires refresh tokens after 7 days | H | L | Documented weekly reconnect; the Inbox page shows token status and a reconnect button; Telegram alert when the token dies. Moving the app to production without verification is an option for personal use (unverified-app warning). **Unverified:** exact behaviour for restricted scopes in production-unverified mode. | Owner |
| R-07 | **Gmail data sensitivity** | M | M | `gmail.readonly` only; query restricted to likely recruiting mail; store classification + snippet, not full bodies; token in `data/` (gitignored). | Dev |
| R-08 | **LLM cost** from scoring thousands of jobs | M | M | Deterministic prefilter; Claude reviews only jobs within 10 points of a bar, at most 40 per cycle, cached by input hash with no date (D-050); tailoring at most 10 per cycle and only for picked jobs; the profile is a cached prompt block. Rough ceiling: about $0.60 of reviews and $2 of tailoring per cycle, far less in steady state. Still to do: show spend on the overview; the Batch API for reviews. | Dev + Owner |
| R-09 | **Hallucinated resume parse** | L | H | Prompt forbids inference; the owner reviews the profile after upload; manual edits win (D-009). | Owner |
| R-10 | **Local server exposed** to the network | L | H | Bound to 127.0.0.1 (D-017). There's no auth layer; adding one is a prerequisite for any remote access. | Dev |
| R-11 | **Schedule:** six phases in three days | H | H | Cut order in [plan.md](plan.md); daily acceptance checks; safety rules never cut. | Dev |
| R-12 | **Blocked on external setup** (API key, Google OAuth client, Telegram token) | M | H | Asked for up front with deadlines ([plan.md](plan.md)); phases that don't need them are built first. | Owner |
| R-13 | **Applying from a home IP** gets rate limited by some ATS | L | M | Low volume by design; backoff; handoff when blocked. | Dev |
| R-14 | **Next.js 16 behaviour differs from common knowledge** | M | L | Read the bundled docs in `node_modules/next/dist/docs` before using an API (see `AGENTS.md`); D-023/D-024 record what bit us. | Dev |
| R-15 | **Data loss** (single SQLite file) | L | M | WAL mode; documented backup; migrations tested and never edited after shipping. | Owner |
| R-16 | **A guessed board slug belongs to a different company** with the same name | M | M | Only slugs that return software jobs are kept; generic names are pinned to explicit slugs; first jobs of new boards are checked by eye (two caught on 2026-10-19: Navi, Neon). Owner can switch any company off. | Dev |
| R-17 | **Companies the owner named aren't fetchable** (Deloitte, EY, KPMG, SanDisk, Google, Microsoft, …) | H | M | Listed on the Companies page with their ATS and a careers link (D-044); discovery API (FR-13) is the path to cover them. | Owner |

## Open questions

| ID | Question | Default if unanswered | Needed by |
| --- | --- | --- | --- |
| Q-1 | Model for bulk work | **Resolved:** Sonnet 5.5 (D-035) | — |
| Q-2 | Which companies make the list? 217 verified boards are seeded; prune them on the Companies page. | All on. | Any time |
| Q-3 | Should auto mode ever submit **without** a final Telegram confirmation? | Yes for searches set to auto; review mode always asks. | Day 2 |
| Q-4 | Test application to a real employer? | **Resolved:** no, hold at review (D-037) | — |
| Q-5 | Install REA as an MCP server? | **Resolved:** yes, Claude Code only (D-036) | — |
| Q-6 | Publish to GitHub at the end? | Stays local (D-028). | Any time |
