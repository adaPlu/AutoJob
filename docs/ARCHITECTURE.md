# Architecture and engineering notes

AutoJob is a local **Node.js JavaScript ES module** command-line application that controls a user's dedicated Google Chrome window through **Playwright Core** and the **Chrome DevTools Protocol (CDP)**. Windows batch launchers orchestrate the stages. There is no hosted application server, database service or cloud job-submission API.

## Modules

| Responsibility | Implementation | Description |
| --- | --- | --- |
| Run controller | `src/index.js` | Browser attach, configuration loading, plan iteration, per-source fairness, attempt cap, timeout recovery, result summary |
| Inactivity watchdog | `src/watchdog.js` | Per-item 300,000ms inactivity deadline, milestone resets, abort propagation and bounded cleanup |
| Config and checks | `src/profile.js`, `src/preflight.js` | Reads JSON inputs; validates applicant, résumé and configured sources |
| Login sessions | `src/prelogin.js`, `src/browser.js` | Opens user-controlled Chrome account pages, checks visible session state; user handles login/MFA |
| Discovery | `src/discovery-plan.js`, `src/discover.js` | Generates searches, visits boards/ATS pages, extracts job links and normalizes URLs |
| Public JSON feeds | `src/feeds.js` | Fetches Jobicy and Remotive public jobs; uses AbortController and HTTP timeouts |
| Eligibility | `src/eligibility.js` | Posting-level remote and title checks; does not fabricate job eligibility |
| Application workflow | `src/apply.js` | Loads each posting, opens supported application UI, fills and navigates steps, submits only if configured and validated |
| Autofill | `src/forms.js`, `src/simplify-copilot.js` | Native field/select/radio/file interactions and optional visible Simplify Copilot autofill control |
| Popups | `src/acknowledgements.js` | Recognized cookie banners and informational notice dismissal; no blind legal consent clicks |
| Tracking | `src/log.js`, `src/submission-ledger.js`, `src/verification.js` | CSV outcome logs, SHA-256 URL identifiers, submission uncertainty, screenshots and confirmation checks |
| Post-run | `src/report.js`, `src/review.js`, `src/reconcile.js`, `src/audit.js` | Counts by site, actionable review queue, receipt reconciliation and audits |

## Runtime sequence

```text
START_ALL.bat → npm dependency check → preflight → Chrome/CDP attach
        → manual sign-in/READY → direct URLs → feed queries
        → round-robin browser searches → per-posting application
        → CSV + write-ahead ledger + evidence → reports + exit
```

Each **individual feed fetch, browser search and application** is supervised independently by `runWithWatchdog`. Default inactivity threshold is 300,000ms (five minutes), configurable as `itemInactivityTimeoutMs`. Meaningful completed milestones can reset the timer, so an active multi-step application is not interrupted solely due to total length.

If the timeout expires:

1. Its AbortSignal is triggered, preventing the application handler from proceeding to a new final Submit action.
2. The active job/application tab or search tab is requested to close; cleanup has a bounded wait.
3. The stalled item is recorded as `timed-out`; a possible in-flight submission is instead `submit-clicked-unverified` and the write-ahead ledger prevents automatic resubmission.
4. Search tab is reopened as necessary; the next eligible item/site is processed. If the browser itself cannot recover, AutoJob stops the run cleanly and writes its summary.
5. Once all candidate jobs or planned sources have been attempted (or configured limits reached), the queue naturally exhausts and the process exits.

The watchdog protects the run controller against unresolved promises; it **cannot guarantee cleanup of a Chrome process that is frozen at the operating-system level**, nor can it prove the employer did or did not receive a Submit click. Never treat a timeout after possible submission as an invitation to retry blindly.

## Storage and safety

- `config.json` and `profile.json` hold user-specific local settings; example versions are safe to share.
- `data/application-log.csv` is an append-only local record of outcomes.
- `data/submit-ledger.json` is a write-ahead record of uncertain or confirmed submissions. It is **not** reset by the watchdog.
- `data/prelogin-status.json` is the last login-stage classification.
- `outbox/last-run-summary.json`, `outbox/review-needed.csv`, and `outbox/verification/` contain local reports and evidence.
- Personal files, browser user-data and runtime logs are ignored by Git. The public repository must not contain applicant data.

When enabled, Gmail receipt reconciliation uses a separately authorized local OAuth Desktop client with read-only scope. `src/gmail-client.js` handles OAuth and Gmail API requests, `src/gmail-verification.js` matches individual logged jobs and updates statuses. Screenshots/browser statuses do not count toward the email-confirmed success metric. Gmail does not receive form submission data, and missing email does not mean submission failure.

## Gmail verification lifecycle (v1.5.3)

1. OAuth Desktop PKCE authorization obtains per-account read-only refresh tokens in private `data/gmail-tokens/` files.
2. The live run completes browser tasks and flushes application records. Gmail verification is then invoked with the existing watchdog timeout.
3. The Gmail REST API returns message metadata and text to the local process for candidate receipts only. Raw mail bodies are not written to disk.
4. Matching requires positive receipt language, plausible time, unique employer/job association and an actual submitted/uncertain job entry. A receipt cannot confirm more than one job.
5. Successful matches append `submitted-email-confirmed` and update the ledger; results are deduplicated by job URL.
6. `CHECK_GMAIL.bat` permits rechecking delayed receipts without a new job search or submission.

No authenticated Gmail API credentials are part of the repository or packaged release.
