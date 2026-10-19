# Research

## 1. JobCopilot (jobcopilot.com)

Studied from public pages on 2026-10-19 (home, automate-job-applications, pricing,
job-application-tracker, chrome-extension). Claims are theirs and unverified. We use it for the
feature set only (D-029).

**What it does**
- One-time setup: upload a CV, answer standard screening questions, pick job titles and filters.
- Searches company career pages (they claim 500k+ companies) every **2 hours**, only on official sites.
- Per "copilot" (Premium 1, Elite 3): its own resume, titles, filters, company exclusions and a
  **selectivity** setting.
- Two modes: **auto-apply** or **auto-fill and save for review**. Their advice is to start in review
  and switch to auto once confident.
- **Learns from edits:** answers you correct are remembered and reused; past applications' answers can
  be edited.
- Resume tailoring per job (Elite), with review. AI resume and cover-letter builders.
- Daily caps: 20 (Premium) / 50 (Elite) job matches a day.
- **Tracker:** a kanban (Saved, Applied, … Offer); each card keeps the full job description, the
  history of automated steps, and the AI answers. Drag and drop, manual adds from any source.
- **Daily email recap.**
- **Chrome extension:** autofills forms on any site from the profile; you review before submitting.
- Extras: hiring-manager emails (credits), AI mock interviews, salary negotiation, career advisors,
  a personality test.
- Pricing roughly $0.93–$1.05 a day.

**What we took, what we skipped:** see [D-030](decisions.md#d-030-jobcopilot-features-taken-and-skipped).

**Gaps in JobCopilot that Sortie fills:** it doesn't read your inbox or move applications on replies;
it doesn't say how it handles CAPTCHAs or account portals; it recommends typing "1" into salary
fields; it's hosted, so your data and credentials live with them.

## 2. REA (github.com/morluto/rea)

MIT-licensed "Reverse Engineer Anything" MCP server and CLI (`rea-agents` on npm). It covers native
binaries (Ghidra/IDA/Hopper), JavaScript/Electron, .NET, Android, and **websites through the Chrome
DevTools Protocol**.

Relevant capabilities (from `docs/browser-observation.md`):
- `inspect_web_page`: DOM, accessibility tree, scripts, resources, network and console metadata of
  an open page.
- `observe_web_session`: records navigation, redirects and lifecycle while *you* perform an action.
- `analyze_web_bundle`: route and endpoint candidates from page scripts, without executing them.
- `compare_web_captures`, `capture_web_screenshot`.
- It's passive: it attaches to a browser you already have open, and doesn't drive actions or
  evaluate code.

**How Sortie uses it** (D-029): as a development tool on **public careers pages**, to confirm which
JSON endpoints a provider's job board calls (crucial for Workday, whose endpoint isn't a documented
public API) and to map application-form fields for the phase 4 filler. Not a runtime dependency; no
code copied. Its own disclaimer forbids bypassing bot protection or copying proprietary code, which
matches our rules.

## 3. Job sources

Public, unauthenticated job-board endpoints that the providers' own careers widgets use. Shapes are
from provider docs and common knowledge; **each one gets verified live and pinned with a recorded
fixture in phase 2.**

| Provider | List endpoint | Status |
| --- | --- | --- |
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true` | Documented public Job Board API. Applying through their API needs the employer's key, so we fill the web form instead. |
| Lever | `GET https://api.lever.co/v0/postings/{company}?mode=json` | Documented public postings API. |
| Ashby | `GET https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true` | Documented public job-board API. |
| SmartRecruiters | `GET https://api.smartrecruiters.com/v1/companies/{company}/postings` | Documented public Posting API. |
| Workday | `POST https://{tenant}.wd{n}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` with `{limit, offset, searchText, appliedFacets}` | **Unverified, not a documented public API**: it's what Workday careers pages call. Verify with REA; keep request rates low. Apply = handoff (account + CAPTCHA). |
| SuccessFactors, Taleo, iCIMS, custom sites | various | Out of scope for fetching in the 3 days unless a company on the list needs it. Apply = handoff. |
| Discovery | JSearch (RapidAPI) or SerpAPI Google Jobs | Optional, paid with free tiers; aggregates listings including LinkedIn/Glassdoor *legally via the provider*. |

**Which provider each target company uses** (Big 4, SanDisk and so on) gets recorded in the registry
as we verify it. Large enterprises lean towards Workday/SuccessFactors, and startups towards
Greenhouse/Lever/Ashby.
