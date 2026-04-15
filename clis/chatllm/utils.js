/**
 * ChatLLM utilities — Abacus AI ChatLLM Teams browser automation helpers.
 *
 * Site: apps.abacus.ai/chatllm
 * Auth: Browser session cookies (logged in via Google Chrome)
 */
export const CHATLLM_DOMAIN = 'apps.abacus.ai';
export const CHATLLM_BASE = 'https://apps.abacus.ai';
export const CHATLLM_CHAT_URL = (model = 'nano_banana_2') =>
  `${CHATLLM_BASE}/chatllm/${model}?sidebar=1&category=featured`;
export const CHATLLM_IMAGE_URL = `${CHATLLM_BASE}/chatllm/nano_banana_2?category=image`;
export const CHATLLM_VIDEO_URL = `${CHATLLM_BASE}/chatllm/nano_banana_2?category=video`;
export const CHATLLM_SPEECH_URL = `${CHATLLM_BASE}/chatllm/nano_banana_2?category=speech`;

// ─── Image Models (from Phase 2 exploration) ─────────────────────────────────
export const IMAGE_MODELS = {
  'FLUX 1.1 [pro] Ultra':    'flux-1.1-pro-ultra',
  'FLUX.1 Kontext':          'flux-1-kontext',
  'FLUX.1 Kontext [Edit]':   'flux-1-kontext-edit',
  'FLUX.2':                   'flux-2',
  'FLUX.2 [Pro]':             'flux-2-pro',
  'GPT Image 1.5':           'gpt-image-1.5',
  'GPT Image 1.5 [Edit]':    'gpt-image-1.5-edit',
  'Grok Imagine Image':       'grok-imagine-image',
  'Hunyuan Image 3.0':       'hunyuan-image-3.0',
  'Ideogram 3.0':             'ideogram-3.0',
  'Ideogram Character':       'ideogram-character',
  'Imagineart 1.5':           'imagineart-1.5',
  'Magnific Upscaler':       'magnific-upscaler',
  'Midjourney':               'midjourney',
  'Nano Banana':              'nano-banana',
  'Nano Banana 2':           'nano-banana-2',
  'Nano Banana Pro':          'nano-banana-pro',
  'Qwen Image Edit':         'qwen-image-edit',
  'Recraft':                  'recraft',
  'Recraft SVG':              'recraft-svg',
  'Seedream 4.5':            'seedream-4.5',
  'Wan 2.7':                  'wan-2.7',
  'Dreamina':                  'dreamina',
};

// ─── Video Models (from Phase 2 exploration) ───────────────────────────────────
export const VIDEO_MODELS = {
  'Kling AI v2.6':               'kling-ai-v2.6',
  'Kling AI v3':                 'kling-ai-v3',
  'Kling AI O3':                 'kling-ai-o3',
  'Kling v2.6 Motion Control':   'kling-v2.6-motion-control',
  'Grok Imagine Video':          'grok-imagine-video',
  'Sora 2':                      'sora-2',
  'Seedance 2.0':                'seedance-2.0',
  'Seedance 1.5 Pro':           'seedance-1.5-pro',
  'Seedance Pro':               'seedance-pro',
  'Wan 2.5':                     'wan-2.5',
  'Wan 2.2':                      'wan-2.2',
  'Hailuo 2':                    'hailuo-2',
  'Luma Labs':                   'luma-labs',
  'Runway':                       'runway',
  'Veo 3.1':                     'veo-3.1',
  'Veo 3.1 Lite':               'veo-3.1-lite',
  'Topaz Upscaler':              'topaz-upscaler',
};

// ─── Text Models (from Phase 2 exploration) ───────────────────────────────────
export const TEXT_MODELS = [
  'Abacus.AI Smaug',
  'Claude Haiku 4.5',
  'Claude Opus 4.6',
  'Claude Sonnet 4.6',
  'GLM 5.1',
  'GPT-5.3 Codex',
  'GPT-5.3 Instant',
  'GPT-5.4',
  'GPT-5.4 Mini',
  'GPT-5.4 Pro',
  'GPT-5.4 Thinking',
  'Gemini 3 Flash',
  'Gemini 3.1 Flash Lite',
  'Gemini 3.1 Pro',
  'Grok 4.1 Fast',
  'Grok 4.2',
  'Grok Code Fast',
  'Kimi K2.5',
  'Llama4 Maverick',
  'MiniMax M2.7',
  'Nano Banana',
  'Nano Banana 2',
  'Nano Banana Pro',
  'Perplexity Pro',
  'Qwen3.6',
  'RouteLLM',
  'SearchLLM',
];

// ─── Speech Providers ─────────────────────────────────────────────────────────
export const SPEECH_PROVIDERS = ['ElevenLabs', 'OpenAI', 'Hume'];
export const SPEECH_TYPES = ['Text To Speech', 'Speech to Text', 'Speech to Speech'];
export const ELEVENLABS_SUBMODELS = ['Flash', 'Multilingual', 'ElevenLabs V3'];
export const ELEVENLABS_VOICES = [
  'Sarah', 'Laura', 'Charlie', 'George', 'Callum', 'River', 'Liam',
  'Alice', 'Matilda', 'Will', 'Jessica', 'Eric', 'Chris', 'Brian',
  'Daniel', 'Lily', 'Bill',
];

