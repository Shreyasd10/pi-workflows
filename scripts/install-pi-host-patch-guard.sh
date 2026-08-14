#!/usr/bin/env bash
# Installs (or removes) a launchd guard that re-applies the pi host
# jump-to-bottom patch automatically after `pi update` replaces the host
# files. Usage: bash scripts/install-pi-host-patch-guard.sh [--uninstall]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_LABEL="com.shreyasdevadiga.pi-host-patch"
PLIST="$HOME/Library/LaunchAgents/$AGENT_LABEL.plist"
WATCH_DIR="$HOME/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive"
NODE_BIN="$(command -v node)"

if [ "${1:-}" = "--uninstall" ]; then
  if [ -f "$PLIST" ]; then
    launchctl bootout "gui/$(id -u)/$AGENT_LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Removed $PLIST"
  else
    echo "No guard installed."
  fi
  exit 0
fi

if [ ! -d "$WATCH_DIR" ]; then
  echo "ERROR: pi package not found at $WATCH_DIR" >&2
  exit 1
fi
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: node not found on PATH" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$AGENT_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$SCRIPT_DIR/auto-apply-pi-host-patch.mjs</string>
  </array>
  <key>WatchPaths</key>
  <array>
    <string>$WATCH_DIR</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$HOME/.pi/local/pi-patch-backup/guard.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/.pi/local/pi-patch-backup/guard.log</string>
</dict>
</plist>
EOF

mkdir -p "$HOME/.pi/local/pi-patch-backup"
launchctl bootout "gui/$(id -u)/$AGENT_LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Guard installed: $PLIST (watches $WATCH_DIR)"
echo "It runs on load and whenever pi's host files change; log: ~/.pi/local/pi-patch-backup/guard.log"
