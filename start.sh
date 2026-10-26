#!/usr/bin/env bash
# Start the AI service and Discord Bot in the background.
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$project_root/startup/start-bot.sh" "$@"
