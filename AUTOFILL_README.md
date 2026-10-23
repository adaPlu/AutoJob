# Improved autofill

Double-click `START_ALL.bat` for the usual run. Chrome will keep your Simplify extension and sign-ins in the dedicated profile. The application handler will try the visible Simplify Copilot autofill button when available and then fill remaining supported fields itself.

The built-in filler handles labeled contact details, résumé uploads, native selects, popup dropdowns, radios, and explicitly configured screening answers. A second fill pass catches late fields after résumé parsing.

Unanswered required, legal, assessment, and sensitive questions stop the application and appear in `outbox/review-needed.csv`. Set truthful answers in `profile.json` -> `applicationAnswers` where appropriate.

`data/application-log.csv` contains attempted job results; it is not a ledger of confirmed deliveries. Preserve old history to avoid duplicate submissions.
