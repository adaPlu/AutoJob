# Security and privacy

AutoJob's public repository excludes personal profile data, attached résumés, tokens, browser sessions, cookies, historical application logs, and evidence screenshots.

## Keep local and private

- `config.json`: may reveal direct job targets and private configuration.
- `profile.json`: contains contact details, work eligibility, and other applicant answers.
- Résumé documents (`.pdf`, `.doc`, `.docx`).
- `data/`, `outbox/`, `receipts.json`, Chrome profile folders, cookies, local storage and session storage.
- `.env` and API tokens/credentials.

`git status --short` should be inspected before each public push; `.gitignore` is a precaution, not a substitute for inspecting staged changes. Never commit a private file even once: deleting it later does not erase the Git history.

## Browser security

Chrome remote debugging is bound to local port 9222; do not expose this port to your LAN, public internet or shared machines. The dedicated profile retains authentication cookies on your computer. Use operating-system account protections and do not share this profile directory.

The system must not bypass CAPTCHA, MFA, account security, required consent, or screening questions. A legal authorization or truthful certification requires applicant review. Submission evidence can be inconclusive; check official employer confirmations.

## Reporting a problem

Avoid publishing screenshots or logs containing applicant or employer personal information. Prefer a minimal reproducible test with fictitious `example.test` contact data.

## Gmail OAuth and confirmation privacy

- The optional connector requests only the Gmail API `gmail.readonly` scope and cannot send or delete messages.
- Keep `gmail-credentials.json` and everything under `data/gmail-tokens/` private. They are gitignored and **must never be committed** or attached to bug reports.
- The local matcher processes receipt messages but only saves minimal message identifiers and matching evidence; full message bodies are not written to log files.
- A Gmail receipt is strong evidence, not a guarantee that the employer accepted the application. Company/time/role mismatches remain unconfirmed.
- Personal use with a testing OAuth project may require reauthorization as refresh tokens expire. Public multiuser apps requesting Gmail's restricted scope may need Google verification.
