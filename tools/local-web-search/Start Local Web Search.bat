@echo off
setlocal
cd /d "%~dp0"

set PYTHON_CMD=

where py >nul 2>nul
if not errorlevel 1 (
  py -3.12 -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 12) else 1)" >nul 2>nul
  if not errorlevel 1 set PYTHON_CMD=py -3.12

  if "%PYTHON_CMD%"=="" (
    py -3.13 -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 13) else 1)" >nul 2>nul
    if not errorlevel 1 set PYTHON_CMD=py -3.13
  )

  if "%PYTHON_CMD%"=="" (
    py -3.11 -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 11) else 1)" >nul 2>nul
    if not errorlevel 1 set PYTHON_CMD=py -3.11
  )

  if "%PYTHON_CMD%"=="" (
    py -3.10 -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 10) else 1)" >nul 2>nul
    if not errorlevel 1 set PYTHON_CMD=py -3.10
  )
)

if "%PYTHON_CMD%"=="" (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python was not found. Install Python 3.12, then run this file again.
    pause
    exit /b 1
  )
  set PYTHON_CMD=python
)

%PYTHON_CMD% scripts\run_local_web_search.py
set EXIT_CODE=%ERRORLEVEL%

echo.
if not "%EXIT_CODE%"=="0" (
  echo Local web search stopped with exit code %EXIT_CODE%.
)
pause
exit /b %EXIT_CODE%
