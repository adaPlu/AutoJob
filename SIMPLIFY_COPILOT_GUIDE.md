# Simplify Copilot integration — v1.4.7

This build **does not use any unofficial Simplify API**. It controls only the public *Autofill This Page* button when visible in the job-application page. Simplify's browser toolbar popup and closed extension shadow roots are not programmatically accessible, so not every page can be auto-triggered. Its *Autopilot* submission service is a different, account-controlled product and is **not invoked** by this automator.

## One-time setup

1. Extract the new ZIP and double-click `SETUP_SIMPLIFY.bat`, or launch `START_CHROME.bat`.
2. In **that specific Chrome window**, install **Simplify Copilot** from the Chrome Web Store and sign in. Your regular Chrome extensions are not shared with this dedicated automation profile. The profile now persists at `%LOCALAPPDATA%\JobApplicationAutomator\ChromeProfile` across versions.
3. Complete your Simplify profile and select your default PDF resume. Review work authorization, sponsorship, skills, employment history, and saved essay answers.
4. In Simplify Copilot Settings, **turn OFF Continuously autofill multipage forms**, because this program itself controls Next and Submit. Enable AI autofill of unique fields only if you are comfortable checking those generated answers. Never automatically accept legal agreements or protected-class questions.
5. Visit a real supported application page manually in that Chrome window. Open the teal Simplify tab; confirm it displays **Autofill This Page**. If it does not, the site may not be supported.
6. Run `CHECK_SETUP.bat`, then `RUN_AUTOMATOR.bat`.
7. Read `VIEW_RESULTS.bat` and `REVIEW_BLOCKERS.bat`. Count employer email receipts separately.

## What changed

- On *each* application step, tries the page's accessible **Autofill This Page** button first.
- Waits for Copilot to fill; the native helper only fills blank supported fields and uploads the configured resume where possible.
- Still validates required questions/resume and tries final Submit only if that passes and `autoSubmit=true`.
- Saves `simplify_autofill` status to `data/application-log.csv`, and click totals to `outbox/last-run-summary.json`. A Copilot click is **not evidence of a complete application**.
- Preserves 500 planned searches, 200 max application attempts, strict remote-only matching, uncertain-submission duplicate protection.
- If Copilot is absent or unavailable, it falls back to the built-in helper by default. The helper does **not** invent answers to sensitive questions.

## Troubleshooting

- `extension-not-visible`: the extension is not installed in the dedicated profile, is not signed in, is disabled for this site, or the visible autofill button is not accessible to browser automation.
- `built-in-only`: native autofill handled fields without the Copilot UI.
- `copilot-triggered-plus-fallback`: Copilot button clicked, with additional native autofill. This is **not** a claim that Copilot completed the whole application.
- Still failing a required question? Add a verified exact answer under `profile.json -> applicationAnswers`, then rerun after checking for duplicates.

Official Simplify documentation: https://help.simplify.jobs/articles/2415391-using-copilot-to-autofill-applications
Settings: https://help.simplify.jobs/articles/8686025-manage-autofill-settings-in-the-simplify-extension
Autopilot (separate): https://help.simplify.jobs/articles/1784339-getting-started-with-autopilot
