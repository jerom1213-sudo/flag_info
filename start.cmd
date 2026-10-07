@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Run setup.cmd first.
  pause
  exit /b 1
)
set "EVENT_PYTHON=%~dp0.venv\Scripts\python.exe"
node scripts/doctor.js
if errorlevel 1 (
  pause
  exit /b 1
)
if not defined PORT set "PORT=4174"
echo Open http://localhost:%PORT%/events in your browser.
node event-server.js
pause
