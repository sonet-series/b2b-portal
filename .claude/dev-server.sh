#!/bin/sh
# Launcher for the Next.js dev server.
#
# Two things this works around, both consequences of how Node is installed here
# (extracted to ~/.local/node — no Homebrew on this Mac):
#
# 1. PATH. Node is only added to PATH by ~/.zshrc, which non-interactive
#    launchers do not source, so `npm` is not found. Hence the export below and
#    the absolute path to the binary.
#
# 2. --webpack. Under the preview launcher, Turbopack cannot spawn its pooled
#    `node` child process for PostCSS/Tailwind and panics with
#    "spawning node pooled process - No such file or directory", even with node
#    correctly on PATH. The same wrapper run from a normal shell works, so it is
#    the launcher's process environment, not the PATH. webpack dev mode does not
#    spawn that child and serves the app fine.
#
#    `npm run dev` from a terminal still uses Turbopack and is unaffected.
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

NODE_BIN="$HOME/.local/node/bin"
[ -x "$NODE_BIN/node" ] || {
  echo "No node at $NODE_BIN/node — see the environment notes in CLAUDE.md." >&2
  exit 1
}

export PATH="$NODE_BIN:$PATH"
exec "$NODE_BIN/node" node_modules/next/dist/bin/next dev --webpack "$@"
