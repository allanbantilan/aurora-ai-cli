import OpenAI from 'openai';
import { BaseProvider } from './base.js';

const BASE_URL = 'https://api.mistral.ai/v1';

export class MistralProvider extends BaseProvider {
  get id() {
    return 'mistral';
  }

  get name() {
    return 'Mistral';
  }

  get hasFreeTier() {
    return true;
  }

  isAvailable(apiKey) {
    return typeof apiKey === 'string' && apiKey.length > 10;
  }

  getApiKey(env = process.env) {
    return env.MISTRAL_API_KEY || null;
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
    if (!res.ok) throw new Error(`Mistral model list fetch failed: HTTP ${res.status}`);
    const { data } = await res.json();

    return (data || [])
      .filter((m) => m.capabilities?.includes('function_calling'))
      .map((m) => ({
        id: m.id,
        name: m.id,
        context: m.max_context_length || 32000,
        pricing: { prompt: '0', completion: '0' },
        supported_parameters: ['tools'],
        provider: this.id,
      }));
  }

  filterFreeToolModels(models) {
    return models.filter((m) => m.supported_parameters?.includes('tools'));
  }
}
