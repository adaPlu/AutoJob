@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
set "TARGET=adaPlu/AutoJob"
set "ORIGIN=https://github.com/adaPlu/AutoJob.git"
echo.
echo ============================================
echo  AutoJob: Create PUBLIC GitHub repo and push
echo  Target: %TARGET%
echo ============================================
echo.
where git >nul 2>nul
if errorlevel 1 (echo ERROR: Install Git for Windows: https://git-scm.com/download/win & goto :failed)
where gh >nul 2>nul
if errorlevel 1 (echo ERROR: Install GitHub CLI: https://cli.github.com/ & goto :failed)
gh auth status >nul 2>nul
if errorlevel 1 (
  echo GitHub CLI not authenticated. Follow the login instructions:
  gh auth login
  if errorlevel 1 goto :failed
)
set "GHLOGIN="
for /f "delims=" %%i in ('gh api user --jq .login 2^>nul') do set "GHLOGIN=%%i"
if /i not "!GHLOGIN!"=="adaPlu" (
  echo ERROR: gh is authenticated as !GHLOGIN!, not adaPlu. Switch GitHub account first.
  goto :failed
)
gh auth setup-git >nul 2>nul
if not exist "README.md" (echo ERROR: README.md missing. & goto :failed)
if not exist ".gitignore" (echo ERROR: .gitignore missing. & goto :failed)
if not exist ".git" (
  git init
  if errorlevel 1 goto :failed
)
git branch -M main
if errorlevel 1 goto :failed
rem Use this account's GitHub no-reply address locally: real applicant email need not appear in commits.
git config user.name "adaPlu"
git config user.email "70963681+adaPlu@users.noreply.github.com"
git add -A
if errorlevel 1 goto :failed
rem Stop if any private files slipped through .gitignore.
for /f "usebackq delims=" %%F in (`git diff --cached --name-only`) do (
  set "FILE=%%F"
  if /i "!FILE!"=="config.json" goto :private
  if /i "!FILE!"=="profile.json" goto :private
  if /i "!FILE!"=="receipts.json" goto :private
  echo(!FILE!|findstr /R /I /C:"\.pdf$" /C:"\.docx$" /C:"\.env" /C:"^data/" /C:"^outbox/" /C:"node_modules/" /C:"ChromeProfile" >nul
  if not errorlevel 1 goto :private
)
set "HAS_STAGED="
for /f "delims=" %%S in ('git diff --cached --name-only') do set "HAS_STAGED=1"
if defined HAS_STAGED (
  git commit -m "Publish AutoJob v1.5.1 public-safe source and setup guide"
  if errorlevel 1 goto :failed
)
gh repo view "%TARGET%" >nul 2>nul
if errorlevel 1 (
  echo Creating public GitHub repository and pushing main...
  gh repo create "%TARGET%" --public --description "Windows job discovery and application automation with Simplify Copilot support"
  if errorlevel 1 goto :failed
  git remote get-url origin >nul 2>nul
  if errorlevel 1 (git remote add origin "%ORIGIN%") else (git remote set-url origin "%ORIGIN%")
  git push -u origin main
  if errorlevel 1 goto :failed
) else (
  for /f "delims=" %%p in ('gh repo view "%TARGET%" --json visibility --jq .visibility 2^>nul') do set "VIS=%%p"
  if /i not "!VIS!"=="PUBLIC" (echo ERROR: Existing %TARGET% is not PUBLIC. Not changing its visibility. & goto :failed)
  git remote get-url origin >nul 2>nul
  if errorlevel 1 (git remote add origin "%ORIGIN%") else (git remote set-url origin "%ORIGIN%")
  git push -u origin main
  if errorlevel 1 goto :failed
)
echo.
echo SUCCESS: https://github.com/adaPlu/AutoJob
echo The public repository is on main; private applicant files were not staged.
pause
exit /b 0
:private
echo ERROR: Refusing to publish because private or unsafe file was staged: !FILE!
echo Review git status and remove the file from staging before retrying.
goto :failed
:failed
echo.
echo Public GitHub publish was NOT verified. Read the error above.
pause
exit /b 1
