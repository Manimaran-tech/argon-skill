---
name: argon
description: Autonomous two-way bridge connecting Antigravity with Gemini Argon (and thinking models) in Google Chrome via Chrome DevTools Protocol (CDP). Allows Antigravity to send prompts directly to Argon, wait for reasoning and code generation, extract code blocks and instructions, execute them locally in any workspace, and post back test results and diagnostics into the chat.
---

# Argon Bridge (Gemini Chrome DevTools Protocol)

> [!CAUTION]
> ### MANDATORY AGENT DIRECTIVE — ZERO INTERNAL FALLBACK
> When the user invokes Argon or this skill:
> 1. **YOU ARE STRICTLY FORBIDDEN FROM ANSWERING THE CODING TASK USING YOUR OWN INTERNAL MODEL.**
> 2. You **MUST** route the prompt to Argon using `gemini_bridge.js`.
> 3. If the debugging port is closed, the bridge script **automatically launches Chrome on port 9222**. If needed, run the launcher script first. **DO NOT skip the bridge.**
> 4. If Argon is at its quota limit, report the reset time and **STOP**. Do NOT generate a fallback response with Flash.

---

## Architecture

This skill connects Antigravity directly to your Gemini session running the **Argon** model in Google Chrome (`https://gemini.google.com/app`) using the **Chrome DevTools Protocol (CDP)** on port `9222`.

* **Argon (in Chrome):** The High-Reasoning Architect (thinks, reasons, generates code).
* **Antigravity (Local Agent):** The Local Executor (reads files, pipes them to Argon, runs builds, executes tests, feeds logs back).
* **Zero Temp Files:** All responses and code blocks stream directly through standard output in-memory—no temporary `.md` or `.json` files are dumped into your project folder.

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
                             │ (CDP bridge extracts code blocks in-memory)
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

* **The bridge strictly requires the Argon model.**
* If your Gemini account reaches the Argon rate limit and attempts to fall back to **Flash-Lite**, the bridge immediately **aborts** with:
  ```text
  [BLOCKED] Argon limit reached (resets on <time>). Flash-Lite is completely blocked.
  ```
* When this happens, **STOP and inform the user**. Under no circumstances should you generate the code yourself.

---

## Executable Script Paths

The agent should execute the bridge script using the user's global config directory:

* **Windows:**
  ```powershell
  node "$env:USERPROFILE\.gemini\config\skills\argon\scripts\gemini_bridge.js" <command>
  ```
* **macOS / Linux:**
  ```bash
  node "$HOME/.gemini/config/skills/argon/scripts/gemini_bridge.js" <command>
  ```

---

## Standard Execution Protocol for the Agent

When the user asks you to do something with Argon:

### Step 1: Ensure Chrome is Running & Verify Argon Status
Run the status check:
```powershell
node "$env:USERPROFILE\.gemini\config\skills\argon\scripts\gemini_bridge.js" read
```
*(The bridge script will **automatically launch Chrome on port 9222** if it is not currently open).*

### Step 2: Bundle Workspace Context (if modifying existing code)
If the user's request involves editing or inspecting existing files, read those files first and combine them with the user's task prompt.

### Step 3: Send Prompt to Argon
```powershell
node "$env:USERPROFILE\.gemini\config\skills\argon\scripts\gemini_bridge.js" send "Your task and file context here"
```
*(If Argon is at limit, this command will immediately exit with code 2. Do not proceed to generate code yourself).*

### Step 4: Wait for Argon & Stream Response In-Memory
```powershell
node "$env:USERPROFILE\.gemini\config\skills\argon\scripts\gemini_bridge.js" wait
```
This streams the response directly to stdout between `=== ARGON_RESPONSE_START ===` and `=== ARGON_RESPONSE_END ===`, with parsed code blocks in `=== ARGON_CODE_BLOCKS ===`. No temporary files are created on disk.

### Step 5: Apply Code & Report Feedback
1. Parse the code blocks from the command output and write them directly to their target files.
2. Run any build, compile, or test commands requested.
3. Pipe the terminal output back to Argon if follow-up is needed:
   ```powershell
   node "$env:USERPROFILE\.gemini\config\skills\argon\scripts\gemini_bridge.js" send "Build output: (paste terminal stdout/stderr here)"
   ```
