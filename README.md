# AutoJob — Job discovery and application assistant

AutoJob is a **Windows-first, Node.js/Playwright automation project** that helps a job seeker discover postings, open real application pages in a dedicated Chrome session, populate supported forms, and record evidence about each application attempt. It integrates with the **Simplify Copilot Chrome extension when its visible Autofill control is available**, falling back to its own form-filling logic.

> **Release:** v1.5.1 (public-safe source edition)  
> **Status:** Source code for local use and testing; application sites change frequently. Automated form filling and simulated tests are **not proof** that a real employer received an application. No applicant résumé, passwords, browser sessions, or personal profile are included in this public repository.

## Features

| Area | Capabilities | Limitations |
|---|---|---|
| Job search | Uses up to 500 configured browser searches over multiple job boards/ATS sources; rotates between sources | 500 is a *maximum planned search budget*, not 500 unique jobs; results depend on availability and site behavior |
| Remote job feeds | Reads structured job postings from Jobicy and Remotive | Feeds may be unavailable, delayed or incomplete |
| Matching | Remote-only filtering, title/keyword filtering, candidate deduplication | A title is not sufficient to establish job fit; inspect live postings |
| Browser | Uses Google Chrome's debugging interface via Playwright; keeps a dedicated profile | Login, MFA, CAPTCHA and employer-specific security challenges require human interaction |
| Site preparation | Opens account-based job sites before searching, checks likely session state, recognizes routine cookie banners | `AUTO-ENABLED` means a site may be searched, **not** that authentication is guaranteed |
| Form filling | Contact data, upload inputs, select/radio controls, supported custom dropdowns, multi-step forms, screening answers | Unrecognized required fields or meaningful legal consents should block submission for review |
| Simplify Copilot | Attempts to use the extension's visible autofill button, then fills supported gaps | The extension is separate software, not an API; it must be installed and signed in within AutoJob's Chrome profile |
| Application attempts | Configurable automated final submit (`autoSubmit`) and 200-attempt per-run cap | Attempt is **not** acceptance; a click alone is not a successful application |
| Audit | CSV logs, duplicate-submission ledger, verification artifacts, run summaries, review-needed reports | Verify with employer receipts and application dashboards before claiming success |

## Requirements

- **Windows 10 or 11** (the one-click `.bat` launchers and Chrome startup scripts are Windows-specific).
- **Node.js LTS** (bundles npm): https://nodejs.org/
- **Google Chrome** (standard Windows installation).
- An internet connection and your own accounts on the job sites you intend to use.
- Your own up-to-date **PDF/DOC/DOCX résumé**.
- Optional: **Simplify Copilot** extension, installed in AutoJob's dedicated Chrome profile.
- For publishing to GitHub: **Git for Windows** and **GitHub CLI (`gh`)**, signed in to your GitHub account.

No OpenAI API key is required for the program's built-in rules-based form filler.

## Installation — Windows

1. Download or clone this repository, then open its root folder. To clone:

   ```powershell
   git clone https://github.com/adaPlu/AutoJob.git
   cd AutoJob
   ```

   (This URL will become usable once the remote repository has been created and pushed.)

2. Double-click **`EDIT_PROFILE.bat`**. On first use it creates `config.json` and `profile.json` from the included `.example.json` templates and opens them in Notepad.
3. Fill out your own `profile.json`: name, email, phone, geographic location, contact links, work authorization/sponsorship answers, skills, and any specific `applicationAnswers` you can truthfully provide. **Never guess legal, eligibility, or demographic answers.**
4. Put your résumé at **`resume.pdf`** beside `START_ALL.bat`, *or* change `resumePath` in `config.json` to the relative or absolute path of your document.
5. Check `config.json`. The example enables remote filtering, a 500-search budget, a 200-attempt limit and `autoSubmit: true`. **Review answers and try dry-run mode before using automatic final submission.**
6. Double-click **`START_ALL.bat`** to install the Playwright dependency if missing, check configuration, launch/reuse dedicated Chrome, open job sites for login, run searches/applications, and generate results.
7. In the Chrome window, sign in as needed. In the terminal, type **`READY`** to continue or `CANCEL` to stop when asked.

**Privacy:** `config.json`, `profile.json`, your résumé, cookies, Chrome profile and generated results are local files excluded by `.gitignore`. They must not be committed to a public repository.

