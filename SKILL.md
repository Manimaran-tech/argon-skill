---
name: argon
description: Autonomous two-way bridge connecting Antigravity with Gemini Argon (and thinking models) in Google Chrome via Chrome DevTools Protocol (CDP). Allows Antigravity to send prompts directly to Argon, wait for reasoning and code generation, extract code blocks and instructions, execute them locally in any workspace, and post back test results and diagnostics into the chat.
---

# Argon Bridge (Gemini Chrome DevTools Protocol)

This skill connects Antigravity directly to your Gemini session running the **Argon** model in Google Chrome (`https://gemini.google.com/app`) using the **Chrome DevTools Protocol (CDP)** on port `9222`.

It allows **Argon** in Chrome to serve as the **high-level reasoning / thinking architect**, while Antigravity acts as the **local execution engine** (reading project files, creating files, running builds, debugging, and reporting back results).

---

## How Argon Accesses Your Local Files

Argon inside Chrome is completely sandboxed by the browser and cannot access your local hard drive or terminal on its own. **Antigravity acts as the courier & executor:**

```
  ┌────────────────────────────────────────────────────────┐
  │ 1. Antigravity reads your local files & directory tree │
  └──────────────────────────┬─────────────────────────────┘
                             │ (CDP bridge types it into chat)
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │ 2. Argon analyzes code & reasons about changes         │
  └──────────────────────────┬─────────────────────────────┘
                             │ (CDP bridge extracts code blocks)
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │ 3. Antigravity writes files to disk & runs tests       │
  └──────────────────────────┬─────────────────────────────┘
                             │ (CDP bridge sends stdout / stderr)
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │ 4. Argon inspects test results & continues development │
  └────────────────────────────────────────────────────────┘
```

---

## Strict Argon Mode (No Flash-Lite Fallback)

By default:
* **The bridge strictly requires the Argon model.**
* If your Gemini account reaches the Argon rate limit and attempts to fall back to **Flash-Lite**, the bridge immediately **aborts** with:
  ```text
  [BLOCKED] Argon limit reached (resets on <time>). Flash-Lite is completely blocked.
  ```
* It will **never** submit prompts to or accept code from Flash-Lite.

---

## Skill Scripts Location

The skill scripts are located within the skill directory:
* **Argon Bridge CLI:** `<skill-dir>/scripts/gemini_bridge.js`
* **Windows Launcher:** `<skill-dir>/scripts/launch_chrome_cdp.ps1`
* **macOS / Linux Launcher:** `<skill-dir>/scripts/launch_chrome_cdp.sh`

---

## When to Use This Skill

Activate this skill whenever:
- The user mentions **Argon**, or wants to use their Chrome Gemini Argon session to generate code or design a project.
- The user asks to communicate with their browser chat tab or bridge chat responses with local workspace execution.
- The user asks for an automated loop between Argon's reasoning and local file/command execution.

---

## Standard Workflow

### 1. Ensure Chrome is Running with Remote Debugging
Verify port 9222 is active or launch Chrome:
* **Windows:**
  ```powershell
  pwsh -File "<skill-dir>/scripts/launch_chrome_cdp.ps1"
  ```
* **macOS / Linux:**
  ```bash
  bash "<skill-dir>/scripts/launch_chrome_cdp.sh"
  ```

### 2. Verify Connection & Model Status
```bash
node "<skill-dir>/scripts/gemini_bridge.js" read
```
If the output shows `limitReached: true`, notify the user that Argon is at its limit and report the reset time.

### 3. Send Prompt to Argon (with local file context)
Antigravity reads local files first, formats them, and sends them:
```bash
node "<skill-dir>/scripts/gemini_bridge.js" send "Your task or instruction here"
```
*(If Argon's limit is reached, this aborts immediately and refuses to use Flash-Lite).*

### 4. Wait for Reasoning & Extract Code
```bash
node "<skill-dir>/scripts/gemini_bridge.js" wait --dir "<active-workspace-path>"
```
This automatically:
- Monitors the chat until Argon finishes generating and the "Stop response" button disappears.
- Saves the full Markdown response to `<active-workspace>/gemini_latest.md`.
- Saves structured metadata and all parsed code blocks to `<active-workspace>/gemini_output.json`.

### 5. Execute Code & Feed Back Diagnostics
1. Antigravity inspects `gemini_output.json` and writes the code blocks to their target file paths.
2. Antigravity runs the code, tests, or compiler commands in the workspace terminal.
3. Antigravity sends terminal logs/errors back to Argon to continue the development loop:
   ```bash
   node "<skill-dir>/scripts/gemini_bridge.js" send "Execution Output: ... (exit code 0 / error log)"
   ```
4. Repeat steps 4–5 until the feature or project is fully built!
