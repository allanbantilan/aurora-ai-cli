import OpenAI from 'openai';
import { BaseProvider } from './base.js';

const BASE_URL = 'https://openrouter.ai/api/v1';

export class OpenRouterProvider extends BaseProvider {
  get id() {
    return 'openrouter';
  }

  get name() {
    return 'OpenRouter';
  }

  get hasFreeTier() {
    return true;
  }

  isAvailable(apiKey) {
    return typeof apiKey === 'string' && apiKey.startsWith('sk-');
  }

  getApiKey(env = process.env, config = {}) {
    return env.OPENROUTER_API_KEY || config.apiKey || null;
  }

  createClient(apiKey) {
    return new OpenAI({ apiKey, baseURL: BASE_URL, maxRetries: 0 });
  }

  async fetchModels(_apiKey) {
    const res = await fetch(`${BASE_URL}/models`);
    if (!res.ok) throw new Error(`OpenRouter model list fetch failed: HTTP ${res.status}`);
    const { data } = await res.json();
    return data.map((m) => ({
      id: m.id,
      name: m.name,
      context: m.context_length,
      pricing: m.pricing,
      supported_parameters: m.supported_parameters || [],
      provider: this.id,
    }));
  }

  /** Filter to free models that support tool calling */
  filterFreeToolModels(models) {
    return models.filter(
      (m) =>
        m.pricing?.prompt === '0' &&
        m.pricing?.completion === '0' &&
        m.supported_parameters?.includes('tools')
    );
  }
}
