@echo off
cd /d "%~dp0backend"
echo Starting Quiz Hero FastAPI Backend on http://127.0.0.1:8000 ...

if exist ".\.venv\Scripts\python.exe" (
    ".\.venv\Scripts\python.exe" -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
) else if exist ".\venv\Scripts\python.exe" (
    ".\venv\Scripts\python.exe" -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
) else (
    python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
)
pause
