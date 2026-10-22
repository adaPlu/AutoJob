@echo off
setlocal
cd /d "%~dp0"
node src\gmail-cli.js verify
node src\report.js
pause
