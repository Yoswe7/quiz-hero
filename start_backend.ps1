Set-Location "$PSScriptRoot\backend"
Write-Host "Starting Quiz Hero Backend on http://127.0.0.1:8000 ..." -ForegroundColor Green
& ".\.venv\Scripts\python.exe" -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
