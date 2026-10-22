@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if errorlevel 1 (
  echo ERROR: Cannot open program folder.
  pause
  exit /b 1
)
echo.
echo Checking Job Application Automator v1.5.1
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is missing. Install the current Node.js LTS release.
  pause
  exit /b 1
)
node src\index.js --preflight
if errorlevel 1 goto :failed
echo.
echo Setup passed. Run START_ALL.bat.
pause
exit /b 0
:failed
echo Setup failed. No applications were submitted.
pause
exit /b 1
