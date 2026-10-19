# Requirements

## 1. Problem

Applying to good software jobs is slow, repetitive work. It means finding openings across hundreds of
career sites, tweaking the resume for each one, filling the same forms again and again, and then
watching an inbox to catch the few replies that matter. Doing it by hand caps you at a handful of
quality applications a day. Spraying generic applications doesn't work either: recruiters see every
one, and a generic resume loses.

## 2. Product goal

A personal autopilot. You set up your profile, skills, searches, screening answers and preferences
once. Sortie then:

1. **finds** openings at ~250 strong companies (plus newly discovered ones) that fit your skills and that
   you're eligible for;
2. **tailors** a truthful resume and cover letter for each;
3. **applies**: submitting on its own where it can do so safely, and preparing everything for a single
   click where it can't;
4. **watches Gmail** and tracks every application through to an outcome;
5. **interrupts you only when needed** (an interview invite, a question it can't answer, an
   application waiting for approval) via Telegram.

## 3. User

One person: the owner, running Sortie on their own Windows PC with their own API keys. Not multi-user,
not hosted (see [D-001](decisions.md#d-001-personal-tool-not-a-multi-user-product)). Target roles are
software jobs (backend, full-stack, data, ML, DevOps and so on), driven by the skills on file rather
than a fixed title list.

## 4. Functional requirements

Status: ✅ done · 🟡 partial · ⬜ not started. Phase numbers match [plan.md](plan.md).

### Profile and setup (phase 1)

| ID | Requirement | Status |
| --- | --- | --- |
| FR-1 | Upload a resume (PDF, DOCX, TXT, MD, ≤10 MB); it is parsed into a structured profile. | ✅ (live Claude call not yet run, see [plan](plan.md)) |
| FR-2 | Parsing copies facts only: no invented employers, dates, metrics or skills. | ✅ (prompt rule; to be checked on a real resume) |
| FR-3 | Re-uploading never overwrites user edits; it only fills empty fields and adds missing entries. | ✅ tested |
| FR-4 | Edit contact (name, email, phone, location, links), headline, summary. | ✅ |
| FR-5 | Edit skills: name, category, level (learning/working/strong/expert), years; bulk-add by comma list; common skills auto-categorised. | ✅ |
| FR-6 | Edit experience, projects, education and certifications, with reordering. | ✅ |
| FR-7 | Multiple **searches**, each with titles (optional; empty = skills decide), seniority, employment type, excluded keywords, selectivity (min match score), apply mode (review / auto), on/off. | ✅ |
| FR-8 | **Screening answers** given once: expected and current salary, free-text salary fallback, "how did you hear", US self-ID (default decline), and an answer bank of custom Q&A with suggested common questions. | ✅ |
| FR-9 | Global preferences: work modes, countries, cities, work authorization, sponsorship need, relocation, years of experience, notice period, salary floor, excluded companies, max per company, daily cap, discovery on/off. | ✅ |
| FR-10 | An overview that shows setup progress and what's missing. | ✅ |

### Jobs (phase 2)

| ID | Requirement | Status |
| --- | --- | --- |
| FR-11 | A registry of ~250 target companies, each mapped to its careers-site provider and board ID. | ✅ 217 live-verified boards + 56 unsupported listed (D-038, D-044) |
| FR-12 | Fetch open jobs from each company's public job feed (Greenhouse, Lever, Ashby, SmartRecruiters, Workday) every ~2 h. | ✅ (D-031, D-039, D-042) |
| FR-13 | Discovery: find new companies or jobs through a jobs API (optional, needs a key). | ⬜ (stretch) |
| FR-14 | Normalise and dedupe jobs; keep a description snapshot; mark jobs closed when they disappear from the feed. | ✅ (D-043) |
| FR-15 | Hard filters: location/work mode/authorization, excluded companies and keywords, seniority, employment type, salary floor (when pay is listed). | ✅ (D-040) |
| FR-16 | A match score (0–100) per job × search, with reasons; only jobs ≥ the search's min match qualify. | ✅ deterministic (D-040) + Claude review of the best candidates (D-050) |
| FR-17 | A Jobs page: browse, filter and inspect matches and their reasons. | ✅ |

### Tailoring (phase 3)

| ID | Requirement | Status |
| --- | --- | --- |
| FR-18 | Per job: a tailored resume (reordered and reworded from the profile, emphasising relevant skills) and a cover letter. | ✅ (D-050, D-051) |
| FR-19 | Truth check: every claim in the tailored output must trace to the profile; anything that doesn't is rejected. | ✅ rules + Claude, removes or reverts (D-051) |
| FR-20 | Export to PDF from a clean, ATS-friendly template. | ✅ (D-052) |

### Applying and tracking (phase 4)

| ID | Requirement | Status |
| --- | --- | --- |
| FR-21 | Fill application forms from profile + answers + tailored documents via browser automation. | ✅ Greenhouse and Lever; others hand off with the link (D-054, D-056) |
| FR-22 | Review mode: prepare and hold for approval. Auto mode: submit when the form is fully and confidently filled. Portals with accounts or CAPTCHAs always hand off to the user. | ✅ held, or auto-submit through the gate; Open in Chrome hands off (D-056) |
| FR-23 | Never submit a form with an unanswered required field or an answer not grounded in stored data; escalate instead. | ✅ rules, bank, quote-checked Claude; the rest go to you (D-055) |
| FR-24 | Enforce max applications per company and per day across searches. | ✅ at selection (D-050). An application holds its slot from the moment it's picked, so submitting needs no second check. |
| FR-25 | Learn from edits: an answer corrected during review is saved to the answer bank (`source: learned`). | ✅ answers given on the Applications page (D-055) |
| FR-26 | An application tracker (kanban): Saved → Ready for review → Applied → In process → Interview → Offer / Rejected / Withdrawn, with the job snapshot and a history of every automated step. | 🟡 up to Submitted, with the step history; the stages after that come with the inbox (phase 5) |
| FR-27 | Browser extension to autofill any application page from the local profile. | ⬜ (stretch) |

### Inbox (phase 5)

| ID | Requirement | Status |
| --- | --- | --- |
| FR-28 | Read-only Gmail access; poll for new mail. | ⬜ |
| FR-29 | Classify each relevant email: confirmation, rejection, next step / assessment, interview invite, needs your input, other. Match it to an application. | ⬜ |
| FR-30 | Update the application's stage automatically from the classification. | ⬜ |

### Notifications (phase 6)

| ID | Requirement | Status |
| --- | --- | --- |
| FR-31 | Telegram alerts only for: interview invites, needs-your-input emails, applications awaiting approval, handoffs, failures. | ⬜ |
| FR-32 | A daily recap: found, applied, replies, what's waiting on you. | ⬜ |
| FR-33 | Approve or skip a review-mode application from Telegram. | ⬜ (stretch) |

### Interview prep (phase 7, stretch)

| ID | Requirement | Status |
| --- | --- | --- |
| FR-34 | On an interview invite: a prep pack (company, role, likely questions, your matching stories). | ⬜ (stretch) |
| FR-35 | Mock interview chat for that role. | ⬜ (stretch) |

### Orchestration (cross-cutting)

| ID | Requirement | Status |
| --- | --- | --- |
| FR-36 | A background worker that schedules fetch → match → tailor → apply → inbox, resumes after restarts, and doesn't double-apply. | ⬜ |

## 5. Non-functional requirements

| ID | Requirement | How it's met |
| --- | --- | --- |
| NFR-1 | **Truthfulness.** Sortie never states something about the user that isn't in their stored data. | Parse prompt rule (FR-2); merge never invents; truth check (FR-19); grounded answers only (FR-23). |
| NFR-2 | **Privacy.** Personal data stays on the machine except calls to the AI provider (Anthropic, or Google Gemini on a billed key), Google (Gmail), Telegram and the target employer. | `data/` is gitignored; server binds 127.0.0.1; secrets live in `.env.local`. See [D-017](decisions.md), [D-057](decisions.md). |
| NFR-3 | **Respect for sites.** No scraping of sites that forbid it, no CAPTCHA solving, no bot-protection bypass, polite rates. | Use public job feeds only; hand off when blocked. See [D-012](decisions.md), [risks](risks.md). |
| NFR-4 | **Quality over volume.** Defaults of 3 per company and 25 per day; review mode by default. | [D-014](decisions.md), [D-015](decisions.md). |
| NFR-5 | **Idempotence.** No job is applied to twice; restarts are safe. | One application per job (`job_id` unique); a submit without a confirmation is never retried; restarts reset `applying` and `submitting` (D-056). |
| NFR-6 | **Observability.** Every automated action leaves a record you can read. | Application step history (FR-26), logs. |
| NFR-7 | **Cost.** LLM spend kept to a few dollars a day at most. | Deterministic prefilter before any LLM call; batching; caching. See [risks](risks.md) R-08. |
| NFR-8 | **Runs on the owner's Windows machine** with Node 24, no Python, no Docker. | [D-002](decisions.md), [D-004](decisions.md). |
| NFR-9 | **Documented.** Every decision and tradeoff is written down. | This folder. |

## 6. Out of scope

- Multi-user accounts, hosting, billing.
- LinkedIn / Glassdoor / Naukri scraping or auto-apply through those sites ([D-012](decisions.md)).
- CAPTCHA solving or any bot-detection evasion.
- Creating accounts on employer portals automatically.
- Inventing or "enhancing" experience on resumes.
- Buying hiring-manager contact data ([research.md](research.md)).
- Career-advisor fluff (personality tests and the like).

## 7. Definition of done for the 3-day build

The [plan](plan.md) has per-day acceptance criteria. The project is done when, with real keys:

1. A real resume is parsed into a correct profile.
2. A scheduled run pulls real jobs from at least 3 providers, filters them and scores them.
3. A tailored resume PDF passes the truth check for a real job.
4. At least one real application form is filled end-to-end (submitted in auto mode, or held for review).
5. A real Gmail reply moves an application's stage and sends a Telegram alert.
6. All of the above is documented, tested where testable, and committed.
