@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if errorlevel 1 goto :failed

title Job Application Automator - ONE CLICK
echo.
echo ==================================================
echo  ONE CLICK JOB AUTOMATOR - ALL STEPS IN ONE WINDOW
 echo ==================================================
echo.
echo Step 1/5: Check Node.js, applicant profile, resume and dependencies.
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js not installed. Install Node.js LTS and retry.
  goto :failed
)
if not exist "config.json" (copy /y "config.example.json" "config.json" >nul & echo Created config.json from example.)
if not exist "profile.json" (copy /y "profile.example.json" "profile.json" >nul & echo Created profile.json from example.)
if not exist "resume.pdf" (echo NOTE: Put your own resume.pdf here or change resumePath in config.json.)
if not exist "node_modules\playwright-core\package.json" (
  echo Installing browser dependency...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :failed
)
node src\index.js --preflight
if errorlevel 1 (
  echo FIRST-TIME SETUP: Open EDIT_PROFILE.bat, complete all required fields, and put your resume.pdf here.
  goto :failed
)

echo.
echo Step 2/5: Start dedicated Chrome profile if needed.
node scripts\wait-chrome.js --probe >nul 2>nul
if errorlevel 1 (
  call "%~dp0START_CHROME.bat"
  if errorlevel 1 goto :failed
)
echo.
echo Waiting for Chrome automation connection...
node scripts\wait-chrome.js
if errorlevel 1 goto :failed

echo.
echo Step 3/5: Open all job accounts, verify sign-ins, then search and apply.
echo IMPORTANT: Sign into websites and Simplify in Chrome when requested.
echo Type READY once after signing in. AUTO-ENABLED sites run automatically even when sign-in cannot be verified.
echo Passwords, one-time codes, and CAPTCHAs are always completed in Chrome, not this terminal.
echo.
node src\index.js
set "RUN_RESULT=%ERRORLEVEL%"

echo.
echo Step 4/5: Generate verified application results.
node src\report.js

echo.
echo Step 5/5: Generate applications needing review.
node src\review.js

echo.
echo ==================================================
echo  RUN COMPLETE - EXIT CODE %RUN_RESULT%
echo  Check data\application-log.csv and outbox\review-needed.csv
 echo  Browser button clicks are NOT proof of employer acceptance.
echo ==================================================
echo.
pause
exit /b %RUN_RESULT%

:failed
echo.
echo ERROR: Startup failed, no new job-search run was started.
echo See the preceding message for the failed check.
pause
exit /b 1
