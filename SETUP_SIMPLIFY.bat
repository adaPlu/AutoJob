@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo.
echo ===== SIMPLIFY COPILOT SETUP =====
echo 1. Install Simplify Copilot in the SAME dedicated Chrome profile as the automator.
echo 2. Sign in, fill in your Simplify profile and choose a default resume.
echo 3. Set "Continuously autofill multipage forms" to OFF:
echo    the automator handles Next and final Submit itself.
echo 4. Verify the teal in-page Simplify tab appears on supported applications.
echo.
call "%~dp0START_CHROME.bat"
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
set "JOB_CHROME_PROFILE=%LOCALAPPDATA%\JobApplicationAutomator\ChromeProfile"
if not defined LOCALAPPDATA set "JOB_CHROME_PROFILE=%CD%\chrome-job-profile"
if not defined CHROME (
  echo Chrome executable not found. Open the installation URL in your automator Chrome manually.
  pause
  exit /b 1
)
start "" "%CHROME%" "--user-data-dir=%JOB_CHROME_PROFILE%" "https://chromewebstore.google.com/search/Simplify%%20Copilot"
start "" "%CHROME%" "--user-data-dir=%JOB_CHROME_PROFILE%" "https://help.simplify.jobs/articles/8686025-manage-autofill-settings-in-the-simplify-extension"
echo.
echo Complete setup in the dedicated Chrome window, then launch RUN_AUTOMATOR.bat.
pause
