#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
check_node
cd "$PROJECT_ROOT/discord-bot"
exec npm run deploy:commands
