#!/usr/bin/env bash
# Copies the dashboard/ app to another local folder, excluding node_modules,
# secrets (config.json), and runtime data (history file) - the same things
# dashboard/.gitignore excludes. Safe to re-run; only touches the destination.

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <destination-folder>" >&2
  echo "Example: $0 ~/Desktop/dashboard-copy" >&2
  exit 1
fi

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/dashboard" && pwd)"
DEST_DIR="$1"

mkdir -p "$DEST_DIR"

rsync -av \
  --exclude 'node_modules/' \
  --exclude 'config.json' \
  --exclude 'data/' \
  --exclude '*.log' \
  "$SRC_DIR/" "$DEST_DIR/"

echo "Copied dashboard/ to $DEST_DIR"
