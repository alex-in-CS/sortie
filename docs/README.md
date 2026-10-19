# Sortie engineering docs

Everything needed to understand, run, change and defend this project. Read in this order:

| # | Doc | What it answers |
| --- | --- | --- |
| 1 | [requirements.md](requirements.md) | What we're building, for whom, what "done" means, and what is out of scope. |
| 2 | [architecture.md](architecture.md) | How the pieces fit, today and at the end of the 3 days. A map of every source file. |
| 3 | [data-model.md](data-model.md) | Every schema and field, the database, migrations, invariants, and the tables still to come. |
| 4 | [decisions.md](decisions.md) | Every decision with its context, the alternatives, the tradeoffs and the consequences. |
| 5 | [plan.md](plan.md) | The 3-day build plan: day-by-day tasks, acceptance criteria, cut lines, and what's needed from you. |
| 6 | [operations.md](operations.md) | Setup, configuration, scripts, testing, resetting data, troubleshooting, and environment gotchas. |
| 7 | [risks.md](risks.md) | Legal/ToS, technical, cost, privacy and schedule risks, with mitigations. Open questions. |
| 8 | [research.md](research.md) | What we took from JobCopilot and why, how REA fits, and the job-source landscape. |
| 9 | [dev-log.md](dev-log.md) | A dated log of what was built, bugs found and how they were fixed. |

## House rules for these docs

- **The docs change in the same commit as the code they describe.** A decision isn't made until it's in
  `decisions.md`.
- **Decisions are append-only.** If one is reversed, add a new entry that supersedes it and mark the old
  one `Superseded by D-0xx`. Don't rewrite history.
- **Say what's verified and what isn't.** Anything assumed but not yet tested (an endpoint shape, a
  provider limit) is marked **unverified**.
- IDs are stable: requirements are `FR-n` / `NFR-n`, decisions `D-0nn`, risks `R-nn`, open questions `Q-n`.
