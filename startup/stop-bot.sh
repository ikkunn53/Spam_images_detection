#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
exec "$PROJECT_ROOT/ai-service/.venv/bin/python" "$PROJECT_ROOT/startup/runtime.py" stop
