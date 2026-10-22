@echo off
if not exist "%~dp0profile.json" copy "%~dp0profile.example.json" "%~dp0profile.json" >nul
if not exist "%~dp0config.json" copy "%~dp0config.example.json" "%~dp0config.json" >nul
notepad "%~dp0profile.json"
notepad "%~dp0config.json"
