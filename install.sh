#!/usr/bin/env bash
# Argon Skill Installer for macOS / Linux
# Copies this skill into ~/.gemini/config/skills/argon

set -e

TARGET_DIR="${HOME}/.gemini/config/skills/argon"

echo -e "\033[0;36mInstalling Argon Skill into: ${TARGET_DIR}\033[0m"

if [ -d "$TARGET_DIR" ]; then
    echo -e "\033[0;33mUpdating existing installation...\033[0m"
    rm -rf "$TARGET_DIR"
fi

mkdir -p "$TARGET_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cp "$SCRIPT_DIR/SKILL.md" "$TARGET_DIR/"
cp -r "$SCRIPT_DIR/scripts" "$TARGET_DIR/"

chmod +x "$TARGET_DIR/scripts/gemini_bridge.js" || true
chmod +x "$TARGET_DIR/scripts/launch_chrome_cdp.sh" || true

echo -e "\n\033[0;32m Argon Skill installed successfully!\033[0m"
echo -e "You can now use 'argon' in any Antigravity conversation or workspace."
