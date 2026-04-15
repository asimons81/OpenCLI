/**
 * ChatLLM speech — generate speech / audio using ChatLLM Teams speech providers.
 *
 * Usage:
 *   opencli chatllm speech "Hello, how are you?" --provider elevenlabs --voice Sarah
 *   opencli chatllm speech "Hello" --provider openai --voice alloy
 *   opencli chatllm speech --type tts "Hello world" --voice alice
 *
 * Strategy: COOKIE — requires being logged into apps.abacus.ai in Chrome.
 */
import * as os from 'node:os';
import * as path from 'node:path';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CliError } from '@jackwener/opencli/errors';
import { log } from '@jackwener/opencli/logger';
import { saveBase64ToFile } from '@jackwener/opencli/utils';
import { CHATLLM_BASE, isLoggedOut } from './utils.js';

export const CHATLLM_SPEECH_URL = `${CHATLLM_BASE}/chatllm/nano_banana_2?category=speech`;

/** Known speech providers */
export const SPEECH_PROVIDERS = {
  'ElevenLabs': 'elevenlabs',
  'OpenAI': 'openai',
  'Hume': 'hume',
};

/** Known speech types */
export const SPEECH_TYPES = {
  'Text To Speech': 'Text To Speech',
  'Speech to Text': 'Speech to Text',
  'Speech to Speech': 'Speech to Speech',
};

/** ElevenLabs submodels */
export const ELEVENLABS_SUBMODELS = ['Flash', 'Multilingual', 'ElevenLabs V3'];

/** ElevenLabs voices */
export const ELEVENLABS_VOICES = [
  'Sarah', 'Laura', 'Charlie', 'George', 'Callum', 'River', 'Liam',
  'Alice', 'Matilda', 'Will', 'Jessica', 'Eric', 'Chris', 'Brian',
  'Daniel', 'Lily', 'Bill',
];

/**
 * Navigate to the Speech tab.
 */
export async function ensureOnSpeechTab(page) {
  const current = await page.evaluate('window.location.href');
  if (current.includes('category=speech')) return current;
  await page.goto(CHATLLM_SPEECH_URL);
  await page.wait(2);
  return page.evaluate('window.location.href');
}

