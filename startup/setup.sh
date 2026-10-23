#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
if [[ $# -gt 1 || ( $# -eq 1 && "$1" != --skip-model-download ) ]]; then
  echo 'Usage: bash startup/setup.sh [--skip-model-download]' >&2; exit 1
fi
check_node
python_command="${PYTHON_BIN:-python3}"
"$python_command" -c 'import sys; assert (3,11) <= sys.version_info[:2] <= (3,12), "Python 3.11 or 3.12 is required by the pinned PyTorch version"'
mkdir -p "$PROJECT_ROOT/data" "$PROJECT_ROOT/.tools"
for service in discord-bot ai-service; do
  if [[ ! -e "$PROJECT_ROOT/$service/.env" ]]; then
    (umask 077; cp -- "$PROJECT_ROOT/$service/.env.example" "$PROJECT_ROOT/$service/.env")
  fi
done
if [[ -e "$PROJECT_ROOT/ai-service/.venv" && ! -x "$PROJECT_ROOT/ai-service/.venv/bin/python" ]]; then
  echo 'ai-service/.venv is not a Linux virtualenv. Move the old virtualenv aside and run setup again. Do not copy Windows .venv or node_modules to Linux.' >&2
  exit 1
fi
if [[ ! -x "$PROJECT_ROOT/ai-service/.venv/bin/python" ]]; then
  "$python_command" -m venv "$PROJECT_ROOT/ai-service/.venv"
fi
python_venv="$PROJECT_ROOT/ai-service/.venv/bin/python"
"$python_venv" -c 'import sys; assert (3,11) <= sys.version_info[:2] <= (3,12), "Existing virtualenv must use Python 3.11 or 3.12"'
# Avoid downloading CUDA libraries for the default CPU development workflow.
if [[ "$(uname -m)" == x86_64 ]]; then
  "$python_venv" -m pip install --index-url https://download.pytorch.org/whl/cpu 'torch==2.3.1'
fi
"$python_venv" -m pip install -r "$PROJECT_ROOT/ai-service/requirements.txt"
(cd "$PROJECT_ROOT/discord-bot"; if [[ -f package-lock.json ]]; then npm ci; else npm install --package-lock=false; fi; npm run check:native; npm run build)
if [[ "${1:-}" != --skip-model-download ]]; then
  (cd "$PROJECT_ROOT/ai-service"; "$python_venv" - <<'PY'
import asyncio, math
from PIL import Image
from app.services.image_features import embedding
vector = asyncio.run(embedding(Image.new('RGB', (64, 64), 'blue')))
assert vector and all(map(math.isfinite, vector))
print('DINOv2 download and CPU inference: OK')
PY
  )
fi
echo 'Setup complete. Edit discord-bot/.env: DISCORD_TOKEN and CLIENT_ID.'
echo 'If using ADMIN_WEB_TOKEN, set the same value in both service .env files.'
echo 'Start: bash startup/start-bot.sh'
