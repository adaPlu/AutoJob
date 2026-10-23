@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if errorlevel 1 (
  echo ERROR: Cannot open program folder.
  pause
  exit /b 1
)
title Start Chrome for Job Application Automator v1.5.1
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined CHROME (
  echo ERROR: Google Chrome is not installed in standard locations.
  pause
  exit /b 1
)
rem Stable dedicated Chrome profile across future automator versions.
set "JOB_CHROME_PROFILE=%LOCALAPPDATA%\JobApplicationAutomator\ChromeProfile"
if not defined LOCALAPPDATA set "JOB_CHROME_PROFILE=%CD%\chrome-job-profile"
echo Starting Chrome with a persistent job-app profile on port 9222...
echo Simplify must be installed IN THIS Chrome profile (regular Chrome is separate).
echo In this Chrome window, sign in to job sites and Simplify if needed.
echo Leave Chrome open while RUN_AUTOMATOR.bat runs.
start "" "%CHROME%" --remote-debugging-port=9222 "--user-data-dir=%JOB_CHROME_PROFILE%" --start-maximized
if errorlevel 1 (
  echo ERROR: Chrome did not start.
  pause
  exit /b 1
)
exit /b 0
