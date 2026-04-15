/**
 * ChatLLM models — list all available models for text, image, video, and speech.
 *
 * Usage: opencli chatllm models [--type text|image|video|speech|all]
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  CHATLLM_DOMAIN,
  IMAGE_MODELS,
  VIDEO_MODELS,
  TEXT_MODELS,
  SPEECH_PROVIDERS,
  SPEECH_TYPES,
  ELEVENLABS_SUBMODELS,
  ELEVENLABS_VOICES,
} from './utils.js';

export const modelsCommand = cli({
  site: 'chatllm',
  name: 'models',
  description:
    'List all available models in ChatLLM Teams — text, image, video, and speech. ' +
    'Use --type to filter by category.',
  domain: CHATLLM_DOMAIN,
  strategy: Strategy.COOKIE,
  browser: false,
  args: [
    {
      name: 'type',
      type: 'string',
      default: 'all',
      help: 'Type filter: text, image, video, speech, or all',
    },
  ],
  columns: ['type', 'model', 'display'],
  func: async (_page, kwargs) => {
    const type = String(kwargs.type || 'all').toLowerCase();
    const rows = [];

    if (type === 'all' || type === 'text') {
      for (const model of TEXT_MODELS) {
        rows.push({
          type: 'text',
          model: model.toLowerCase().replace(/\s+/g, '_').replace(/\./g, ''),
          display: model,
        });
      }
    }

    if (type === 'all' || type === 'image') {
      for (const [display] of Object.entries(IMAGE_MODELS)) {
        rows.push({
          type: 'image',
          model: display
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/\./g, '')
            .replace(/\[|\]/g, ''),
          display,
        });
      }
    }

    if (type === 'all' || type === 'video') {
      for (const [display] of Object.entries(VIDEO_MODELS)) {
        rows.push({
          type: 'video',
          model: display.toLowerCase().replace(/\s+/g, '_').replace(/\./g, ''),
          display,
        });
      }
    }

    if (type === 'all' || type === 'speech') {
      // Speech types
      for (const t of SPEECH_TYPES) {
        rows.push({ type: 'speech', model: 'type:' + t.toLowerCase().replace(/\s+/g, '_'), display: t });
      }
      // Providers
      for (const p of SPEECH_PROVIDERS) {
        rows.push({ type: 'speech', model: 'provider:' + p.toLowerCase(), display: p });
      }
      // ElevenLabs submodels
      for (const s of ELEVENLABS_SUBMODELS) {
        rows.push({ type: 'speech', model: 'submodel:' + s.toLowerCase().replace(/\s+/g, '_'), display: s });
      }
      // ElevenLabs voices
      for (const v of ELEVENLABS_VOICES) {
        rows.push({ type: 'speech', model: 'voice:' + v.toLowerCase(), display: v });
      }
    }

    return rows;
  },
});
