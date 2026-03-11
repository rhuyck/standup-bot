#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$HOME/.standup-bot"
PLIST_LABEL="com.standup-bot.daemon"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"

echo "=== standup-bot installer ==="
echo ""

# --- Resolve Node binary ---
NODE_BIN="$(which node)"
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: node not found in PATH"
  echo "Make sure nvm is loaded: source ~/.nvm/nvm.sh"
  exit 1
fi
# Resolve symlinks to get absolute path (important for launchd which doesn't load nvm)
NODE_BIN="$(readlink -f "$NODE_BIN" 2>/dev/null || realpath "$NODE_BIN" 2>/dev/null || echo "$NODE_BIN")"
echo "Node binary: $NODE_BIN"

# --- Install dependencies and build ---
echo ""
echo "Installing npm dependencies..."
cd "$PROJECT_DIR"
npm install

echo ""
echo "Building TypeScript..."
npm run build

# --- Make CLI globally available ---
echo ""
echo "Linking 'standup' command globally..."
npm link

# --- Set up config dir ---
mkdir -p "$CONFIG_DIR"
if [ ! -f "$CONFIG_DIR/config.json" ]; then
  cp "$PROJECT_DIR/config.json" "$CONFIG_DIR/config.json"
  echo ""
  echo "Created config file at: $CONFIG_DIR/config.json"
  echo ">>> EDIT THIS FILE with your credentials before the daemon will work <<<"
else
  echo ""
  echo "Config already exists at $CONFIG_DIR/config.json — skipping copy"
fi

# --- Write launchd plist ---
echo ""
echo "Installing launchd agent: $PLIST_PATH"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${PROJECT_DIR}/dist/daemon.js</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>

  <key>ThrottleInterval</key>
  <integer>30</integer>

  <key>StandardOutPath</key>
  <string>${CONFIG_DIR}/daemon.log</string>

  <key>StandardErrorPath</key>
  <string>${CONFIG_DIR}/daemon-error.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${HOME}</string>
    <key>PATH</key>
    <string>$(dirname "$NODE_BIN"):/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
EOF

# --- Load / reload the agent ---
# Unload first if it was already loaded
if launchctl list | grep -q "$PLIST_LABEL" 2>/dev/null; then
  echo "Unloading existing agent..."
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

echo "Loading launchd agent..."
launchctl load "$PLIST_PATH"

echo ""
echo "=== Installation complete! ==="
echo ""
echo "Next steps:"
echo "  1. Edit your config:  nano $CONFIG_DIR/config.json"
echo "     - GitHub personal access token (needs: repo, read:user)"
echo "     - Jira domain, email, and API token"
echo "     - Jira custom field IDs for story points and sprint"
echo ""
echo "  2. Restart the daemon after editing config:"
echo "     launchctl stop $PLIST_LABEL && launchctl start $PLIST_LABEL"
echo ""
echo "  3. Check daemon logs:"
echo "     tail -f $CONFIG_DIR/daemon.log"
echo ""
echo "  4. Run CLI commands:"
echo "     standup"
echo "     standup --fakeit"
echo "     standup todo"
echo "     standup prs"
echo ""
echo "Note on Jira custom field IDs:"
echo "  Story points and sprint fields vary by Jira instance."
echo "  To find yours, run:"
echo "    curl -u EMAIL:API_TOKEN https://DOMAIN/rest/api/3/field | python3 -m json.tool | grep -A2 'story\|sprint'"
echo ""
