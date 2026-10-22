# AutoJob v1.5.3 — 100 browser searches and Gmail confirmation

- Reduced the default and enforced maximum browser search budget from 500 to 100; still rotates fairly across the configured browser sources.
- Added optional read-only Gmail OAuth Desktop integration, supporting multiple authorized Gmail accounts and local refresh tokens.
- At the end of each live run, reconciles candidate employer/ATS confirmation emails with logged application jobs.
- Only a uniquely matched, affirmative email acknowledgement adds `submitted-email-confirmed` to the log and success totals.
- Distinguishes browser evidence from Gmail receipt confirmation. A missing email is **unconfirmed**, not failed.
- Includes `CONNECT_GMAIL.bat` and `CHECK_GMAIL.bat` for one-time account setup and later rechecks.
- Keeps résumé, applicant profile, credentials, OAuth tokens, and inbox contents out of the public repository.
