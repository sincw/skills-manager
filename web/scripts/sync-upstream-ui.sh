#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_DIR="${1:-"$ROOT_DIR/../skills-manager"}"

if [[ ! -d "$UPSTREAM_DIR/src" ]]; then
  echo "Upstream skills-manager src not found: $UPSTREAM_DIR/src" >&2
  exit 1
fi

rsync -a --delete \
  --exclude 'lib/tauri.ts' \
  --exclude 'lib/browser-shims.ts' \
  "$UPSTREAM_DIR/src/" "$ROOT_DIR/client/src/"

rsync -a --delete "$UPSTREAM_DIR/public/" "$ROOT_DIR/client/public/"
rsync -a "$UPSTREAM_DIR/index.html" \
  "$UPSTREAM_DIR/tailwind.config.js" \
  "$UPSTREAM_DIR/postcss.config.js" \
  "$UPSTREAM_DIR/eslint.config.js" \
  "$UPSTREAM_DIR/vite.config.ts" \
  "$ROOT_DIR/client/"

echo "Synced upstream UI. Re-apply Web entrypoints if upstream overwrote client/src/main.tsx."
