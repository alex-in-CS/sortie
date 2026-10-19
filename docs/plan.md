# 3-day build plan

**Window:** Mon 19 Oct → Wed 21 Oct 2026. **Goal:** the definition of done in
[requirements.md §7](requirements.md#7-definition-of-done-for-the-3-day-build).

Six phases in three days only works with strict scope. Every phase below has **must**, **should** and
**stretch** items. If a day slips, cut stretch first, then should, and never skip the safety rules
(truth check, caps, no blind submits).

## Day 1: Mon 19 Oct, foundation + jobs

| | Item | Status |
| --- | --- | --- |
| must | Phase 1: profile, resume parsing, skills, preferences | ✅ `6950d9e` |
| must | Searches and screening answers (from JobCopilot) | ✅ `a99551c` |
| must | Engineering docs (this folder) | ✅ |
| must | Phase 2a: company registry (schema + seed of ~250 with provider/board), provider adapters for Greenhouse, Lever, Ashby, SmartRecruiters, Workday, job normalisation + dedupe | ⬜ |
| must | Phase 2b: hard filters + deterministic score + Jobs page | ⬜ |
| should | Worker process + `tasks` table + 2-hour schedule (D-033, D-031) | ⬜ |
| stretch | Discovery via jobs API | ⬜ |

**Accepted when:** a worker run fetches real jobs from ≥ 3 providers, and the Jobs page shows filtered,
scored matches with reasons, from a clean DB.

## Day 2: Tue 20 Oct, match → tailor → apply

| | Item |
| --- | --- |
| must | LLM match score + reasons for prefiltered candidates (D-032); selection respecting caps |
| must | Tailored resume (from profile only) + truth check + PDF render (HTML template → Chrome PDF) |
| must | Playwright form filling for Greenhouse and Lever (the most common simple forms): field mapping from profile/answers/documents, an upload step, a grounding check per field |
| must | Review mode end-to-end: the application is held with filled values and screenshots; Approve submits |
| must | Applications page (kanban) with step history |
| should | Ashby adapter; Workday prefill + handoff (opens a visible browser at the filled page) |
| should | Learn from edits: answers corrected in review → answer bank (`learned`) |
| should | Cover letter |
| stretch | Autofill browser extension |

**Accepted when:** one real job goes saved → tailored (passes the truth check) → filled → held for
review → approved → submitted (or held, if the owner prefers not to send a test application).

## Day 3: Wed 21 Oct, inbox, notifications, hardening

| | Item |
| --- | --- |
| must | Gmail OAuth (installed-app flow, `gmail.readonly`), polling, classification, matching to applications, stage updates |
| must | Telegram bot: alerts (interview, needs input, awaiting review, handoff, failure) + daily recap |
| must | Full run with real keys; fix what breaks |
| must | Docs final pass: every decision logged, operations and troubleshooting complete, README updated |
| should | Inbox page |
| stretch | Approve from Telegram; interview prep pack; mock interview |

**Accepted when:** a real reply in Gmail moves an application's stage and sends a Telegram message;
`npm test`, `tsc`, lint and build are clean; and the docs match the code.

## What's needed from you, and when

| When | What | Why |
| --- | --- | --- |
| **Today** | `ANTHROPIC_API_KEY` in `.env.local`, then upload your real resume | Nothing LLM-based can be tested without it. The resume parse is the first live check. |
| **Today** | Answer Q-1 in [risks.md](risks.md): which model for bulk scoring and email sorting | It decides cost per day. |
| Day 2 morning | Prune the draft company list (I'll seed ~250) | Your target list, your call. |
| Day 2 | A real posting you're happy to test-apply to (ideally a Greenhouse or Lever one) | End-to-end check of filling and submitting. |
| **Day 3 morning** | A Google Cloud project with the Gmail API enabled and an OAuth client of type *Desktop app*, with you added as a test user (steps in [operations.md](operations.md#gmail-setup-day-3)) | Gmail access. Only you can create it. |
| **Day 3 morning** | A Telegram bot token from @BotFather, and a message sent to the bot | Notifications. |
| Optional | A jobs-API key (JSearch via RapidAPI, or SerpAPI) | Discovery beyond the curated list. |

## Cut order if time runs short

1. Interview prep, mock interview, approve-from-Telegram, the extension.
2. Discovery API.
3. Cover letters (the tailored resume matters more).
4. Ashby/SmartRecruiters apply (keep their *fetchers*; apply on Greenhouse/Lever first).
5. Inbox page (keep the Gmail → stage → Telegram path; the UI can wait).

These are never cut: the truth check, caps, grounded answers, review-by-default, idempotence.
