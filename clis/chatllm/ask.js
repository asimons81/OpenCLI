/**
 * ChatLLM ask — send a text message and return the response.
 *
 * Usage: opencli chatllm ask "your prompt" --model "Claude Sonnet 4.6" --new
 *
 * Strategy: COOKIE — requires being logged into apps.abacus.ai in Chrome.
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CliError } from '@jackwener/opencli/errors';
import { log } from '@jackwener/opencli/logger';
import { CHATLLM_CHAT_URL, getLastAssistantMessage } from './utils.js';

const CHAT_TEXTAREA = 'textarea[placeholder="Write something..."], textarea';

export const askCommand = cli({
  site: 'chatllm',
  name: 'ask',
  description:
    'Send a text message to ChatLLM and get the response. ' +
    'Supports any model available in ChatLLM Teams (GPT, Claude, Gemini, Grok, and more). ' +
    'Requires being logged into apps.abacus.ai in Chrome.',
  domain: CHATLLM_CHAT_URL(),
  strategy: Strategy.COOKIE,
  browser: true,
  defaultFormat: 'plain',
  timeoutSeconds: 300,
  args: [
    {
      name: 'prompt',
      positional: true,
      required: true,
      type: 'string',
      help: 'Prompt to send to ChatLLM',
    },
    {
      name: 'model',
      type: 'string',
      default: '',
      help: 'Model to use, e.g. "Claude Sonnet 4.6", "GPT-5.4", "Gemini 3.1 Pro". Uses current model if omitted.',
    },
    {
      name: 'new',
      type: 'boolean',
      default: false,
      help: 'Start a new chat before sending',
    },
  ],
  columns: ['response'],
  func: async (page, kwargs) => {
    const prompt = kwargs.prompt;
    const model = String(kwargs.model || '').trim();
    const startNew = kwargs.new === true || String(kwargs.new).toLowerCase() === 'true';

    // 1. Navigate if needed
    const targetModel = model
      ? model.toLowerCase().replace(/\s+/g, '_').replace(/\./g, '')
      : 'nano_banana_2';
    const targetUrl = `${CHATLLM_CHAT_URL(targetModel)}${startNew ? '&new=1' : ''}`;

    console.log('[DEBUG] Navigating to:', targetUrl);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('[DEBUG] Navigation done, waiting...');
    await page.wait(2); // wait 2 seconds for React to bootstrap

    // 2. Debug: check page state
    const pageInfo = await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      bodyText: document.body.innerText.substring(0, 200),
      rootKids: document.getElementById('root')?.children.length ?? -1,
    }));
    console.log('[DEBUG] Page info:', JSON.stringify(pageInfo));

    // 3. Check if logged out
    const loggedOut = await page.evaluate(() =>
      document.body.innerText.includes('Sign in to ChatLLM') ||
      document.body.innerText.includes('Sign in with Google')
    );
    if (loggedOut) {
      throw new CliError(
        'NOT_LOGGED_IN',
        'Not logged into ChatLLM. Please sign in to apps.abacus.ai in Chrome.',
        'Open Chrome, go to https://apps.abacus.ai/chatllm, sign in with Google, then try again.'
      );
    }

    // 4. Wait for textarea to appear (poll every 1s for up to 15s)
    let textareaFound = false;
    for (let i = 0; i < 15; i++) {
      await page.wait(1); // wait 1 second
      textareaFound = await page.evaluate(() =>
        !!document.querySelector('textarea[placeholder="Write something..."], textarea')
      );
      if (textareaFound) break;
    }
    if (!textareaFound) {
      throw new CliError('NO_TEXTAREA', 'Chat textarea not found on the page.', 'The page may have changed.');
    }

    // 4. Check if disabled
    const isDisabled = await page.evaluate(() => {
      const ta = document.querySelector('textarea[placeholder="Write something..."], textarea');
      return ta ? ta.disabled : false;
    });
    if (isDisabled) {
      throw new CliError('INPUT_DISABLED', 'Chat input is disabled (may be waiting for a response).', 'Wait for the current generation to finish.');
    }

    // 5. Optionally select model from dropdown
    if (model) {
      log.status(`Selecting model: ${model}...`);
      const modelSelected = await page.evaluate(async (modelName) => {
        try {
          const buttons = document.querySelectorAll('button[aria-haspopup="dialog"]');
          let modelBtn = null;
          for (const btn of buttons) {
            const text = (btn.textContent || '').trim();
            if (text && text.length < 60) {
              modelBtn = btn;
              break;
            }
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
          for (const opt of options) {
            const text = (opt.innerText || '').trim();
            if (text.toLowerCase().includes(modelName.toLowerCase())) {
              target = opt;
              break;
            }
          }
          if (!target) {
            const all = Array.from(options).map(o => (o.innerText || '').trim()).join(', ');
            return { ok: false, reason: `Model "${modelName}" not found. Available: ${all}` };
          }
          target.click();
          await new Promise(r => setTimeout(r, 500));
          return { ok: true };
        } catch (e) {
          return { ok: false, reason: String(e) };
        }
      }, model);

      if (modelSelected && modelSelected.ok === false) {
        throw new CliError('MODEL_NOT_FOUND', modelSelected.reason, 'Check the model name.');
      }

      // Wait for textarea again after model selection (may re-render)
      try {
        await page.waitForSelector(CHAT_TEXTAREA, { timeout: 8000 });
      } catch (e) {
        throw new CliError('NO_TEXTAREA', 'Chat textarea disappeared after model selection.');
      }
    }

    // 6. Type the prompt
    await page.evaluate((promptText) => {
      const ta = document.querySelector('textarea[placeholder="Write something..."], textarea');
      if (!ta) return;
      ta.focus();
      // Clear and set value
      ta.value = '';
      document.execCommand('selectAll');
      document.execCommand('delete');
      document.execCommand('insertText', false, promptText);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
    }, prompt);

    await page.wait(2); // Let React react to the input

    // 7. Click send
    const sendResult = await page.evaluate(() => {
      const btn = document.querySelector('button[data-id="send"]');
      if (!btn) return { ok: false, reason: 'Send button not found' };
      if (btn.disabled) return { ok: false, reason: 'Send button is disabled' };
      btn.click();
      return { ok: true };
    });

    if (!sendResult.ok) {
      throw new CliError('SEND_FAILED', sendResult.reason, 'Could not click the send button.');
    }

    // 8. Wait for assistant response
    log.status('Waiting for response...');
    let response = '';
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      await page.wait(4);
      response = await getLastAssistantMessage(page);
      if (response && response.trim().length > 0) break;
    }

    if (!response || response.trim().length === 0) {
      return [{ response: '[NO RESPONSE] The model did not return a readable response. Try again or check the ChatLLM web UI.' }];
    }

    return [{ response }];
  },
});
