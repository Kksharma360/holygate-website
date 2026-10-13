@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required. Install Node.js from https://nodejs.org/ and reopen this file.
  pause
  exit /b 1
)
start "HOLYGATE Server" /D "%~dp0" cmd /k node server.js
timeout /t 2 /nobreak >nul
start "" http://localhost:3000
endlocal
