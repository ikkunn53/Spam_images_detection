#!/usr/bin/env bash
# Stop the AI service and Discord Bot managed by start.sh.
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$project_root/startup/stop-bot.sh" "$@"
