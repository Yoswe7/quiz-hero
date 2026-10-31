Set-Location "$PSScriptRoot\backend"
Write-Host "Starting Quiz Hero Backend on http://127.0.0.1:8000 ..." -ForegroundColor Green

if (Test-Path ".\.venv\Scripts\python.exe") {
    & ".\.venv\Scripts\python.exe" -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
} elseif (Test-Path ".\venv\Scripts\python.exe") {
    & ".\venv\Scripts\python.exe" -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
} else {
    python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
}
