import OpenAI from 'openai';
import { BaseProvider } from './base.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

export class GoogleProvider extends BaseProvider {
  get id() {
    return 'google';
  }

  get name() {
    return 'Google AI Studio';
  }

  get hasFreeTier() {
    return true;
  }

  isAvailable(apiKey) {
    return typeof apiKey === 'string' && apiKey.length > 10;
  }

  getApiKey(env = process.env) {
    return env.GOOGLE_API_KEY || env.GEMINI_API_KEY || null;
  }

  createClient(apiKey) {
    return new OpenAI({ apiKey, baseURL: BASE_URL, maxRetries: 0 });
  }

  async fetchModels() {
    const apiKey = this.getApiKey();
    if (!apiKey) return [];

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) throw new Error(`Google model list fetch failed: HTTP ${res.status}`);
    const { models } = await res.json();

    return (models || [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => ({
        id: m.name.replace('models/', ''),
        name: m.displayName || m.name,
        context: m.inputTokenLimit || 8192,
        pricing: { prompt: '0', completion: '0' },
        supported_parameters: ['tools'],
        provider: this.id,
      }));
  }

  filterFreeToolModels(models) {
    return models.filter((m) => m.supported_parameters?.includes('tools'));
  }
}