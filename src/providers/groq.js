import OpenAI from 'openai';
import { BaseProvider } from './base.js';

const BASE_URL = 'https://api.groq.com/openai/v1';

export class GroqProvider extends BaseProvider {
  get id() {
    return 'groq';
  }

  get name() {
    return 'Groq';
  }

  get hasFreeTier() {
    return true;
  }

  isAvailable(apiKey) {
    return typeof apiKey === 'string' && apiKey.startsWith('gsk_');
  }

  getApiKey(env = process.env) {
    return env.GROQ_API_KEY || null;
  }

  createClient(apiKey) {
    return new OpenAI({ apiKey, baseURL: BASE_URL, maxRetries: 0 });
  }

  async fetchModels(apiKey = this.getApiKey()) {
    if (!apiKey) return [];

    const res = await fetch(`${BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Groq model list fetch failed: HTTP ${res.status}`);
    const { data } = await res.json();

    return (data || [])
      .filter((m) => m.active && !m.id.includes('whisper'))
      .map((m) => ({
        id: m.id,
        name: m.id,
        context: m.context_window || 8192,
        pricing: { prompt: '0', completion: '0' },
        supported_parameters: ['tools'],
        provider: this.id,
      }));
  }

  filterFreeToolModels(models) {
    return models.filter((m) => m.supported_parameters?.includes('tools'));
  }
}
