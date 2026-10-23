#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
if [[ "$(uname -s)" != Linux ]]; then echo 'This script requires Linux.' >&2; exit 1; fi
if [[ $# -gt 1 || ( $# -eq 1 && "$1" != --node-only ) ]]; then
  echo 'Usage: bash startup/install-system.sh [--node-only]' >&2; exit 1
fi
if [[ "${1:-}" != --node-only ]]; then
  if ! command -v apt-get >/dev/null; then
    echo 'Automatic system setup supports Ubuntu/Debian. Install curl, CA certificates, tar, xz, a C++ toolchain and Python 3.11/3.12 with venv manually on other distributions.' >&2
    exit 1
  fi
  privilege=()
  if [[ $EUID -ne 0 ]]; then
    command -v sudo >/dev/null || { echo 'sudo or root is required to install system packages.' >&2; exit 1; }
    privilege=(sudo)
  fi
  "${privilege[@]}" apt-get update
  "${privilege[@]}" apt-get install -y ca-certificates curl git xz-utils build-essential python3 python3-venv python3-dev
  python3 -c 'import sys; assert (3,11) <= sys.version_info[:2] <= (3,12), "Python 3.11 or 3.12 required; use Ubuntu 24.04 or Debian 12, or set PYTHON_BIN for setup.sh"'
fi
# Install Node without replacing the machine's system Node installation.
case "$(uname -m)" in
  x86_64) node_arch=x64 ;;
  aarch64|arm64) node_arch=arm64 ;;
  *) echo 'Automatic Node installation supports x86_64 and aarch64.' >&2; exit 1 ;;
esac
node_version=22.23.4
archive="node-v${node_version}-linux-${node_arch}.tar.xz"
mkdir -p "$PROJECT_ROOT/.tools"
work="$(mktemp -d "$PROJECT_ROOT/.tools/node-download.XXXXXX")"
trap 'rm -rf -- "$work"' EXIT
curl --fail --location --retry 3 "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt" -o "$work/SHASUMS256.txt"
curl --fail --location --retry 3 "https://nodejs.org/dist/v${node_version}/$archive" -o "$work/$archive"
(cd "$work"; awk -v file="$archive" '$2 == file { print; found=1 } END { if (!found) exit 1 }' SHASUMS256.txt > CHECKSUM; sha256sum -c CHECKSUM)
tar -xJf "$work/$archive" -C "$work"
if [[ -e "$PROJECT_ROOT/.tools/node" ]]; then
  echo '.tools/node already exists; preserving it. Its Node version is:'
  "$PROJECT_ROOT/.tools/node/bin/node" --version
else
  mv -- "$work/node-v${node_version}-linux-${node_arch}" "$PROJECT_ROOT/.tools/node"
fi
echo 'System setup complete. Next: bash startup/setup.sh (as your normal user).'
