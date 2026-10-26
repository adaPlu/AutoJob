@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where git >nul 2>nul || (echo Install Git for Windows & pause & exit /b 1)
where gh >nul 2>nul || (echo Install GitHub CLI & pause & exit /b 1)
gh auth status >nul 2>nul || (echo GitHub login needed: gh auth login & pause & exit /b 1)
if not exist .git (echo Repository not initialized. Run PUBLISH_TO_GITHUB.bat first. & pause & exit /b 1)
rem Commit code and docs only; never push applicant profile, config, resumes or local evidence.
where node >nul 2>nul || (echo Install Node.js to run the privacy audit & pause & exit /b 1)
git add -A
node scripts\audit-public.js
if errorlevel 1 goto :private
for /f "usebackq delims=" %%F in (`git diff --cached --name-only`) do (
  if /i "%%F"=="config.json" goto :private
  if /i "%%F"=="profile.json" goto :private
  echo(%%F|findstr /R /I /C:"\.pdf$" /C:"\.docx$" /C:"^data/" /C:"^outbox/" /C:"node_modules/" >nul
  if not errorlevel 1 goto :private
)
git diff --cached --quiet
if errorlevel 1 git commit -m "Update AutoJob"
git push -u origin HEAD
if errorlevel 1 (echo Push failed. & pause & exit /b 1)
echo Published current code to https://github.com/adaPlu/AutoJob
pause
exit /b 0
:private
echo ERROR: Private file staged; refusing to push. Review git status.
pause
exit /b 1
