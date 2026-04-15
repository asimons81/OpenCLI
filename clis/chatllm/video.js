/**
 * ChatLLM video — generate videos using ChatLLM Teams video models.
 *
 * Usage: opencli chatllm video "a cat playing piano" --model "Kling AI v2.6" --type "Text To Video" --ratio 16:9 --duration 5
 *
 * Strategy: COOKIE — requires being logged into apps.abacus.ai in Chrome.
 */
import * as os from 'node:os';
import * as path from 'node:path';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CliError } from '@jackwener/opencli/errors';
import { log } from '@jackwener/opencli/logger';
import { CHATLLM_VIDEO_URL, ensureOnVideoTab, isLoggedOut } from './utils.js';

export const videoCommand = cli({
  site: 'chatllm',
  name: 'video',
  description:
    'Generate videos using ChatLLM Teams. ' +
    'Supports 17+ models including Kling AI v2.6, Sora 2, Veo 3.1, Seedance, Runway, Hailuo 2, and more. ' +
    'Requires being logged into apps.abacus.ai in Chrome.',
  domain: CHATLLM_VIDEO_URL,
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  defaultFormat: 'plain',
  timeoutSeconds: 600,
  args: [
    {
      name: 'prompt',
      positional: true,
      required: true,
      type: 'string',
      help: 'Video prompt — describe the video you want to generate',
    },
    {
      name: 'model',
      type: 'string',
      default: 'Kling AI v2.6',
      help: 'Video model. Examples: "Kling AI v2.6", "Sora 2", "Veo 3.1", "Seedance 2.0", "Runway", "Hailuo 2"',
    },
    {
      name: 'type',
      type: 'string',
      default: 'Text To Video',
      help: 'Video type: "Text To Video", "Image To Video", "Video To Video", "Lip Sync"',
    },
    {
      name: 'ratio',
      type: 'string',
      default: '16:9',
      help: 'Aspect ratio: "16:9", "9:16", "1:1", "4:3"',
    },
    {
      name: 'duration',
      type: 'int',
      default: 5,
      help: 'Video duration in seconds (5, 10)',
    },
    {
      name: 'image',
      type: 'string',
      default: '',
      help: 'Input image URL for Image To Video mode',
    },
    {
      name: 'output',
      type: 'string',
      default: '',
      help: 'Output directory for downloaded video',
    },
    {
      name: 'no-download',
      type: 'boolean',
      default: false,
      help: 'Only generate, skip download (shows video URL)',
    },
  ],
  columns: ['status', 'file', 'model'],
  func: async (page, kwargs) => {
    const prompt = kwargs.prompt;
    const model = kwargs.model || 'Kling AI v2.6';
    const type = kwargs.type || 'Text To Video';
    const ratio = kwargs.ratio || '16:9';
    const duration = parseInt(kwargs.duration, 10) || 5;
    const imageUrl = String(kwargs.image || '').trim();
    const noDownload = kwargs['no-download'] === true || String(kwargs['no-download']).toLowerCase() === 'true';
    const outputDir = kwargs.output || path.join(os.homedir(), 'tmp', 'chatllm-videos');

    // 1. Navigate to Video tab
    await ensureOnVideoTab(page);

    // 2. Check if logged out
    if (await isLoggedOut(page)) {
      throw new CliError(
        'NOT_LOGGED_IN',
        'Not logged into ChatLLM. Please sign in to apps.abacus.ai in Chrome.',
        'Open Chrome, go to https://apps.abacus.ai/chatllm, sign in with Google, then try again.'
      );
    }

    await page.wait(2);

    // 3. Select video type
    log.status(`Selecting type: ${type}...`);
    await page.evaluate(async (videoType) => {
      const comboboxes = document.querySelectorAll('[role="combobox"]');
      if (!comboboxes.length) return;
      const typeCb = comboboxes[0];
      typeCb.click();
      await new Promise(r => setTimeout(r, 800));
      const listboxId = typeCb.getAttribute('aria-controls');
      if (!listboxId) return;
      const listbox = document.getElementById(listboxId);
      if (!listbox) return;
      const options = listbox.querySelectorAll('[role="option"]');
      for (const opt of options) {
        if ((opt.innerText || '').trim() === videoType) {
          opt.click();
          break;
        }
      }
      await new Promise(r => setTimeout(r, 500));
    }, type);

    // 4. Select model
    log.status(`Selecting model: ${model}...`);
    const modelSelected = await page.evaluate(async (modelName) => {
      const comboboxes = document.querySelectorAll('[role="combobox"]');
      if (comboboxes.length < 2) return { ok: false, reason: 'Not enough comboboxes found' };
      const modelCb = comboboxes[1];
      modelCb.click();
      await new Promise(r => setTimeout(r, 800));
      const listboxId = modelCb.getAttribute('aria-controls');
      if (!listboxId) return { ok: false, reason: 'No aria-controls on model combobox' };
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
        const all = Array.from(options).map(o => (o.innerText || '').trim()).filter(Boolean).join(', ');
        return { ok: false, reason: `Model "${modelName}" not found. Available: ${all}` };
      }
      target.click();
      await new Promise(r => setTimeout(r, 500));
      return { ok: true };
    }, model);

    if (modelSelected && modelSelected.ok === false) {
      throw new CliError('MODEL_NOT_FOUND', modelSelected.reason, 'Check the model name.');
    }

    // 5. Select ratio
    await page.evaluate(async (r) => {
      const comboboxes = document.querySelectorAll('[role="combobox"]');
      for (const cb of comboboxes) {
        const text = (cb.innerText || '').trim();
        if (text === r) return; // Already selected
        if (text.match(/\d+:\d+/) || text.match(/\d+x\d+/)) {
          cb.click();
          await new Promise(res => setTimeout(res, 500));
          const listboxId = cb.getAttribute('aria-controls');
          if (!listboxId) continue;
          const listbox = document.getElementById(listboxId);
          if (!listbox) continue;
          const options = listbox.querySelectorAll('[role="option"]');
          for (const opt of options) {
            const t = (opt.innerText || '').trim();
            if (t === r) { opt.click(); return; }
          }
          document.body.click();
          break;
        }
      }
    }, ratio);
    await page.wait(0.5);

    // 6. Select duration (look for a combobox with 5/10 as options)
    await page.evaluate(async (dur) => {
      const comboboxes = document.querySelectorAll('[role="combobox"]');
      for (const cb of comboboxes) {
        const text = (cb.innerText || '').trim();
        if (text === String(dur)) return; // Already selected
        cb.click();
        await new Promise(res => setTimeout(res, 500));
        const listboxId = cb.getAttribute('aria-controls');
        if (!listboxId) { document.body.click(); continue; }
        const listbox = document.getElementById(listboxId);
        if (!listbox) { document.body.click(); continue; }
        const options = listbox.querySelectorAll('[role="option"]');
        let found = false;
        for (const opt of options) {
          if ((opt.innerText || '').trim() === String(dur)) {
            opt.click();
            found = true;
            break;
          }
        }
        if (found) break;
        document.body.click();
        break;
      }
    }, duration);
    await page.wait(0.5);

    // 7. Enter prompt — find the prompt textarea in the video form
    log.status(`Entering prompt: "${prompt.substring(0, 60)}${prompt.length > 60 ? '...' : ''}"...`);
    await page.typeText('textarea', prompt);

    await page.wait(1);

    // 8. Scroll up to find "Create Video" button
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      for (const btn of btns) {
        const text = (btn.innerText || '').trim();
        if (text === 'Create Video') {
          btn.scrollIntoView({ block: 'start' });
          return;
        }
      }
    });
    await page.wait(1);

    // 9. Click the submit button
    const createClicked = await page.evaluate(() => {
      const submit = document.querySelector('button[data-id="send"]');
      if (!submit || submit.disabled) return false;
      submit.click();
      return true;
    });
    if (!createClicked) {
      log.status('Submit click target not confirmed; continuing to poll for generation state...');
    }

    log.status('Generating video (this may take a while — up to a few minutes)...');

    // 10. Poll for result
    const result = await page.evaluate(async () => {
      const maxWait = 540; // 9 minutes for video
      const pollInterval = 8000;
      const start = Date.now();

      while (Date.now() - start < maxWait * 1000) {
        await new Promise(r => setTimeout(r, pollInterval));

        // Look for video player or download link
        const videoEl = document.querySelector('video');
        const links = Array.from(document.querySelectorAll('a[href]')).filter(a => {
          const href = a.href || '';
          return href.includes('.mp4') || href.includes('video') || href.includes('download');
        });

        // Check for result area
        const resultText = Array.from(document.querySelectorAll('[class*="result"], [class*="output"]'))
          .map(el => (el.innerText || '').trim()).filter(Boolean);

        if (videoEl && videoEl.src) {
          return { done: true, url: videoEl.src, type: 'video_element' };
        }
        if (links.length > 0) {
          return { done: true, url: links[0].href, type: 'download_link' };
        }
      }

      // Timeout — check what we have
      const videoEl = document.querySelector('video');
      if (videoEl && videoEl.src) return { done: false, url: videoEl.src, type: 'video_element' };

      return { done: false, url: null };
    });

    if (!result?.url) {
      return [{
        status: 'timeout',
        file: '-',
        model: model,
      }];
    }

    if (noDownload) {
      return [{
        status: result.done ? 'generated' : 'partial',
        file: result.url,
        model: model,
      }];
    }

    // Download video
    try {
      const resp = await fetch(result.url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      const ts = Date.now();
      const filePath = path.join(outputDir, `chatllm_${ts}.mp4`);
      await import('node:fs').then(fs => {
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(filePath, buf);
      });
      return [{
        status: 'saved',
        file: filePath,
        model: model,
      }];
    } catch (e) {
      return [{
        status: 'download-failed',
        file: result.url,
        model: model,
      }];
    }
  },
});
