@echo off
setlocal
cd /d "%~dp0"
title MACTORY FATCH Launcher
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed or is not on PATH.
  echo Install Node.js 20 or newer from https://nodejs.org/en/download
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)

powershell -NoProfile -Command "if (Test-NetConnection -ComputerName 127.0.0.1 -Port 8000 -InformationLevel Quiet) { exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 (
  echo Starting MACTORY FATCH on http://127.0.0.1:8000 ...
  start "MACTORY FATCH Server" /min cmd /k "cd /d ""%~dp0"" && node server.js"
  timeout /t 3 /nobreak >nul
)

start "" "http://127.0.0.1:8000"
echo If the website did not open, check that the server window shows no error.
echo You can close this window now. Keep the server window running while using the site.
exit /b 0
