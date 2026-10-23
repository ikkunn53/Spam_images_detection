#!/usr/bin/env bash
# Shared paths; never source application .env files as shell scripts.
PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export HF_HOME="${HF_HOME:-$PROJECT_ROOT/.hf-cache}"
export OMP_NUM_THREADS="${OMP_NUM_THREADS:-2}"
export npm_config_cache="${npm_config_cache:-$PROJECT_ROOT/.tools/npm-cache}"
export PIP_CACHE_DIR="${PIP_CACHE_DIR:-$PROJECT_ROOT/.tools/pip-cache}"
if [[ -x "$PROJECT_ROOT/.tools/node/bin/node" ]]; then
  export PATH="$PROJECT_ROOT/.tools/node/bin:$PATH"
fi

check_node() {
  command -v node >/dev/null && command -v npm >/dev/null || {
    echo 'Node.js is missing. Run bash startup/install-system.sh first.' >&2; return 1;
  }
  node -e 'if (![22,24].includes(Number(process.versions.node.split(".")[0]))) process.exit(1)' || {
    echo 'Use Node.js 22 or 24. Run bash startup/install-system.sh to install Node.js 22 locally.' >&2; return 1;
  }
}
