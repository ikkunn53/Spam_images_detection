@echo off
setlocal EnableExtensions

REM Discord Image Spam Detection Bot - initial Windows setup
REM Run this once before using startup\start-bot.bat.

cd /d "%~dp0\.."

echo [1/6] Checking required commands...
where node >nul 2>nul || (
  echo ERROR: Node.js 20+ is required. Install it from https://nodejs.org/
  exit /b 1
)
where npm >nul 2>nul || (
  echo ERROR: npm is required. Install Node.js 20+ first.
  exit /b 1
)
where python >nul 2>nul || (
  echo ERROR: Python 3.11+ is required. Install it from https://www.python.org/
  exit /b 1
)

if not exist data mkdir data

if not exist discord-bot\.env (
  echo [2/6] Creating discord-bot\.env from example...
  copy discord-bot\.env.example discord-bot\.env >nul
) else (
  echo [2/6] discord-bot\.env already exists. Skipping.
)

if not exist ai-service\.env (
  echo [3/6] Creating ai-service\.env from example...
  copy ai-service\.env.example ai-service\.env >nul
) else (
  echo [3/6] ai-service\.env already exists. Skipping.
)

echo [4/6] Installing Discord Bot dependencies...
pushd discord-bot
call npm install
if errorlevel 1 (
  popd
  echo ERROR: npm install failed.
  exit /b 1
)
call npm run build
if errorlevel 1 (
  popd
  echo ERROR: npm run build failed.
  exit /b 1
)
popd

echo [5/6] Creating Python virtual environment...
pushd ai-service
if not exist .venv (
  python -m venv .venv
  if errorlevel 1 (
    popd
    echo ERROR: Failed to create Python virtual environment.
    exit /b 1
  )
)
call .venv\Scripts\python.exe -m pip install --upgrade pip
if errorlevel 1 (
  popd
  echo ERROR: pip upgrade failed.
  exit /b 1
)
call .venv\Scripts\pip.exe install -r requirements.txt
if errorlevel 1 (
  popd
  echo ERROR: pip install failed.
  exit /b 1
)
popd

echo [6/6] Setup complete.
echo.
echo IMPORTANT: Edit discord-bot\.env and set DISCORD_TOKEN, CLIENT_ID, and optional GUILD_ID.
echo Then run startup\start-bot.bat to start the AI service and Discord Bot.
endlocal
