# v1.5.2 — Inactivity watchdog and documentation

- Added a five-minute (`300000ms`) inactivity watchdog for each feed request, site search and individual application attempt.
- The watchdog can reset after completed progress milestones, abort stalled items, close affected tabs and continue to the next job/site.
- If an in-flight final submit may have occurred, the ledger keeps an uncertain outcome instead of silently retrying the job.
- A nonresponsive Chrome search tab triggers tab recovery; unrecoverable browser failure ends the run with a summary.
- Added watchdog unit tests, report/review support and a fully documented README and architecture guide.
- Preserved the public-safe packaging and 500-search / 200-application-attempt defaults.
