@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (echo Install Node.js LTS first. & pause & exit /b 1)
if not exist gmail-credentials.json (
  echo ERROR: gmail-credentials.json missing.
  echo Download an OAuth Desktop application JSON from Google Cloud and rename it gmail-credentials.json.
  echo See README.md - Gmail setup. No Gmail password is needed.
  pause
  exit /b 1
)
node src\gmail-cli.js connect
pause
