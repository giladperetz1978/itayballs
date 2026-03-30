@echo off
setlocal

cd /d "%~dp0"

echo ==============================================
echo   ItayBalls Desktop Launcher
echo ==============================================
echo.

if not exist ".venv\Scripts\python.exe" (
  echo [1/4] Creating local virtual environment...
  where py >nul 2>&1
  if %errorlevel%==0 (
    py -3 -m venv .venv
  ) else (
    where python >nul 2>&1
    if %errorlevel%==0 (
      python -m venv .venv
    )
  )
)

if not exist ".venv\Scripts\python.exe" (
  echo.
  echo ERROR: Python was not found.
  echo Please install Python 3.10+ and run this file again.
  pause
  exit /b 1
)

echo [2/5] Checking pip in local env...
call ".venv\Scripts\python.exe" -m pip --version >nul 2>&1
if errorlevel 1 (
  echo pip is missing in .venv. Bootstrapping with ensurepip...
  call ".venv\Scripts\python.exe" -m ensurepip --upgrade
)

call ".venv\Scripts\python.exe" -m pip --version >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: Could not initialize pip inside .venv.
  echo Try deleting the .venv folder and run this launcher again.
  pause
  exit /b 1
)

echo [3/5] Upgrading pip (local env)...
call ".venv\Scripts\python.exe" -m pip install --disable-pip-version-check --upgrade pip
if errorlevel 1 (
  echo.
  echo ERROR: pip upgrade failed.
  pause
  exit /b 1
)

echo [4/5] Installing desktop dependencies...
call ".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r desktop_requirements.txt
if errorlevel 1 (
  echo.
  echo ERROR: Dependency installation failed.
  pause
  exit /b 1
)

echo [5/5] Launching desktop app...
call ".venv\Scripts\python.exe" desktop_app.py

if errorlevel 1 (
  echo.
  echo The app exited with an error.
  pause
  exit /b 1
)

endlocal