### Simplify Copilot integration

Run **`SETUP_SIMPLIFY.bat`** once to open the extension installation/help pages **in the dedicated Chrome profile**, and sign in to Simplify there. Enter your applicant profile and résumé in Simplify. The automator looks for the visible Simplify autofill control on supported forms and then attempts to fill unresolved supported fields. It does not use a Simplify private API and does not run Simplify's separate Autopilot service. If both tools try to advance forms, disable Simplify's *continuous multi-page autofill* option so AutoJob controls navigation.

### Alternative commands

```powershell
npm install
npm run preflight      # Validate configuration + résumé; no Chrome required
npm run plan           # Inspect planned source/query searches
npm run dry-run        # Do not click final submit
npm test               # Unit and simulated browser tests; requires Chromium for integration tests
npm run report         # Inspect outcome categories
npm run review         # Print items requiring follow-up
```

Run **`START_CHROME.bat`** before using Node directly, unless Chrome is already running under AutoJob's dedicated profile on `http://127.0.0.1:9222`. Default debugging port 9222 is local-only and **must not be exposed to a network**.

## One-click launch and helper scripts

| Script | Purpose |
|---|---|
| `START_ALL.bat` | One-click preflight → Chrome → login staging → search/apply → reports |
| `EDIT_PROFILE.bat` | Create or edit your private applicant and search configuration |
| `CHECK_SETUP.bat` | Preflight without submitting anything |
| `START_CHROME.bat` | Start/reuse the dedicated Chrome profile |
| `SETUP_SIMPLIFY.bat` | Set up the optional Simplify Copilot extension |
| `PRELOGIN_JOB_SITES.bat` | Open configured account-based sites before running searches |
| `RUN_AUTOMATOR.bat` | Run without the full wrapper, after preparation |
| `VIEW_SEARCH_PLAN.bat` | View the search distribution |
| `VIEW_RESULTS.bat` | Summarize per-site searches, attempts, and outcome evidence |
| `REVIEW_BLOCKERS.bat` | Review missing required answers, CAPTCHA, and other blockers |
| `IMPORT_OLD_HISTORY.bat` | Import your own prior local submission history to reduce repeat applications |
| `PUBLISH_TO_GITHUB.bat` | Create and push **public** `adaPlu/AutoJob` through GitHub CLI on your Windows PC |
| `PUSH_CHANGES.bat` | Commit and push later code changes to the existing repository |

## Configuration reference

Settings live in **private `config.json`**. Values from `config.example.json` are a starting point, not guarantees:

```json
{
  "chromeCdpUrl": "http://127.0.0.1:9222",
  "strictRemote": true,
  "autoSubmit": true,
  "requireResumeUpload": true,
  "maxDiscoverySearchesPerRun": 500,
  "maxJobsPerRun": 200,
  "maxJobsPerSource": 12,
  "maxQueriesPerSource": 20,
  "maxPagesPerSearch": 2,
  "profileFile": "profile.json",
  "resumePath": "resume.pdf"
}
```

- `searchQueries`: change the positions/skills searched. Sites without stable native search can rely on site-restricted discovery.
- `sources`: the enabled discovery identifiers. The example includes 27 identifiers: 25 site/ATS categories plus the Jobicy and Remotive feeds.
- `jobUrls`: optional direct employer application URLs to try first (URLs should be supplied voluntarily and reviewed).
- `preferredKeywords`/`skipTitleKeywords`: rules-based filtering and ranking inputs.
- `preLogin`: controls account-site staging, timeouts, and whether unavailable accounts are skipped.
- `simplifyCopilot`: enables use of the visible extension control, with native fallback.
- `siteAcknowledgements`: handles recognized cookie/info banners; this **does not** authorize employment contracts, background checks, attestations, or assessments.
- `maxJobAttempts`: per-posting retry limit; uncertain prior submissions should not be blindly retried.

**Counter definitions matter:** `maxJobsPerRun=200` is a cap on *application attempts*, not 200 guaranteed completed submissions. `maxDiscoverySearchesPerRun=500` is a cap on *planned browser searches*, which might stop earlier if the application cap is reached.

## Workflow and outcome verification

