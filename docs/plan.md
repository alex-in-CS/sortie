# Build plan

**Goal:** the definition of done in [requirements.md §7](requirements.md#7-definition-of-done-for-the-3-day-build),
as fast as it can be done properly. The owner's instruction (2026-10-19): no day-by-day pacing; build
straight through, but nothing half-working. Every phase ships with tests, a live check and current
docs before the next one starts.

Each phase has **must**, **should** and **stretch** items. If time gets tight, cut stretch first, then
should. The safety rules are never cut: the truth check, caps, grounded answers, review by default,
idempotence.

## Phase 1: profile and setup ✅

| | Item | Status |
| --- | --- | --- |
| must | Profile, resume parsing, skills, preferences | ✅ `6950d9e` |
| must | Searches and screening answers (from JobCopilot) | ✅ `a99551c` |
| must | Engineering docs (this folder) | ✅ `4132091` |

## Phase 2: jobs ✅

| | Item | Status |
| --- | --- | --- |
| must | Provider adapters: Greenhouse, Lever, Ashby, SmartRecruiters, Workday, with contract tests on recorded responses (D-039) | ✅ |
| must | Company registry, live-verified only (D-038): 217 boards, plus 56 unsupported big names listed with their ATS (D-044) | ✅ |
| must | Jobs stored, deduped, closed when gone from a complete fetch, reopened if back (D-043) | ✅ |
| must | Hard filters + deterministic score with reasons (D-040); Jobs page | ✅ |
| should | Worker + `tasks` queue + ~2 h schedule; `npm run fetch`; Companies page with switches and Fetch now (D-042) | ✅ |
| stretch | Discovery via a jobs API (FR-13) | ⬜ needs a key |

**Accepted when:** a worker run fetches real jobs from ≥ 3 providers into a clean DB, and the Jobs page
shows filtered, scored matches with reasons. See the dev log for the live run.

## Phase 3: LLM scoring and tailoring ✅

| | Item | Status |
| --- | --- | --- |
| must | Claude review (score, verdict, reasons, gaps, dealbreaker) with Sonnet 5.5 for the best rule candidates per search; cached by input hash (D-050) | ✅ |
| must | Selection that respects the per-company and daily caps; manual Apply (D-050) | ✅ |
| must | Tailored resume (from the profile only) + two-pass truth check + PDF via the installed Chrome (D-051, D-052) | ✅ |
| should | Cover letter (same call, same truth check) | ✅ |
| must | Applications page: status groups, PDFs, truth report, skip/restore/re-tailor | ✅ |

**Accepted when:** the full prepare path passes on a temp database with Claude and Chrome faked
(`autopilot.test.ts`), real PDFs render from the template, and the pages work on demo data. **Not yet
checked:** live Claude calls. They need `ANTHROPIC_API_KEY` (see below).

## Phase 4: applying and tracking

| | Item |
| --- | --- |
| must | Playwright form filling for Greenhouse and Lever: field mapping from profile, answers and documents; resume upload; a grounding check per field |
| must | Review mode end to end: held with filled values and screenshots; Approve submits. The live check stops at review (D-037) |
| must | Applications page (kanban) with step history |
| should | Ashby; Workday prefill + handoff (opens a visible browser at the filled page) |
| should | Learn from edits: answers corrected in review → answer bank (`learned`) |
| stretch | Autofill browser extension |

## Phase 5: inbox and notifications

| | Item |
| --- | --- |
| must | Gmail OAuth (installed-app flow, `gmail.readonly`), polling, classification, matching to applications, stage updates |
| must | Telegram bot: alerts (interview, needs input, awaiting review, handoff, failure) + daily recap |
| must | Full run with real keys; fix what breaks; docs final pass |
| should | Inbox page |
| stretch | Approve from Telegram; interview prep pack; mock interview |

## What's needed from you

| Before | What | Why |
| --- | --- | --- |
| **Now** (phase 3 is built and waiting on it) | `ANTHROPIC_API_KEY` in `.env.local`, then upload your real resume | Resume parsing, reviews and tailoring all need it. Nothing has gone to Claude yet. |
| Now | Fill in Preferences (countries, cities, work authorization, years) and check the default search | Matching is only as good as these. |
| Any time | Prune the company list on the Companies page (Q-2) | Your target list, your call. |
| **Phase 5** | A Google Cloud project with the Gmail API enabled and an OAuth client of type *Desktop app*, with you added as a test user (steps in [operations.md](operations.md#gmail-setup-day-3)) | Gmail access. Only you can create it. |
| **Phase 5** | A Telegram bot token from @BotFather, and a message sent to the bot | Notifications. |
| Optional | A jobs-API key (JSearch via RapidAPI, or SerpAPI) | Discovery beyond the registry, and a route to companies without public feeds (D-044). |

## Cut order if time runs short

1. Interview prep, mock interview, approve-from-Telegram, the extension.
2. Discovery API.
3. Cover letters (the tailored resume matters more).
4. Ashby/SmartRecruiters apply (their *fetchers* stay; apply on Greenhouse/Lever first).
5. Inbox page (keep the Gmail → stage → Telegram path; the UI can wait).
