@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if errorlevel 1 goto :failed
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Install Node.js LTS before running this program.
  goto :failed
)
if not exist "config.json" goto :failed
if not exist "node_modules\playwright-core\package.json" (
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :failed
)
echo.
echo Opening configured job account sites in your existing automator Chrome profile.
echo Run START_CHROME.bat first. Sign in manually, then type READY.
echo No job searches or applications will start from this login-only command.
echo.
node src\index.js --prelogin-only
set "RC=%ERRORLEVEL%"
echo.
echo Session check done, code %RC%. See data\prelogin-status.json
pause
exit /b %RC%
:failed
echo Setup incomplete. Extract the ZIP and install Node.js first.
pause
exit /b 1
