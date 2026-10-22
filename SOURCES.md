# Discovery source configuration

The example configuration contains 27 source IDs. Two are public structured remote-job feeds (`jobicy`, `remotive`), and the remainder represent job boards, employer career pages and applicant-tracking platforms.

Site/ATS source types include LinkedIn, Simplify, Indeed, Dice, Wellfound, Built In, ZipRecruiter, Glassdoor, Monster, CareerBuilder, Handshake, USAJOBS, Jobright, Welcome to the Jungle, Remote OK, We Work Remotely, Remote.co, Y Combinator Jobs, Greenhouse, Lever, Ashby, Workday, SmartRecruiters, iCIMS and company career pages.

Not all source types support native search or permanent sessions. Some rely on external site-limited discovery, can return zero results, or pause on a security challenge. The source count is not a guarantee that 27 sites are successfully accessed every run.

The default `config.example.json` enables `autoSubmit: true`; inspect your own answers and test with `--dry-run` before using live submission. Applications may be blocked by unanswered legally meaningful questions. See [README](README.md) for setup and verification.
