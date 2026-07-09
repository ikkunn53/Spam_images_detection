@echo off
setlocal EnableExtensions

REM Registers Discord slash commands for this bot.
REM Run this after editing discord-bot\.env with DISCORD_TOKEN and CLIENT_ID.

cd /d "%~dp0\.."
set "PROJECT_ROOT=%CD%"

if not exist "%PROJECT_ROOT%\discord-bot\.env" (
  echo ERROR: discord-bot\.env does not exist. Run startup\setup.bat first, then set DISCORD_TOKEN and CLIENT_ID.
  exit /b 1
)

pushd "%PROJECT_ROOT%\discord-bot"
call npm run deploy:commands
if errorlevel 1 (
  popd
  echo ERROR: Slash command deployment failed.
  echo Check DISCORD_TOKEN, CLIENT_ID, optional GUILD_ID, and that the bot was invited with the applications.commands scope.
  exit /b 1
)
popd

echo Slash commands deployed.
echo If GUILD_ID is empty, global commands can take time to appear. For immediate testing, set GUILD_ID to your server ID and run this file again.
endlocal
