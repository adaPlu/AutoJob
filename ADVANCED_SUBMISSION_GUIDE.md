# Job Application Automator v1.4.5 — complete and verified submissions

The program processes up to 500 planned searches and up to 200 candidate applications per run. It still cannot guarantee 200 submissions; forms blocked by passwords, CAPTCHA, legal acknowledgments, missing factual answers, or unsupported ATS widgets must be reviewed rather than invented.

## For best completion rates

1. Extract into a NEW v1.4.5 folder, run `CHECK_SETUP.bat` and `START_CHROME.bat`. Sign in to the relevant job sites in that Chrome profile before starting applications.
2. Preserve your previous history with `IMPORT_OLD_HISTORY.bat` to prevent duplicate applications.
3. Edit `profile.json` with `EDIT_PROFILE.bat` if a screening question repeatedly lacks a factual answer. Put explicitly verified custom answers into `applicationAnswers`, e.g.:

```json
"applicationAnswers": {
  "How many years of Python experience do you have?": "3",
  "When could you begin working?": "2026-11-02"
}
```

These are *illustrative* values, not claims about the applicant. Delete examples unless they are true and verified. The program does not infer experience years, legal consents, EEO or medical answers.

4. Run `RUN_AUTOMATOR.bat`, then `VIEW_RESULTS.bat` and `REVIEW_BLOCKERS.bat`.
5. Look for actual confirmation evidence in the `outbox/verification` files and your employer emails. `Submit clicked` is **not** confirmation. The app cannot access Gmail to reconcile receipts automatically.

## Improvements in this release

- Matches field descriptions from label, `aria-labelledby`, name, placeholder, autocomplete, and Workday-style automation IDs.
- Fills known contact details and resumes, native selects, factual yes/no sponsorship and work-eligibility screening, associated radio groups, and accessible custom dropdowns when an exact option exists.
- Handles number/date fields only when the user provided exact answers; does not fabricate skills, years, degrees, salary, protected-class answers, or consent to terms.
- Detects required native controls and page-level validation messages before submitting, including missing résumé file inputs and unchecked required consent boxes.
- Waits for actual DOM/field changes when advancing through multi-step forms instead of comparing only the first part of the page text.
- Records counts of fields filled and steps completed in each result; saves screenshots/HTML for inspection and blocks uncertain re-submissions.
- Makes form-validation failures retryable after the applicant supplies the missing answer.

## Limitations

Some sites require password entry, phone verification, CAPTCHA, ID validation, browser extension operations, timed assessments or additional information not in the profile. These are recorded for review rather than bypassed or answered speculatively. Browser-side evidence is not an employer-email receipt.
