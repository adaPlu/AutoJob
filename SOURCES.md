# Job discovery sources — AutoJob v1.5.4

AutoJob currently configures **27 discovery sources** in `config.example.json`, in the following default order:

| # | Platform / source | Config ID | Mechanism |
|---:|---|---|---|
| 1 | Jobicy | `jobicy` | Public remote-job JSON feed |
| 2 | Remotive | `remotive` | Public remote-job JSON feed |
| 3 | LinkedIn Jobs | `linkedin` | Browser job-board search |
| 4 | Simplify Jobs | `simplify` | Browser job-board search |
| 5 | Greenhouse | `greenhouse` | Site-restricted ATS search |
| 6 | Lever | `lever` | Site-restricted ATS search |
| 7 | Ashby | `ashby` | Site-restricted ATS search |
| 8 | Direct company career pages | `companycareers` | Broad company careers search |
| 9 | Indeed | `indeed` | Browser job-board search |
| 10 | Y Combinator Jobs | `ycombinator` | Browser startup jobs search |
| 11 | Wellfound | `wellfound` | Browser startup jobs search |
| 12 | We Work Remotely | `weworkremotely` | Browser remote jobs search |
| 13 | Remote OK | `remoteok` | Site-restricted remote jobs search |
| 14 | Remote.co | `remoteco` | Site-restricted remote jobs search |
| 15 | Dice | `dice` | Browser tech jobs search |
| 16 | Built In | `builtin` | Browser tech jobs search |
| 17 | Jobright | `jobright` | Site-restricted search |
| 18 | Handshake | `handshake` | Interactive browser jobs search (login required) |
| 19 | SmartRecruiters | `smartrecruiters` | Site-restricted ATS search |
| 20 | Workday | `workday` | Site-restricted ATS search |
| 21 | USAJOBS | `usajobs` | Browser federal jobs search |
| 22 | iCIMS | `icims` | Site-restricted ATS search |
| 23 | ZipRecruiter | `ziprecruiter` | Browser job-board search |
| 24 | Glassdoor | `glassdoor` | Site-restricted search |
| 25 | Monster | `monster` | Browser job-board search |
| 26 | CareerBuilder | `careerbuilder` | Browser job-board search |
| 27 | Welcome to the Jungle (formerly Otta) | `welcometothejungle` | Site-restricted jobs search |

## Important limitations

- The **100 browser-search maximum** is a budget across the configured browser sources, not 100 searches on each individual site. It does not guarantee all 27 sources are visited in a run.
- `jobicy` and `remotive` use public JSON feeds; all others are browser/site-search discovery types. Some site-restricted searches use an external search engine rather than the site's own search interface.
- Job availability and application completion vary by site, authentication, employer tracking system, dynamic forms, CAPTCHAs and local eligibility settings.
- Account creation, logins, MFA and human-verification challenges require manual action. No official partnership with these platforms is claimed.
- An application attempt is not automatically a confirmed submission. Only a uniquely matched employer/ATS Gmail acknowledgement is counted as **email-confirmed** when Gmail verification is enabled.

The example configuration enables `autoSubmit: true`. Set this to `false` or use dry-run during setup; review factual and legal answers before live submission. See the [README](README.md).
