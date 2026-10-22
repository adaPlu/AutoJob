# Architecture overview

This project runs locally on Node.js and uses `playwright-core` to attach to a dedicated desktop Google Chrome session through Chrome DevTools Protocol (CDP). It does not need its own hosted server.

1. **CLI / preflight** (`src/index.js`, `src/preflight.js`, `src/profile.js`): checks configuration, profile, résumé path and flags (`--preflight`, `--dry-run`, `--plan`).
2. **Session stage** (`src/prelogin.js`, `src/browser.js`): opens configured job-board entry pages, invites the user to sign in manually, records whether search automation is enabled or paused.
3. **Job discovery** (`src/discovery-plan.js`, `src/feeds.js`, `src/discover.js`): combines configured site searches with Jobicy/Remotive feeds, normalizes candidate URLs and prioritizes fresh sources.
4. **Application processing** (`src/apply.js`, `src/eligibility.js`): checks job-page eligibility, handles navigation and calls the form helpers.
5. **Form preparation** (`src/simplify-copilot.js`, `src/forms.js`, `src/acknowledgements.js`): attempts visible Simplify autofill; handles supported contact fields, uploads, choices and informational notices; flags unsupported required questions.
6. **Outcome evidence** (`src/verification.js`, `src/submission-ledger.js`, `src/log.js`, `src/reconcile.js`): records browser-derived status and uncertainty; a click alone is not employer acceptance.
7. **Review and reporting** (`src/report.js`, `src/review.js`, `src/audit.js`): summarizes job-source counts, review blockers and verification artifacts.

## Data flow

`config.json` + `profile.json` + résumé → preflight → Chrome CDP/session review → discovery → candidate normalization/deduplication → fill and validate → optional submit → local ledger/reports.

The CLI does **not** automatically connect to Gmail or any employer's backend to verify external receipt. Some boards implement incomplete or dynamic form behavior; manual review remains necessary.
