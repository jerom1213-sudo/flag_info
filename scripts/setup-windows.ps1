$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 20 or newer from https://nodejs.org/ and reopen this window.' }
if (([int]((node --version).TrimStart('v').Split('.')[0])) -lt 20) { throw 'Node.js 20 or newer is required.' }
if (-not (Test-Path -LiteralPath '.venv\Scripts\python.exe')) {
  if (Get-Command py -ErrorAction SilentlyContinue) { & py -3 -m venv .venv }
  elseif (Get-Command python -ErrorAction SilentlyContinue) { & python -m venv .venv }
  else { throw 'Install Python 3.10 or newer from https://www.python.org/ (enable Add Python to PATH).' }
  if ($LASTEXITCODE -ne 0) { throw 'Python virtual environment creation failed.' }
}
& '.\.venv\Scripts\python.exe' -m ensurepip --upgrade
if ($LASTEXITCODE -ne 0) { throw 'Python pip setup failed. Reinstall Python with pip enabled.' }
& '.\.venv\Scripts\python.exe' -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'PDF dependency installation failed. Check your Internet connection.' }
& node scripts/doctor.js
if ($LASTEXITCODE -ne 0) { throw 'Environment check failed.' }
Write-Host 'Setup complete. Double-click start.cmd, then open http://localhost:4174/events'
