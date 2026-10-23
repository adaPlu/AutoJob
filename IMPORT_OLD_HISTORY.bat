@echo off
setlocal
cd /d "%~dp0"
if "%~1"=="" (
  echo Drag the previous v1.4.1 automator folder onto this .bat file.
  echo This prevents accidental duplicate applications after upgrading.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (echo Node.js not found.& pause& exit /b 1)
node src\import-history.js "%~1"
pause
