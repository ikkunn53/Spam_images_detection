#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
mode=start-background
ai_only=()
for option in "$@"; do
  case "$option" in
    --ai-only) ai_only=(--ai-only) ;;
    --foreground) mode=start ;;
    *) echo 'Usage: bash startup/start-bot.sh [--ai-only] [--foreground]' >&2; exit 1 ;;
  esac
done
python_venv="$PROJECT_ROOT/ai-service/.venv/bin/python"
if [[ ! -x "$python_venv" ]]; then echo 'Run bash startup/setup.sh first.' >&2; exit 1; fi
if [[ ${#ai_only[@]} -eq 0 ]]; then
  check_node
  (cd "$PROJECT_ROOT/discord-bot"; npm run check:native; npm run build)
fi
exec "$python_venv" "$PROJECT_ROOT/startup/runtime.py" "$mode" "${ai_only[@]}"
