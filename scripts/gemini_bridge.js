#!/usr/bin/env node
/**
 * Gemini Browser Bridge (Chrome DevTools Protocol) - Argon-Only Edition
 * Autonomous bridge connecting agentic coding assistants with Gemini Argon in Google Chrome.
 * Includes auto-launch recovery, DOM stabilization, and zero-workspace-temp-file streaming.
 * No third-party npm dependencies required (uses built-in Node 20+ WebSocket & fetch).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

// CLI Argument Parsing
const args = process.argv.slice(2);
const command = args[0];

function getNamedArg(flag, fallback) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return fallback;
}

const CDP_PORT = parseInt(getNamedArg('--port', process.env.CDP_PORT || '9222'), 10);
const saveFlag = args.includes('--save');
const customDir = getNamedArg('--dir', null);

// Extract positional prompt text excluding flags
const textArgs = args.slice(1).filter((a, i, arr) => {
  if (a.startsWith('--')) return false;
  if (i > 0 && arr[i - 1].startsWith('--')) return false;
  return true;
}).join(' ');

// Auto-launch Chrome if port 9222 is offline
async function ensureChromeRunning() {
  try {
    const res = await fetch(`http://localhost:${CDP_PORT}/json/version`);
    if (res.ok) return;
  } catch (_) {
    console.log(`[Bridge] Chrome is not running on port ${CDP_PORT}. Auto-launching debug browser...`);
    const isWindows = process.platform === 'win32';
    const scriptName = isWindows ? 'launch_chrome_cdp.ps1' : 'launch_chrome_cdp.sh';
    const scriptPath = path.join(__dirname, scriptName);

    if (fs.existsSync(scriptPath)) {
      try {
        if (isWindows) {
          execSync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}" -Port ${CDP_PORT}`, { stdio: 'ignore' });
        } else {
          execSync(`bash "${scriptPath}" ${CDP_PORT}`, { stdio: 'ignore' });
        }
      } catch (err) {
        console.warn(`[Bridge Warning] Auto-launch script returned: ${err.message}`);
      }
    }

    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const res = await fetch(`http://localhost:${CDP_PORT}/json/version`);
        if (res.ok) {
          console.log(`[Bridge] Chrome successfully connected on port ${CDP_PORT}.`);
          return;
        }
      } catch (_) {}
    }
  }
}

async function getGeminiTarget() {
  await ensureChromeRunning();

  let targets = [];
  try {
    const res = await fetch(`http://localhost:${CDP_PORT}/json/list`);
    targets = await res.json();
  } catch (err) {
    throw new Error(
      `Could not connect to Chrome DevTools on port ${CDP_PORT}.\n` +
      `Make sure Google Chrome is running with: --remote-debugging-port=${CDP_PORT}`
    );
  }

  let gemini = targets.find(t => t.url && t.url.includes('gemini.google.com'));

  if (!gemini) {
    console.log("[Bridge] Gemini tab not open. Navigating to https://gemini.google.com/app...");
    try {
      const newTabRes = await fetch(`http://localhost:${CDP_PORT}/json/new?https://gemini.google.com/app`, { method: 'PUT' });
      gemini = await newTabRes.json();
      await new Promise(r => setTimeout(r, 4000));
    } catch (_) {}
  }

  return gemini;
}

class GeminiCDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.id && this.callbacks.has(data.id)) {
          const cb = this.callbacks.get(data.id);
          this.callbacks.delete(data.id);
          cb(data);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve) => {
      const id = this.msgId++;
      this.callbacks.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.result && res.result.exceptionDetails) {
      throw new Error(`CDP Eval Exception: ${JSON.stringify(res.result.exceptionDetails)}`);
    }
    return res.result?.result?.value;
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
    }
  }
}

async function getClient() {
  const target = await getGeminiTarget();
  if (!target) {
    throw new Error("No open Gemini tab found in Chrome. Please make sure https://gemini.google.com/app is open.");
  }
  const client = new GeminiCDPClient(target.webSocketDebuggerUrl);
  await client.connect();
  return client;
}

// Wait up to maxWaitMs for the DOM elements to finish rendering
async function waitForDomReady(client, maxWaitMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const ready = await client.eval(`
      (() => {
        const modeBtn = document.querySelector('button[aria-label*="mode picker"], [aria-label*="model"], .input-area-switch');
        const ql = document.querySelector('.ql-editor');
        return !!modeBtn || !!ql;
      })()
    `);
    if (ready) return;
    await new Promise(r => setTimeout(r, 600));
  }
}

// Strictly verify that Argon is the active model
async function ensureArgonOnly(client) {
  await waitForDomReady(client);

  const status = await client.eval(`
    (() => {
      const modeBtn = document.querySelector('button[aria-label*="mode picker"], [aria-label*="model"], .input-area-switch');
      const modeText = modeBtn ? modeBtn.innerText.trim() : '';
      const modeAria = modeBtn ? (modeBtn.getAttribute('aria-label') || '') : '';
      
      const bodyText = document.body.innerText;
      const isLimitBanner = bodyText.includes('Limit reached') || 
                            bodyText.includes('Continuing with Flash-Lite') || 
                            bodyText.includes('reached your limit');

      let resetInfo = '';
      if (isLimitBanner) {
        const match = bodyText.match(/resets on ([^\\.\\n]+)/i) || bodyText.match(/resets in ([^\\.\\n]+)/i);
        if (match) resetInfo = match[0];
      }

      const isArgon = modeText.toLowerCase().includes('argon') || modeAria.toLowerCase().includes('argon');
      const isFlash = modeText.toLowerCase().includes('flash') || modeAria.toLowerCase().includes('flash');

      return {
        hasModeBtn: !!modeBtn,
        modeText,
        isArgon,
        isFlash,
        isLimitReached: isLimitBanner || isFlash,
        resetInfo
      };
    })()
  `);

  if (!status.isArgon || status.isLimitReached) {
    const resetMsg = status.resetInfo ? ` (${status.resetInfo})` : '';
    console.error(`\n[BLOCKED] Argon limit reached${resetMsg}. Flash-Lite is completely blocked.`);
    client.close();
    process.exit(2);
  }

  return status;
}

// 1. Send Prompt to Argon
async function sendPrompt(promptText) {
  const client = await getClient();
  try {
    await ensureArgonOnly(client);

    console.log(`[Bridge] Confirmed Argon model. Typing prompt (${promptText.length} chars)...`);

    // Trusted Types safe: clear content via Range selection + execCommand
    await client.eval(`
      (() => {
        const ql = document.querySelector('.ql-editor');
        if (!ql) return;
        ql.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(ql);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('delete', false);
      })()
    `);

    // Native text input via CDP
    await client.send("Input.insertText", { text: promptText });

    // Dispatch events & click send
    const result = await client.eval(`
      (() => {
        const ql = document.querySelector('.ql-editor');
        if (ql) {
          ql.dispatchEvent(new Event('input', { bubbles: true }));
          ql.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const sendBtn = document.querySelector('button[aria-label="Send message"], button[aria-label*="Send"], button.send-button');
        if (!sendBtn) {
          return { success: false, error: 'Send button not active after typing' };
        }
        sendBtn.click();
        return { success: true };
      })()
    `);

    if (!result.success) {
      throw new Error(`Failed to send prompt: ${result.error}`);
    }
    console.log("[Bridge] Prompt submitted to Argon!");
  } finally {
    client.close();
  }
}

// 2. Wait for Argon Generation (In-Memory Streaming)
async function waitForResponse(timeoutSeconds = 240) {
  const client = await getClient();
  try {
    console.log("[Bridge] Waiting for Argon to respond...");
    const startTime = Date.now();
    let hasStartedGenerating = false;
    let lastText = '';
    let stableCount = 0;

    while (Date.now() - startTime < timeoutSeconds * 1000) {
      await ensureArgonOnly(client);

      const state = await client.eval(`
        (() => {
          const stopBtn = document.querySelector('button[aria-label*="Stop"], button[aria-label*="stop"]');
          const isGenerating = !!stopBtn;
          
          const markdownEls = document.querySelectorAll('.markdown, .md-content, [inline-copy-host], .response-content');
          const latestMd = markdownEls.length > 0 ? markdownEls[markdownEls.length - 1] : null;

          let cleanedText = '';
          const codeBlocks = [];

          if (latestMd) {
            const clone = latestMd.cloneNode(true);
            clone.querySelectorAll('.cdk-visually-hidden, .model-response-label-announcer, thinking-overlay').forEach(el => el.remove());
            cleanedText = clone.innerText.trim();

            const pres = latestMd.querySelectorAll('pre');
            pres.forEach(pre => {
              const code = pre.querySelector('code') || pre;
              const langHeader = pre.closest('.code-block')?.querySelector('.code-block-decoration')?.innerText || '';
              codeBlocks.push({
                header: langHeader.trim(),
                code: code.innerText
              });
            });
          }

          const thinkingEl = document.querySelector('thinking-overlay, .thinking-content, [aria-label*="thought"]');

          return {
            isGenerating,
            hasContent: cleanedText.length > 0,
            text: cleanedText,
            codeBlocks: codeBlocks,
            thinkingText: thinkingEl ? thinkingEl.innerText : null
          };
        })()
      `);

      if (state && state.isGenerating) {
        hasStartedGenerating = true;
        stableCount = 0;
        process.stdout.write(".");
      } else if (hasStartedGenerating || (state && state.hasContent)) {
        if (state.text === lastText && state.text.length > 0) {
          stableCount++;
          if (stableCount >= 2) {
            console.log("\n[Bridge] Argon generation completed!");
            console.log(`[Bridge] Found ${state.codeBlocks.length} code block(s).\n`);

            // Output clean content directly to stdout in-memory
            console.log("=== ARGON_RESPONSE_START ===");
            console.log(state.text);
            console.log("=== ARGON_RESPONSE_END ===");

            if (state.codeBlocks.length > 0) {
              console.log("\n=== ARGON_CODE_BLOCKS ===");
              console.log(JSON.stringify(state.codeBlocks, null, 2));
              console.log("=== ARGON_CODE_BLOCKS_END ===");
            }

            // Only write files if explicitly requested via --save or --dir
            if (saveFlag || customDir) {
              const outDir = customDir ? path.resolve(customDir) : process.cwd();
              const outputPath = path.join(outDir, 'gemini_latest.md');
              fs.writeFileSync(outputPath, state.text, 'utf-8');
              const jsonPath = path.join(outDir, 'gemini_output.json');
              fs.writeFileSync(jsonPath, JSON.stringify(state, null, 2), 'utf-8');
              console.log(`[Bridge] Saved files to: ${outDir}`);
            }

            return state;
          }
        } else {
          lastText = state.text;
          stableCount = 0;
        }
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    throw new Error("Timeout waiting for Argon response.");
  } finally {
    client.close();
  }
}

// 3. Read Current State Without Sending (In-Memory)
async function readCurrent() {
  const client = await getClient();
  try {
    await ensureArgonOnly(client);

    const data = await client.eval(`
      (() => {
        const markdownEls = document.querySelectorAll('.markdown, .md-content, [inline-copy-host], .response-content');
        const latestMd = markdownEls.length > 0 ? markdownEls[markdownEls.length - 1] : null;
        let cleanedText = '';
        if (latestMd) {
          const clone = latestMd.cloneNode(true);
          clone.querySelectorAll('.cdk-visually-hidden, .model-response-label-announcer, thinking-overlay').forEach(el => el.remove());
          cleanedText = clone.innerText.trim();
        }

        return {
          title: document.title,
          url: window.location.href,
          latestText: cleanedText || '(No response yet)'
        };
      })()
    `);
    
    console.log("[Bridge] Argon Status: Active and Ready.");
    console.log("[Bridge] Latest Message:", data.latestText);
    return data;
  } finally {
    client.close();
  }
}

(async () => {
  try {
    if (command === 'send') {
      if (!textArgs) {
        console.error("Usage: node gemini_bridge.js send <prompt text>");
        process.exit(1);
      }
      await sendPrompt(textArgs);
    } else if (command === 'wait') {
      await waitForResponse();
    } else if (command === 'read') {
      await readCurrent();
    } else if (command === 'send-and-wait') {
      if (!textArgs) {
        console.error("Usage: node gemini_bridge.js send-and-wait <prompt text>");
        process.exit(1);
      }
      await sendPrompt(textArgs);
      await waitForResponse();
    } else {
      console.log(`
Gemini Browser Bridge - Strict Argon Edition
--------------------------------------------
Usage:
  node gemini_bridge.js read                      Check if Argon is active (blocks Flash-Lite)
  node gemini_bridge.js send "<prompt>"           Send prompt to Argon only
  node gemini_bridge.js wait [--save]             Wait for Argon response (streamed in-memory)
  node gemini_bridge.js send-and-wait "<prompt>"  Send and wait strictly for Argon

Options:
  --port <number>   Chrome DevTools remote debugging port (default: 9222)
  --save            Save output to gemini_latest.md and gemini_output.json in workspace
  --dir <path>      Custom directory if saving files
      `);
    }
  } catch (err) {
    console.error(`[Bridge Error]`, err.message);
    process.exit(1);
  }
})();