export const speechCommand = cli({
  site: 'chatllm',
  name: 'speech',
  description:
    'Generate speech / audio using ChatLLM Teams. ' +
    'Supports Text To Speech, Speech to Text, and Speech to Speech via ElevenLabs, OpenAI, and Hume. ' +
    'Requires being logged into apps.abacus.ai in Chrome.',
  domain: CHATLLM_SPEECH_URL,
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  defaultFormat: 'plain',
  timeoutSeconds: 120,
  args: [
    {
      name: 'prompt',
      positional: true,
      required: false, // false because --file can be used instead
      type: 'string',
      help: 'Text to convert to speech, or path to audio file for STT/S2S',
    },
    {
      name: 'type',
      type: 'string',
      default: 'Text To Speech',
      help: 'Speech type: "Text To Speech", "Speech to Text", "Speech to Speech"',
    },
    {
      name: 'provider',
      type: 'string',
      default: 'ElevenLabs',
      help: 'Provider: "ElevenLabs", "OpenAI", "Hume"',
    },
    {
      name: 'submodel',
      type: 'string',
      default: 'Flash',
      help: 'Submodel for ElevenLabs: "Flash", "Multilingual", "ElevenLabs V3"',
    },
    {
      name: 'voice',
      type: 'string',
      default: 'Sarah',
      help: 'Voice name, e.g. "Sarah", "Laura", "Charlie", "George", "Callum", "River", "Liam", "Alice", "Matilda", "Will", "Jessica", "Eric", "Chris", "Brian", "Daniel", "Lily", "Bill"',
    },
    {
      name: 'file',
      type: 'string',
      default: '',
      help: 'Path to audio file (for Speech to Text / Speech to Speech modes)',
    },
    {
      name: 'output',
      type: 'string',
      default: '',
      help: 'Output file path for generated audio',
    },
    {
      name: 'no-download',
      type: 'boolean',
      default: false,
      help: 'Only generate, skip download (shows audio URL)',
    },
  ],
  columns: ['status', 'file', 'provider', 'voice'],
  func: async (page, kwargs) => {
    const prompt = kwargs.prompt || '';
    const type = kwargs.type || 'Text To Speech';
    const provider = kwargs.provider || 'ElevenLabs';
    const submodel = kwargs.submodel || 'Flash';
    const voice = kwargs.voice || 'Sarah';
    const audioFile = String(kwargs.file || '').trim();
    const noDownload = kwargs['no-download'] === true || String(kwargs['no-download']).toLowerCase() === 'true';
    const outputPath = kwargs.output || '';

    // For STT/S2S, require either prompt (transcription) or audio file
    if ((type === 'Speech to Text' || type === 'Speech to Speech') && !prompt && !audioFile) {
      throw new CliError(
        'MISSING_INPUT',
        'Speech to Text and Speech to Speech require either a text prompt or an audio file.',
        'Provide --prompt "text" or --file /path/to/audio.mp3'
      );
    }

    // 1. Navigate to Speech tab
    await ensureOnSpeechTab(page);

    // 2. Check if logged out
    if (await isLoggedOut(page)) {
      throw new CliError(
        'NOT_LOGGED_IN',
        'Not logged into ChatLLM. Please sign in to apps.abacus.ai in Chrome.',
        'Open Chrome, go to https://apps.abacus.ai/chatllm, sign in with Google, then try again.'
      );
    }

    await page.wait(2);

    // 3. Select Type
    log.status(`Selecting type: ${type}...`);
    const typeSelected = await page.evaluate(async (speechType) => {
      const comboboxes = document.querySelectorAll('[role="combobox"]');
      if (!comboboxes.length) return { ok: false, reason: 'No comboboxes found' };
      const typeCb = comboboxes[0];
      typeCb.click();
      await new Promise(r => setTimeout(r, 800));
      const listboxId = typeCb.getAttribute('aria-controls');
      if (!listboxId) return { ok: false, reason: 'No aria-controls on type combobox' };
      const listbox = document.getElementById(listboxId);
      if (!listbox) return { ok: false, reason: 'Type listbox not found' };
      const options = listbox.querySelectorAll('[role="option"]');
      let target = null;
      for (const opt of options) {
        if ((opt.innerText || '').trim() === speechType) {
          target = opt;
          break;
        }
      }
      if (!target) {
        const all = Array.from(options).map(o => (o.innerText || '').trim()).join(', ');
        return { ok: false, reason: `Type "${speechType}" not found. Available: ${all}` };
      }
      target.click();
      await new Promise(r => setTimeout(r, 500));
      return { ok: true };
    }, type);

    if (typeSelected && typeSelected.ok === false) {
      throw new CliError('TYPE_NOT_FOUND', typeSelected.reason, 'Check the type name.');
    }

    // 4. Select Provider (Model combobox)
    log.status(`Selecting provider: ${provider}...`);
    const providerSelected = await page.evaluate(async (providerName) => {
      const comboboxes = document.querySelectorAll('[role="combobox"]');
      if (comboboxes.length < 2) return { ok: false, reason: 'Provider combobox not found' };
      const modelCb = comboboxes[1];
      modelCb.click();
      await new Promise(r => setTimeout(r, 800));
      const listboxId = modelCb.getAttribute('aria-controls');
      if (!listboxId) return { ok: false, reason: 'No aria-controls on provider combobox' };
      const listbox = document.getElementById(listboxId);
      if (!listbox) return { ok: false, reason: 'Provider listbox not found' };
      const options = listbox.querySelectorAll('[role="option"]');
      let target = null;
      for (const opt of options) {
        const text = (opt.innerText || '').trim();
        if (text.toLowerCase().includes(providerName.toLowerCase())) {
          target = opt;
          break;
        }
      }
      if (!target) {
        const all = Array.from(options).map(o => (o.innerText || '').trim()).join(', ');
        return { ok: false, reason: `Provider "${providerName}" not found. Available: ${all}` };
      }
      target.click();
      await new Promise(r => setTimeout(r, 500));
      return { ok: true };
    }, provider);

    if (providerSelected && providerSelected.ok === false) {
      throw new CliError('PROVIDER_NOT_FOUND', providerSelected.reason, 'Check the provider name.');
    }

    // 5. Select Submodel (only relevant for ElevenLabs)
    if (provider.toLowerCase() === 'elevenlabs' || provider.toLowerCase() === 'ElevenLabs'.toLowerCase()) {
      log.status(`Selecting submodel: ${submodel}...`);
      await page.evaluate(async (submodelName) => {
        const comboboxes = document.querySelectorAll('[role="combobox"]');
        if (comboboxes.length < 3) return;
        const submodelCb = comboboxes[2];
        submodelCb.click();
        await new Promise(r => setTimeout(r, 800));
        const listboxId = submodelCb.getAttribute('aria-controls');
        if (!listboxId) return;
        const listbox = document.getElementById(listboxId);
        if (!listbox) return;
        const options = listbox.querySelectorAll('[role="option"]');
        let target = null;
        for (const opt of options) {
          if ((opt.innerText || '').trim() === submodelName) {
            target = opt;
            break;
          }
        }
        if (target) target.click();
        await new Promise(r => setTimeout(r, 500));
      }, submodel);
    }

    // 6. Select Voice
    log.status(`Selecting voice: ${voice}...`);
    const voiceSelected = await page.evaluate(async (voiceName) => {
      const comboboxes = document.querySelectorAll('[role="combobox"]');
      // Voice is the 4th combobox (index 3)
      const voiceCb = comboboxes[3];
      if (!voiceCb) return { ok: false, reason: 'Voice combobox not found' };
      voiceCb.click();
      await new Promise(r => setTimeout(r, 800));
      const listboxId = voiceCb.getAttribute('aria-controls');
      if (!listboxId) return { ok: false, reason: 'No aria-controls on voice combobox' };
      const listbox = document.getElementById(listboxId);
      if (!listbox) return { ok: false, reason: 'Voice listbox not found' };
      const options = listbox.querySelectorAll('[role="option"]');
      let target = null;
      for (const opt of options) {
        const text = (opt.innerText || '').trim();
        if (text.toLowerCase() === voiceName.toLowerCase()) {
          target = opt;
          break;
        }
      }
      if (!target) {
        const all = Array.from(options).map(o => (o.innerText || '').trim()).join(', ');
        return { ok: false, reason: `Voice "${voiceName}" not found. Available: ${all}` };
      }
      target.click();
      await new Promise(r => setTimeout(r, 500));
      return { ok: true };
    }, voice);

    if (voiceSelected && voiceSelected.ok === false) {
      throw new CliError('VOICE_NOT_FOUND', voiceSelected.reason, 'Check the voice name.');
    }

    // 7. Enter script
    if (type === 'Text To Speech' && prompt) {
      log.status(`Entering script: "${prompt.substring(0, 60)}${prompt.length > 60 ? '...' : ''}"...`);
      await page.typeText('textarea', prompt);
      const promptDebug = await page.getFormState();
      console.log('[DEBUG] speech prompt state:', JSON.stringify(promptDebug));
    }

    // 9. Click the submit button
    const generateClicked = await page.evaluate(() => {
      const submit = document.querySelector('button[data-id="send"]');
      if (!submit || submit.disabled) return false;
      submit.click();
      return true;
    });

    if (!generateClicked) {
      log.status('Submit click target not confirmed; continuing to poll for generation state...');
    }

    log.status('Generating audio (this may take a moment)...');

    // 9. Poll for result
    const result = await page.evaluate(async () => {
      const maxWait = 90; // 90 seconds
      const pollInterval = 3000; // 3 seconds
      const start = Date.now();

      while (Date.now() - start < maxWait * 1000) {
        await new Promise(r => setTimeout(r, pollInterval));

        // Look for audio element or download link
        const audioEl = document.querySelector('audio');
        const links = Array.from(document.querySelectorAll('a[href]')).filter(a => {
          const href = a.href || '';
          return href.includes('.mp3') || href.includes('.wav') || href.includes('audio') || href.includes('speech') || href.includes('download');
        });

        if (audioEl && audioEl.src) {
          return { done: true, url: audioEl.src, type: 'audio_element' };
        }
        if (links.length > 0) {
          return { done: true, url: links[0].href, type: 'download_link' };
        }
      }

      // Timeout — return what we have
      const audioEl = document.querySelector('audio');
      if (audioEl && audioEl.src) return { done: false, url: audioEl.src, type: 'audio_element' };

      return { done: false, url: null };
    });

    if (!result?.url) {
      return [{
        status: 'timeout',
        file: '-',
        provider,
        voice,
      }];
    }

    if (noDownload) {
      return [{
        status: result.done ? 'generated' : 'partial',
        file: result.url,
        provider,
        voice,
      }];
    }

    // Download audio
    const outputFile = outputPath || path.join(os.homedir(), 'tmp', 'chatllm-speech', `chatllm_speech_${Date.now()}.mp3`);
    try {
      const resp = await fetch(result.url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      const ext = resp.headers.get('content-type')?.includes('wav') ? '.wav' : '.mp3';
      await import('node:fs').then(fs => {
        fs.mkdirSync(path.dirname(outputFile), { recursive: true });
        fs.writeFileSync(outputFile, buf);
      });
      return [{
        status: 'saved',
        file: outputFile,
        provider,
        voice,
      }];
    } catch (e) {
      return [{
        status: 'download-failed',
        file: result.url,
        provider,
        voice,
      }];
    }
  },
});
