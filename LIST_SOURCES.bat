@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Dependencies are not installed yet. Run RUN_AUTOMATOR.bat once first.
  pause
  exit /b 1
)
npm run sources
pause
