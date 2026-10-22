@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (echo ERROR: Node.js is not installed.& pause& exit /b 1)
node src\review.js
if exist "outbox\review-needed.csv" start "" "outbox\review-needed.csv"
pause
