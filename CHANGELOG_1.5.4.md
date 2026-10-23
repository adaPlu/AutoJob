# AutoJob v1.5.4 — Public release maintenance

- Audited the tracked repository sources for common credential patterns, private keys and applicant-specific files. No credentials or private applicant data files identified in the inspected tracked source; audit is best-effort and does not guarantee no historical exposure.
- Removed a hardcoded personal contact email from `PUBLISH_TO_GITHUB.bat`, using the project's GitHub no-reply commit address instead. Earlier commits may retain the old value; the latest commit does not erase Git history.
- Published the MIT open-source license at [LICENSE](LICENSE), set package metadata to `MIT`, and added SPDX license identifiers to JavaScript modules and tests.
- Documented all 27 configured discovery sources and their search mechanisms, in configuration order, and clarified site/automation limitations.
- Kept the existing 100 browser-search and 200 application-attempt limits and Gmail email-receipt verification unchanged.
