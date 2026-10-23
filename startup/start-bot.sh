#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
if [[ $# -gt 1 || ( $# -eq 1 && "$1" != --ai-only ) ]]; then
  echo 'Usage: bash startup/start-bot.sh [--ai-only]' >&2; exit 1
fi
python_venv="$PROJECT_ROOT/ai-service/.venv/bin/python"
if [[ ! -x "$python_venv" ]]; then echo 'Run bash startup/setup.sh first.' >&2; exit 1; fi
if [[ "${1:-}" != --ai-only ]]; then
  check_node
  (cd "$PROJECT_ROOT/discord-bot"; npm run check:native; npm run build)
fi
exec "$python_venv" "$PROJECT_ROOT/startup/runtime.py" start "$@"