```text
Edit private config/profile + supply résumé
               |
               v
          Preflight checks
               |
               v
      Chrome CDP + pre-login
               |
           READY / CANCEL
               |
               v
   Remote feeds + site searches
               |
           Job deduplication
               |
        Job page + eligibility
               |
      Simplify Copilot (if found)
               |
      Built-in required autofill
               |
    Form blockers / consent review
               |
      Multi-step navigation
               |
    Submit (only if enabled/safe)
               |
 Evidence + local logs + receipts
```

At the end of a run, inspect:

- `data/application-log.csv`: individual job URL, source, timestamp, status and blocker details.
- `data/submit-ledger.json`: used to guard against duplicates and uncertain submissions.
- `data/prelogin-status.json`: session checks, `AUTO-ENABLED` vs sign-in/security pauses.
- `outbox/last-run-summary.json`: per-site search and attempt counts and run outcomes.
- `outbox/review-needed.csv`: items that need your attention.
- `outbox/verification/`: captured browser evidence, where available.

**Evidence levels:** A browser-observed success message or applied status may indicate the form was submitted; a mere *Submit click* is not sufficient. **The program does not automatically read your Gmail or prove employer receipt**. Confirm through employer email receipts or the employer's applicant dashboard before recording an application as definitively received.

## Troubleshooting

- **`Resume file missing` / `profile.email is missing`:** run `EDIT_PROFILE.bat`, complete the fields and copy your résumé to the path in `config.json`; rerun `CHECK_SETUP.bat`.
- **`Cannot connect to Chrome`:** run `START_CHROME.bat`; keep its window open; ensure `chromeCdpUrl` matches local port 9222 and another process isn't using that port.
- **Simplify doesn't autofill:** install and sign in within AutoJob's Chrome profile, not your regular Chrome profile; open an eligible application page and confirm its button appears.
- **`AUTO-ENABLED (sign-in unverified)`:** searching is permitted but login is *not guaranteed*. Sign in if the site still displays a login form.
- **`HUMAN-VERIFICATION`:** complete any CAPTCHA/MFA manually in Chrome; AutoJob does not bypass these controls.
- **Blank or incomplete application:** the employer may use an unsupported form; use `REVIEW_BLOCKERS.bat`, update truthful answers, and retry only if the ledger permits it.
- **No completed applications:** check per-site candidate and attempt counts in `VIEW_RESULTS.bat`; the run can discover zero valid postings, encounter site blocks, or stop before submitting.
- **Duplicate concern:** use `IMPORT_OLD_HISTORY.bat` before the first run of a new installation, then inspect the existing ledger rather than resubmitting uncertain applications.
- **PowerShell initialization errors:** prefer `.bat` scripts; the primary launcher does not require a PowerShell script to orchestrate its steps.

## Repository structure

```text
AutoJob/
├── START_ALL.bat, EDIT_PROFILE.bat, CHECK_SETUP.bat
├── START_CHROME.bat, PRELOGIN_JOB_SITES.bat, SETUP_SIMPLIFY.bat
├── RUN_AUTOMATOR.bat, VIEW_RESULTS.bat, REVIEW_BLOCKERS.bat
├── PUBLISH_TO_GITHUB.bat, PUSH_CHANGES.bat
├── config.example.json, profile.example.json
├── package.json
├── src/            # Feed discovery, job search, forms, matching, submission checks
├── scripts/        # Chrome startup & readiness
├── tests/          # Unit and simulated browser workflows
└── docs/           # Security and architecture reference
```

## Publishing, contributing and responsible use

**Never publish** private `config.json`, `profile.json`, résumés, Chrome profiles, cookies, application logs, saved screenshots, `.env` files, credentials or personal responses. Those paths are ignored by Git, and the publishing script also scans the staged files for sensitive patterns; review `git status` yourself before pushing.

Site terms, anti-bot controls, and employer instructions still apply. Do not automate CAPTCHA bypass, make up qualifications, or accept legally meaningful terms on somebody else's behalf. High-volume submissions can be unreliable and may trigger account restrictions.

This is an independently developed workflow; it is **not affiliated with or endorsed by Simplify, LinkedIn, Indeed, or other job boards**. No open-source license has been chosen yet, so please obtain the owner's permission before redistribution or reuse beyond what copyright law allows.
