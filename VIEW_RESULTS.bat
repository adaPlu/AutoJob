@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (echo Node.js not found.& pause& exit /b 1)
node src\report.js
pause
