#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
START_IN_BACKGROUND=false

if [[ "${1:-}" == "--background" || "${1:-}" == "-b" ]]; then
  START_IN_BACKGROUND=true
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22 or newer is required. Please install it first and rerun this script."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
REQUIRED_MAJOR=22

if [ "$NODE_MAJOR" -lt "$REQUIRED_MAJOR" ]; then
  echo "Node.js version ${REQUIRED_MAJOR}+ is required, but found $(node -v)."
  echo "Please update Node.js and rerun this script."
  exit 1
fi

echo "Using Node.js $(node -v)"
cd "$ROOT_DIR"
echo "Installing project dependencies..."
npm install

if [ "$START_IN_BACKGROUND" = true ]; then
  mkdir -p "$ROOT_DIR/logs"
  LOG_FILE="$ROOT_DIR/logs/3d-pcc.log"
  echo "Starting app in the background..."
  nohup npm run start > "$LOG_FILE" 2>&1 &
  echo "The app is running in the background."
  echo "Log file: $LOG_FILE"
  exit 0
fi

echo ""
echo "Setup complete."
echo "Start the app with: npm run dev"
echo "Or for production: npm run start:production"
echo "Or run in the background: ./scripts/install.sh --background"