/**
 * Navigate to the ChatLLM chat interface (or verify we're already there).
 * Returns the page URL after navigation.
 */
export async function ensureOnChatLLM(page, model = null) {
  const url = model ? CHATLLM_CHAT_URL(model) : CHATLLM_BASE + '/chatllm';
  const current = await page.evaluate('window.location.href');
  if (current.includes('/chatllm')) {
    return current;
  }
  await page.goto(url);
  await page.wait(2);
  return page.evaluate('window.location.href');
}

async function clickSidebarLabel(page, label) {
  try {
    await page.locator(`text=${label}`).first().click({ timeout: 5000 });
    await page.wait(2);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

/**
 * Navigate to the Image tab.
 */
export async function ensureOnImageTab(page) {
  await page.goto(CHATLLM_IMAGE_URL);
  await page.wait(2);
  await clickSidebarLabel(page, 'Image');
  await page.wait(2);
  return page.evaluate('window.location.href');
}

/**
 * Navigate to the Video tab.
 */
export async function ensureOnVideoTab(page) {
  await page.goto(CHATLLM_VIDEO_URL);
  await page.wait(2);
  await clickSidebarLabel(page, 'Video');
  await page.wait(2);
  return page.evaluate('window.location.href');
}

/**
 * Navigate to the Speech tab.
 */
export async function ensureOnSpeechTab(page) {
  await page.goto(CHATLLM_SPEECH_URL);
  await page.wait(2);
  await clickSidebarLabel(page, 'Speech');
  await page.wait(2);
  return page.evaluate('window.location.href');
}

/**
 * Count existing message bubbles on the page.
 * Messages are divs with "prose dark:prose-invert markdown" class inside the scroll container.
 */
export async function countMessages(page) {
  return page.evaluate(`
    document.querySelectorAll('#scroll-helper-bottom .prose.markdown, #scroll-helper-bottom [class*="prose"]').length
  `);
}

/**
 * Get the last assistant message text.
 * Assistant messages are the LAST prose element inside #scroll-helper-bottom.
 * They always start with "Thought for X seconds".
 * User messages are the same pattern but start with the user's text.
 */
export async function getLastAssistantMessage(page) {
  return page.evaluate(`
    (() => {
      const els = document.querySelectorAll('#scroll-helper-bottom [class*="prose"]');
      if (els.length === 0) return '';
      const last = els[els.length - 1];
      const txt = (last.innerText || '').trim();
      // Assistant messages start with "Thought for"
      if (txt.startsWith('Thought for')) {
        return txt.replace(/^Thought for[^\n]*\n+/, '').trim();
      }
      return '';
    })()
  `);
}

/**
 * Wait for a new assistant message to appear.
 * Returns the message text when stable, or empty string on timeout.
 */
export async function waitForNewAssistantMessage(page, baselineCount, timeoutSec = 120) {
  const deadline = Date.now() + timeoutSec * 1000;
  let lastText = '';
  let stableCount = 0;

  while (Date.now() < deadline) {
    await page.wait(3);
    const text = await getLastAssistantMessage(page);
    if (text && text !== lastText) {
      lastText = text;
      stableCount = 0;
    } else if (text && text === lastText && text.length > 0) {
      stableCount++;
      if (stableCount >= 2) return lastText;
    }
  }
  return lastText;
}

/**
 * Click a combobox option by its display text.
 * Returns true if found and clicked.
 */
export async function selectComboboxOption(page, comboboxSelector, optionText) {
  const result = await page.evaluate(async (opts) => {
    const { comboboxSelector, optionText } = opts;
    const btn = document.querySelector(comboboxSelector);
    if (!btn) return { ok: false, reason: 'Combobox not found: ' + comboboxSelector };
    const listboxId = btn.getAttribute('aria-controls');
    if (!listboxId) return { ok: false, reason: 'No aria-controls on combobox' };
    const listbox = document.getElementById(listboxId);
    if (!listbox) return { ok: false, reason: 'Listbox not found: ' + listboxId };

    const options = listbox.querySelectorAll('[role="option"], [role="presentation"]');
    let target = null;
    for (const opt of options) {
      const text = (opt.innerText || '').trim();
      if (text === optionText || text.includes(optionText)) {
        target = opt;
        break;
      }
    }
    if (!target) {
      const allTexts = Array.from(options).map(o => (o.innerText || '').trim()).join(', ');
      return { ok: false, reason: `Option "${optionText}" not found. Available: ${allTexts}` };
    }
    target.click();
    return { ok: true };
  }, { comboboxSelector, optionText });
  return result;
}

/**
 * Check if the page shows a sign-in screen (not logged in).
 */
export async function isLoggedOut(page) {
  return page.evaluate(`
    document.body.innerText.includes('Sign in to ChatLLM') ||
    document.body.innerText.includes('Sign in with Google')
  `);
}
