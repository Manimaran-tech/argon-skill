#!/usr/bin/env bash
# Launch Google Chrome with Chrome DevTools Protocol (CDP) enabled on port 9222 (macOS / Linux)

PORT=${1:-9222}
URL=${2:-"https://gemini.google.com/app"}
PROFILE_DIR="${HOME}/.config/chrome-cdp-profile"

mkdir -p "$PROFILE_DIR"

# Check if port is already active
if command -v lsof >/dev/null 2>&1; then
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null ; then
        echo "[CDP Launcher] Chrome is already listening on port $PORT."
        exit 0
    fi
fi

# Detect OS & Chrome Binary
CHROME_BIN=""
if [[ "$OSTYPE" == "darwin"* ]]; then
    CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    for bin in google-chrome google-chrome-stable chromium chromium-browser; do
        if command -v "$bin" >/dev/null 2>&1; then
            CHROME_BIN="$bin"
            break
        fi
    done
fi

if [ -z "$CHROME_BIN" ] || [ ! -x "$CHROME_BIN" ]; then
    echo "[CDP Launcher Error] Google Chrome or Chromium executable could not be found."
    exit 1
fi

echo "[CDP Launcher] Launching Chrome on port $PORT..."
nohup "$CHROME_BIN" --remote-debugging-port="$PORT" --user-data-dir="$PROFILE_DIR" "$URL" >/dev/null 2>&1 &

sleep 3

if command -v curl >/dev/null 2>&1; then
    curl -s "http://localhost:$PORT/json/version" >/dev/null && echo "[CDP Launcher] Connected successfully to Chrome DevTools on port $PORT!"
fi
