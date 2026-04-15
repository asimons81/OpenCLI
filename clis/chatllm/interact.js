/**
 * ChatLLM interact — interactive REPL for ChatLLM chat.
 *
 * Usage: opencli chatllm interact [--model "Claude Sonnet 4.6"]
 *
 * Strategy: COOKIE — requires being logged into apps.abacus.ai in Chrome.
 */
import * as readline from 'node:readline';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CliError } from '@jackwener/opencli/errors';
import { log } from '@jackwener/opencli/logger';
import { CHATLLM_CHAT_URL, isLoggedOut } from './utils.js';

const CHAT_TEXTAREA = 'textarea[placeholder="Write something..."]';

export const interactCommand = cli({
  site: 'chatllm',
  name: 'interact',
  description:
    'Interactive REPL for ChatLLM Teams. ' +
    'Type your prompts and press Enter to send. Type "exit" or "quit" to stop. ' +
    'Supports any model available in ChatLLM Teams. ' +
    'Requires being logged into apps.abacus.ai in Chrome.',
  domain: CHATLLM_CHAT_URL(),
  strategy: Strategy.COOKIE,
  browser: true,
  timeoutSeconds: 3600,
  args: [
    {
      name: 'model',
      type: 'string',
      default: '',
      help: 'Default model to use, e.g. "Claude Sonnet 4.6", "GPT-5.4", "Gemini 3.1 Pro"',
    },
  ],
  columns: [],
  func: async (page, kwargs) => {
    const defaultModel = String(kwargs.model || '').trim();
    let currentModel = defaultModel;

    const targetModel = currentModel
      ? currentModel.toLowerCase().replace(/\s+/g, '_').replace(/\./g, '')
      : 'nano_banana_2';
    const targetUrl = CHATLLM_CHAT_URL(targetModel);

    log.status(`Opening ChatLLM at ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.wait(3);

    if (await isLoggedOut(page)) {
      throw new CliError(
        'NOT_LOGGED_IN',
        'Not logged into ChatLLM. Please sign in to apps.abacus.ai in Chrome.',
        'Open Chrome, go to https://apps.abacus.ai/chatllm, sign in with Google, then try again.'
      );
    }

    let textareaFound = false;
    for (let i = 0; i < 15; i++) {
      await page.wait(1);
      textareaFound = await page.evaluate(() => !!document.querySelector(CHAT_TEXTAREA));
      if (textareaFound) break;
    }
    if (!textareaFound) {
      throw new CliError('NO_TEXTAREA', 'Chat textarea not found on the page.', 'The page may have changed.');
    }

    if (currentModel) {
      log.status(`Setting model to: ${currentModel}...`);
      const result = await selectModel(page, currentModel);
      if (!result.ok) {
        console.error(`Warning: Could not select model "${currentModel}": ${result.reason}`);
        console.error('Proceeding with default model...');
      }
      currentModel = result.model || currentModel;
    } else {
      currentModel = await page.evaluate(() => {
        const btns = document.querySelectorAll('button[aria-haspopup="dialog"]');
        for (const btn of btns) {
          const text = (btn.textContent || '').trim();
          if (text && text.length < 60 && !text.includes('Refer') && !text.includes('Invite')) {
            return text;
          }
        }
        return 'Nano Banana 2';
      });
    }

    console.log(`\n=== ChatLLM Interactive (${currentModel}) ===`);
    console.log('Type your prompts and press Enter to send.');
    console.log('Commands: "exit" / "quit" to stop, "/model <name>" to switch, "/reset" to start new chat.\n');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'you> ' });
    let exitRequested = false;

    rl.on('SIGINT', () => {
      console.log('\n[Interrupted] Exiting...');
      rl.close();
      exitRequested = true;
    });

    for await (const line of rl) {
      if (exitRequested) break;
      const input = line.trim();
      if (!input) { rl.prompt(); continue; }

      if (input === 'exit' || input === 'quit' || input === 'q') {
        console.log('Goodbye!');
        rl.close();
        break;
      }

      if (input === '/help') {
        console.log('Commands:');
        console.log('  /model <name>  — Switch to a different model');
        console.log('  /reset         — Start a new chat');
        console.log('  exit / quit    — Exit interactive mode');
        rl.prompt();
        continue;
      }

      if (input.startsWith('/model ')) {
        const newModel = input.slice(7).trim();
        if (!newModel) { console.log('Usage: /model <model name>'); rl.prompt(); continue; }
        console.log(`Switching to model: ${newModel}...`);
        const result = await selectModel(page, newModel);
        if (!result.ok) {
          console.error(`Error: ${result.reason}`);
        } else {
          currentModel = result.model || newModel;
          console.log(`Model switched to: ${currentModel}`);
        }
        rl.prompt();
        continue;
      }

      if (input === '/reset') {
        console.log('Starting new chat...');
        await page.goto(CHATLLM_CHAT_URL(targetModel) + '?new=1', { waitUntil: 'domcontentloaded' });
        await page.wait(3);
        for (let i = 0; i < 10; i++) {
          await page.wait(1);
          const found = await page.evaluate(() => !!document.querySelector(CHAT_TEXTAREA));
          if (found) break;
        }
        rl.prompt();
        continue;
      }

      console.log('assistant> (waiting...)');
      const response = await sendPromptAndWait(page, input);
      if (response) {
        console.log(`assistant> ${response}\n`);
      } else {
        console.log('assistant> [No response received]\n');
      }
      rl.prompt();
    }

    rl.close();
    return [{ status: 'session_ended' }];
  },
});

async function selectModel(page, modelName) {
  return page.evaluate(async (name) => {
    try {
      const buttons = document.querySelectorAll('button[aria-haspopup="dialog"]');
      let modelBtn = null;
      for (const btn of buttons) {
        const text = (btn.textContent || '').trim();
        if (text && text.length < 60) { modelBtn = btn; break; }
      }
      if (!modelBtn) return { ok: false, reason: 'Model dropdown not found' };
      modelBtn.click();
      await new Promise(r => setTimeout(r, 1000));
      const listboxId = modelBtn.getAttribute('aria-controls');
      if (!listboxId) return { ok: false, reason: 'No aria-controls on model dropdown' };
      const listbox = document.getElementById(listboxId);
      if (!listbox) return { ok: false, reason: 'Model listbox not found' };
      const options = listbox.querySelectorAll('[role="option"]');
      let target = null;
      let matchedName = '';
      for (const opt of options) {
        const text = (opt.innerText || '').trim();
        if (text.toLowerCase().includes(name.toLowerCase())) { target = opt; matchedName = text; break; }
      }
      if (!target) {
        const all = Array.from(options).map(o => (o.innerText || '').trim()).join(', ');
        return { ok: false, reason: `Model "${name}" not found. Available: ${all}` };
      }
      target.click();
      await new Promise(r => setTimeout(r, 500));
      return { ok: true, model: matchedName };
    } catch (e) { return { ok: false, reason: String(e) }; }
  }, modelName);
}

async function sendPromptAndWait(page, promptText) {
  try {
    await page.evaluate((text) => {
      const ta = document.querySelector('textarea[placeholder="Write something..."]');
      if (!ta) return;
      ta.focus();
      ta.value = '';
      document.execCommand('selectAll');
      document.execCommand('delete');
      document.execCommand('insertText', false, text);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }, promptText);
    await page.wait(2);

    const sendResult = await page.evaluate(() => {
      const btn = document.querySelector('button[data-id="send"]');
      if (!btn) return { ok: false, reason: 'Send button not found' };
      if (btn.disabled) return { ok: false, reason: 'Send button is disabled' };
      btn.click();
      return { ok: true };
    });
    if (!sendResult.ok) return `[Error: ${sendResult.reason}]`;

    return await page.evaluate(async () => {
      const maxWait = 180000;
      const pollInterval = 4000;
      const start = Date.now();
      while (Date.now() - start < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval));
        const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
        if (msgs.length > 0) {
          const last = msgs[msgs.length - 1];
          const text = (last.innerText || '').trim();
          if (text.length > 0) return text;
        }
        const thinking = document.querySelector('button[aria-label*="Thinking"], [class*="thinking"]');
        if (thinking) continue;
      }
      return '';
    });
  } catch (e) { return `[Error: ${String(e)}]`; }
}
