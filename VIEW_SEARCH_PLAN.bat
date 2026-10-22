@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (echo Node.js missing.& pause& exit /b 1)
node src\index.js --plan-summary
pause
