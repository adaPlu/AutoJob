# Job Site Pre-Login — v1.5.1

## Start here

1. Extract the complete ZIP into its own folder. Keep the existing dedicated Chrome profile (`%LOCALAPPDATA%\JobApplicationAutomator\ChromeProfile`) — do not clear cookies.
2. Run `START_CHROME.bat`, install/sign into Simplify Copilot in **this** Chrome profile, and leave Chrome running.
3. Double-click `PRELOGIN_JOB_SITES.bat` for a login-only check, or `RUN_AUTOMATOR.bat` to complete pre-login **then** start searching/applying.
4. The program opens account-based sites, including LinkedIn, Indeed, Simplify, Handshake, Dice, Wellfound, ZipRecruiter, Glassdoor, and other configured boards.
5. In the Chrome tabs, manually finish sign-in, SSO, one-time codes, and security challenges. Return to the terminal, type `READY` and press Enter when finished, or type `CANCEL` to stop before searching.
6. The program rechecks visible login indicators, records results in `data/prelogin-status.json`, and skips any source still visibly requiring login. It does **not** mistake an unknown session for a guaranteed valid login.
7. Run `VIEW_RESULTS.bat` to see submission outcomes; only a real ATS confirmation or employer receipt can establish submission.

## Important limitations

- **No credentials are stored in the ZIP**, and the program does not type passwords or bypass verification challenges. Login cookies remain only in your locally managed Chrome profile.
- Greenhouse, Lever, Ashby, Workday, SmartRecruiters, iCIMS, and company career portals often create accounts **per employer**. There is no universal login to preauthenticate every future employer before their postings are discovered. The application handler still handles their sign-in interruptions.
- Public sources such as Jobicy and Remotive require no account just to fetch listings.
- `data/prelogin-status.json` reports **likely authenticated**, **login required**, or **automatic search enabled (sign-in unverified)**; it never certifies accounts when the site's UI does not expose reliable signals.
- The program will not claim successful submission merely because a user signed in, Simplify autofilled, or a Submit button was clicked.

## Configuration

`config.json` → `preLogin.enabled=true`, `requireAllAccountSessions=false`, `skipUnavailableSources=true`, `openConcurrency=3`. Setting `requireAllAccountSessions=true` stops the run if any checked account site remains visibly logged out. Set `enabled=false` only if you deliberately want to bypass the sign-in stage.

## Status meanings in v1.5.1

- `AUTO-ENABLED (sign-in unverified)`: Search and application automation WILL run for this source after READY. The checker cannot prove the login session; attempts may still encounter sign-in prompts.
- `AUTO-ENABLED (sign-in likely active)`: A logout control was visible; automated searching is permitted.
- `PAUSED`: The site visibly requires login, CAPTCHA, or could not be loaded. Finish the login/challenge in Chrome, then run the one-click launcher again.
- `VIEW_RESULTS.bat`: Shows actual per-site search and application attempt counts. An enabled source can have 0 attempts if it yields no valid matching jobs.
