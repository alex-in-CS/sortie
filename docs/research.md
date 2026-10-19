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

Public, unauthenticated job-board endpoints that the providers' own careers widgets use. **All five
were verified live on 2026-10-19** (Stripe, Palantir, Notion, Bosch, NVIDIA) and are pinned with
recorded fixtures in `src/lib/sources/fixtures/`.

| Provider | List endpoint | Status |
| --- | --- | --- |
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true` | Documented public Job Board API. Applying through their API needs the employer's key, so we fill the web form instead. |
| Lever | `GET https://api.lever.co/v0/postings/{company}?mode=json` | Documented public postings API. |
| Ashby | `GET https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true` | Documented public job-board API. |
| SmartRecruiters | `GET https://api.smartrecruiters.com/v1/companies/{company}/postings` | Documented public Posting API. |
| Workday | `POST https://{tenant}.wd{n}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` with `{limit, offset, searchText, appliedFacets}` | **Verified live, but not a documented public API**: it's what Workday careers pages call. Pages are capped at 20; `total` is only reliable on the first page and tops out at 2000. Detail: `GET …/wday/cxs/{tenant}/{site}/job/{path}` → `jobPostingInfo` (description HTML, country alpha-2, time type). Apply = handoff (account + CAPTCHA). |
| SuccessFactors, Taleo, iCIMS, custom sites | various | Out of scope for fetching in the 3 days unless a company on the list needs it. Apply = handoff. |
| Discovery | JSearch (RapidAPI) or SerpAPI Google Jobs | Optional, paid with free tiers; aggregates listings including LinkedIn/Glassdoor *legally via the provider*. |

Notes from the live checks:
- **Greenhouse** `content` is HTML escaped twice (`&lt;p&gt;`): decode, strip, decode again. Each job
  has `company_name`, useful to confirm a guessed slug. No structured salary.
- **Lever** has `country` (alpha-2), `workplaceType`, `categories.commitment`, and sometimes `salaryRange`.
- **Ashby** has `isListed` (skip false), `workplaceType`, `employmentType` (`FullTime`, `Intern`, …),
  `address.postalAddress.addressCountry` (a name), and `compensation.summaryComponents` when shown.
- **SmartRecruiters** lists without descriptions; `GET …/postings/{id}` has `jobAd.sections`. A company
  ID that doesn't exist returns `totalFound: 0`, not 404. The `q` parameter searches.
- **Workday** `searchText` is broad (NVIDIA: "software engineer" matched 1754 of 2000), so it narrows
  only a little.

### Which ATS the big names use (verified 2026-10-19)

A background agent checked 103 large companies by fetching their careers pages and calling the feed
it found. Every "supported" entry returned a job count above 0. The full table is
`scripts/enterprise.json`.

| ATS | Companies |
| --- | --- |
| **Workday** (fetched) | PwC, Accenture, Micron, Intel, Broadcom, Analog Devices, Marvell, NXP, Applied Materials, KLA, Cadence, HP Inc, HPE, Cisco, Salesforce, Adobe, Workday, Autodesk, Red Hat, CrowdStrike, PayPal, Mastercard, Visa, Target, Palo Alto Networks, Wells Fargo, Citi, Barclays, BlackRock, Philips, GE Aerospace, GE Vernova, Boeing, Airbus |
| **SmartRecruiters** (fetched) | ServiceNow, Freshworks, Bosch, Western Digital, Arista, Canva, Wise, Delivery Hero, Grab, Swiggy, Unacademy, Ixigo, Wayfair, Whatfix, Cars24 |
| **Greenhouse / Lever / Ashby** (fetched) | Thoughtworks, Zscaler, Okta, Razorpay, Paytm, CRED, Meesho, Snowflake, and the product companies in the registry |
| Avature | Deloitte, SanDisk, Synopsys, HSBC, Intuit, IBM, Siemens |
| SuccessFactors | EY, Wipro, HCLTech, Globant, Seagate, SAP |
| Eightfold | Microsoft, Qualcomm, Lam Research, NetApp, Ericsson, Infineon, Morgan Stanley |
| Oracle Cloud HCM | Oracle, JPMorgan Chase, Texas Instruments, Dell, Nokia, Fortinet, Honeywell, American Express |
| iCIMS | AMD, Atlassian, Arm |
| Own system | KPMG, Google, Amazon, Apple, Meta, Uber, Infosys, TCS, Capgemini, Cognizant, Tech Mahindra, EPAM, McKinsey, Bain, Goldman Sachs, Deutsche Bank, UBS, MediaTek, Walmart Global Tech, PhonePe, Zomato |
| Other | BCG (Phenom), LTIMindtree (RippleHire), Flipkart (TurboHire), Zoho (Zoho Recruit) |

Big enterprises split roughly evenly between Workday (fetchable) and portals with no public feed.
Startups are almost all on Greenhouse, Ashby or Lever. Many Indian startups host jobs on their own
pages or on Indian ATSs, which is why 141 candidates weren't found.
