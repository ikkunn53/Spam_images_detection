@echo off
setlocal EnableExtensions

REM Discord Image Spam Detection Bot - daily startup script
REM Starts the local AI Service and Discord Bot in separate windows.

cd /d "%~dp0\.."
set "PROJECT_ROOT=%CD%"
set "NEED_SETUP=0"

if not exist "%PROJECT_ROOT%\discord-bot\.env" set "NEED_SETUP=1"
if not exist "%PROJECT_ROOT%\ai-service\.env" set "NEED_SETUP=1"
if not exist "%PROJECT_ROOT%\ai-service\.venv\Scripts\python.exe" set "NEED_SETUP=1"

if "%NEED_SETUP%" == "1" (
  echo Required setup files are missing. Running startup\setup.bat now...
  call "%PROJECT_ROOT%\startup\setup.bat"
  if errorlevel 1 (
    echo ERROR: startup\setup.bat failed. Fix the setup error above and run this file again.
    exit /b 1
  )
)

if not exist "%PROJECT_ROOT%\discord-bot\.env" (
  echo ERROR: discord-bot\.env still does not exist after setup.
  exit /b 1
)
if not exist "%PROJECT_ROOT%\ai-service\.env" (
  echo ERROR: ai-service\.env still does not exist after setup.
  exit /b 1
)
if not exist "%PROJECT_ROOT%\ai-service\.venv\Scripts\python.exe" (
  echo ERROR: ai-service virtual environment still does not exist after setup.
  exit /b 1
)
if not exist "%PROJECT_ROOT%\discord-bot\dist\index.js" (
  echo Discord Bot build output was not found. Building now...
  pushd "%PROJECT_ROOT%\discord-bot"
  call npm run build
  if errorlevel 1 (
    popd
    echo ERROR: npm run build failed.
    exit /b 1
  )
  popd
)

if not exist "%PROJECT_ROOT%\data" mkdir "%PROJECT_ROOT%\data"

echo Starting AI Service...
start "Image Spam AI Service" /D "%PROJECT_ROOT%\ai-service" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

echo Waiting for AI Service health check...
set "AI_READY=0"
for /L %%I in (1,1,30) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8000/health' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 (
    set "AI_READY=1"
    goto :ai_ready
  )
  timeout /t 2 /nobreak >nul
)

:ai_ready
if not "%AI_READY%" == "1" (
  echo ERROR: AI Service did not become healthy within 60 seconds.
  echo Check the "Image Spam AI Service" window for details.
  exit /b 1
)

echo Starting Discord Bot...
start "Discord Image Spam Bot" /D "%PROJECT_ROOT%\discord-bot" cmd /k "npm start"

echo.
echo Startup commands have been launched in separate windows.
echo Keep both windows open while using the Bot.
endlocal
