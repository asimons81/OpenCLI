/**
 * ChatLLM image — generate images using ChatLLM Teams image models.
 *
 * Usage: opencli chatllm image "a cute dog" --model "FLUX.2 [Pro]" --count 2 --ratio 16:9
 *
 * Strategy: COOKIE — requires being logged into apps.abacus.ai in Chrome.
 */
import * as os from 'node:os';
import * as path from 'node:path';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CliError } from '@jackwener/opencli/errors';
import { log } from '@jackwener/opencli/logger';
import { saveBase64ToFile } from '@jackwener/opencli/utils';
import { CHATLLM_IMAGE_URL, ensureOnImageTab, isLoggedOut, IMAGE_MODELS } from './utils.js';

export const imageCommand = cli({
  site: 'chatllm',
  name: 'image',
  description:
    'Generate images using ChatLLM Teams. ' +
    'Supports 25+ models including FLUX.2, GPT Image 1.5, Nano Banana 2, Imagen 4, Midjourney, and more. ' +
    'Requires being logged into apps.abacus.ai in Chrome.',
  domain: CHATLLM_IMAGE_URL,
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  defaultFormat: 'plain',
  timeoutSeconds: 300,
  args: [
    {
      name: 'prompt',
      positional: true,
      required: true,
      type: 'string',
      help: 'Image prompt — describe the image you want to generate',
    },
    {
      name: 'model',
      type: 'string',
      default: 'GPT Image 1.5',
      help: 'Model to use. Examples: "GPT Image 1.5", "Nano Banana 2", "FLUX.2 [Pro]", "Imagen 4", "Midjourney", "Ideogram 3.0"',
    },
    {
      name: 'count',
      type: 'int',
      default: 1,
      help: 'Number of images to generate (1-4)',
    },
    {
      name: 'ratio',
      type: 'string',
      default: '',
      help: 'Aspect ratio, e.g. "16:9", "9:16", "1:1", "4:3"',
    },
    {
      name: 'no-edit',
      type: 'boolean',
      default: false,
      help: 'Skip "Modify prompt" toggle (AI prompt enhancement)',
    },
    {
      name: 'output',
      type: 'string',
      default: '',
      help: 'Output directory for downloaded images',
    },
    {
      name: 'no-download',
      type: 'boolean',
      default: false,
      help: 'Only generate, skip download (shows image URLs)',
    },
  ],
  columns: ['status', 'file', 'model'],
  func: async (page, kwargs) => {
    const prompt = kwargs.prompt;
    const model = kwargs.model || 'GPT Image 1.5';
    const count = Math.min(4, Math.max(1, parseInt(kwargs.count, 10) || 1));
    const ratio = String(kwargs.ratio || '').trim();
    const noEdit = kwargs['no-edit'] === true || String(kwargs['no-edit']).toLowerCase() === 'true';
    const noDownload = kwargs['no-download'] === true || String(kwargs['no-download']).toLowerCase() === 'true';
    const outputDir = kwargs.output || path.join(os.homedir(), 'tmp', 'chatllm-images');

    // 1. Navigate to Image tab
    await ensureOnImageTab(page);

    // 2. Check if logged out
    if (await isLoggedOut(page)) {
      throw new CliError(
        'NOT_LOGGED_IN',
        'Not logged into ChatLLM. Please sign in to apps.abacus.ai in Chrome.',
        'Open Chrome, go to https://apps.abacus.ai/chatllm, sign in with Google, then try again.'
      );
    }

    await page.wait(2);

    // 3. Select model from combobox
    log.status(`Selecting model: ${model}...`);
    const modelSelected = await page.evaluate(async (modelName) => {
      // Find the model combobox (it's the first combobox on the image form)
      const comboboxes = document.querySelectorAll('[role="combobox"]');
      if (!comboboxes.length) return { ok: false, reason: 'No comboboxes found on image form' };

      // Click the first combobox (model selector)
      const modelCb = comboboxes[0];
      modelCb.click();
      await new Promise(r => setTimeout(r, 800));

      const listboxId = modelCb.getAttribute('aria-controls');
      if (!listboxId) return { ok: false, reason: 'No aria-controls on model combobox' };
      const listbox = document.getElementById(listboxId);
      if (!listbox) return { ok: false, reason: 'Model listbox not found' };

      // Find the option
      const options = listbox.querySelectorAll('[role="option"], [role="presentation"]');
      let target = null;
      for (const opt of options) {
        const text = (opt.innerText || '').trim();
        if (text.toLowerCase().includes(modelName.toLowerCase()) || modelName.toLowerCase().includes(text.toLowerCase())) {
          target = opt;
          break;
        }
      }
      if (!target) {
        const allTexts = Array.from(options).map(o => (o.innerText || '').trim()).filter(Boolean).join(', ');
        return { ok: false, reason: `Model "${modelName}" not found. Available: ${allTexts}` };
      }
      target.click();
      await new Promise(r => setTimeout(r, 500));
      return { ok: true };
    }, model);

    if (modelSelected && modelSelected.ok === false) {
      throw new CliError('MODEL_NOT_FOUND', modelSelected.reason, 'Check the model name.');
    }

    // 4. Set count if not 1
    if (count > 1) {
      await page.evaluate(async (n) => {
        const comboboxes = document.querySelectorAll('[role="combobox"]');
        if (comboboxes.length < 2) return;
        const countCb = comboboxes[1]; // Second combobox is "Number of Images"
        countCb.click();
        await new Promise(r => setTimeout(r, 500));
        const listboxId = countCb.getAttribute('aria-controls');
        if (!listboxId) return;
        const listbox = document.getElementById(listboxId);
        if (!listbox) return;
        const options = listbox.querySelectorAll('[role="option"]');
        for (const opt of options) {
          const text = (opt.innerText || '').trim();
          if (text === String(n)) {
            opt.click();
            break;
          }
        }
        await new Promise(r => setTimeout(r, 300));
      }, count);
    }

    // 5. Toggle off "Modify prompt" if requested
    if (noEdit) {
      await page.evaluate(async () => {
        const switchBtn = document.querySelector('[role="switch"]');
        if (!switchBtn) return;
        const isOn = switchBtn.getAttribute('aria-checked') === 'true';
        if (isOn) {
          switchBtn.click();
          await new Promise(r => setTimeout(r, 300));
        }
      });
    }

    // 6. Set ratio if provided
    if (ratio) {
      await page.evaluate(async (r) => {
        const comboboxes = document.querySelectorAll('[role="combobox"]');
        // Find the ratio combobox (should be the one with current value like "1024x1024")
        for (const cb of comboboxes) {
          const text = (cb.innerText || '').trim();
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
              if (t.includes(r) || t === r) {
                opt.click();
                return;
              }
            }
            // Close without selecting
            document.body.click();
            break;
          }
        }
      }, ratio);
    }

    // 7. Enter the prompt
    log.status(`Entering prompt: "${prompt.substring(0, 60)}${prompt.length > 60 ? '...' : ''}"...`);
    await page.typeText('textarea', prompt);
    const promptDebug = await page.getFormState();
    console.log('[DEBUG] image prompt state:', JSON.stringify(promptDebug));
    await page.wait(1);

    // 8. Scroll up to find and click "Create Image" button
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      for (const btn of btns) {
        const text = (btn.innerText || '').trim();
        if (text === 'Create Image') {
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

    log.status('Generating image (this may take a while)...');

    // 10. Poll for results — wait for generated images to appear
    const results = await page.evaluate(async (expectedCount) => {
      const maxWait = 180; // 3 minutes
      const pollInterval = 4000; // 4 seconds
      const start = Date.now();

      while (Date.now() - start < maxWait * 1000) {
        await new Promise(r => setTimeout(r, pollInterval));

        // Look for generated images — they appear as img elements with src containing various patterns
        // The image result area has a specific structure
        const images = Array.from(document.querySelectorAll('img')).filter(img => {
          const src = img.src || '';
          const width = img.naturalWidth || img.width || 0;
          return width > 100 && (src.includes('abacus.ai') || src.includes('blob:') || src.startsWith('data:') || src.includes('生成的'));
        });

        // Also check for image result containers
        const resultContainers = document.querySelectorAll('[class*="result"], [class*="image-grid"], [class*="gallery"]');

        // Check for a specific loading state
        const isStillGenerating = Array.from(document.querySelectorAll('button[aria-busy="true"], [class*="loading"]')).length > 0;

        if (images.length >= expectedCount && !isStillGenerating) {
          return {
            done: true,
            images: images.slice(0, expectedCount).map(img => ({
              src: img.src,
              width: img.naturalWidth || img.width,
              height: img.naturalHeight || img.height,
            })),
          };
        }
      }

      // Timeout — return what we have
      const images = Array.from(document.querySelectorAll('img')).filter(img => {
        const src = img.src || '';
        const width = img.naturalWidth || img.width || 0;
        return width > 100;
      });
      return {
        done: false,
        images: images.map(img => ({ src: img.src, width: img.naturalWidth, height: img.naturalHeight })),
      };
    }, count);

    if (!results?.images || results.images.length === 0) {
      return [{
        status: 'timeout',
        file: '-',
        model: model,
      }];
    }

    log.status(`Generated ${results.images.length} image(s). Downloading...`);

    if (noDownload) {
      return results.images.map((img, i) => ({
        status: results.done ? 'generated' : 'partial',
        file: img.src.substring(0, 80) + '...',
        model: model,
      }));
    }

    // Download images
    const os2 = await import('node:os');
    const savedFiles = [];
    for (let i = 0; i < results.images.length; i++) {
      const img = results.images[i];
      try {
        let dataUrl = img.src;

        // If it's not a data URL, fetch it
        if (img.src.startsWith('http')) {
          const resp = await fetch(img.src);
          if (!resp.ok) continue;
          const buf = Buffer.from(await resp.arrayBuffer());
          const ext = resp.headers.get('content-type')?.includes('png') ? '.png' : '.jpg';
          dataUrl = `data:${resp.headers.get('content-type') || 'image/jpeg'};base64,${buf.toString('base64')}`;
        }

        const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
        const ts = Date.now();
        const suffix = results.images.length > 1 ? `_${i + 1}` : '';
        const filePath = path.join(outputDir, `chatllm_${ts}${suffix}.jpg`);
        await saveBase64ToFile(base64, filePath);
        savedFiles.push({ status: 'saved', file: filePath, model: model });
      } catch (e) {
        savedFiles.push({ status: 'failed', file: img.src.substring(0, 60), model: model });
      }
    }

    return savedFiles;
  },
});
