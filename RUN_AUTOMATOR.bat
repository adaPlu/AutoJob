@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if errorlevel 1 (
  echo ERROR: Could not enter the program directory: %~dp0
  pause
  exit /b 1
)
title Job Application Automator v1.5.1
echo.
echo ========== JOB APPLICATION AUTOMATOR v1.5.1 ==========
echo Folder: %CD%
echo ======================================================
echo.
if not exist "config.json" (
  echo ERROR: Missing config.json in this directory.
  echo Use EDIT_PROFILE.bat to generate config/profile files.
  goto :failed
)
if not exist "profile.json" (
  echo ERROR: Missing profile.json in this directory.
  echo Use EDIT_PROFILE.bat to generate config/profile files.
  goto :failed
)
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not on PATH.
  echo Install Node.js LTS, close this window and run again.
  goto :failed
)
echo.
echo Checking exact bundled configuration and resume...
node src\index.js --preflight
if errorlevel 1 (
  echo ERROR: Preflight failed. See errors above; use CHECK_SETUP.bat to test again.
  goto :failed
)
if not exist "node_modules\playwright-core\package.json" (
  echo Installing required Node.js dependency...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo ERROR: npm install failed. Check internet access and Node.js installation.
    goto :failed
  )
)
echo.
echo Preflight passed. Account sign-in stage runs FIRST, then up to 500 browser searches and 200 application attempts.
echo Using Simplify Copilot first when its in-page Autofill button is visible.
echo Native fallback fills remaining supported fields.
echo FIRST: opening job sites for manual sign-in and account checks.
echo Type READY in the terminal after completing logins.
echo THEN: discovering jobs and attempting applications...
echo To stop, press Ctrl+C. Confirm every real submission separately.
echo.
node src\index.js
set "EXITCODE=%ERRORLEVEL%"
echo.
echo Run finished. Exit code: %EXITCODE%
echo Review data\application-log.csv and outbox\last-run-summary.json
echo.
node src\report.js
pause
exit /b %EXITCODE%
:failed
echo.
echo Launch failed. No application run was started.
pause
exit /b 1
