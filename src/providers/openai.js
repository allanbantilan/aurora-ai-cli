import OpenAI from 'openai';
import { BaseProvider } from './base.js';

const BASE_URL = 'https://api.openai.com/v1';

export class OpenAIProvider extends BaseProvider {
  get id() {
    return 'openai';
  }

  get name() {
    return 'OpenAI';
  }

  get hasFreeTier() {
    return false;
  }

  isAvailable(apiKey) {
    return typeof apiKey === 'string' && apiKey.startsWith('sk-');
  }

  getApiKey(env = process.env) {
    return env.OPENAI_API_KEY || null;
  }

  createClient(apiKey) {
    return new OpenAI({ apiKey, baseURL: BASE_URL, maxRetries: 0 });
  }

  async fetchModels() {
    const apiKey = this.getApiKey();
    if (!apiKey) return [];

    const models = [
      { id: 'gpt-4o', name: 'GPT-4o', context: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', context: 128000 },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', context: 128000 },
      { id: 'o1-preview', name: 'o1 Preview', context: 128000 },
      { id: 'o1-mini', name: 'o1 Mini', context: 128000 },
    ];

    return models.map((m) => ({
      id: m.id,
      name: m.name,
      context: m.context,
      pricing: { prompt: 'paid', completion: 'paid' },
      supported_parameters: ['tools'],
      provider: this.id,
      free: false,
    }));
  }

  filterFreeToolModels(models) {
    return models.filter((m) => m.supported_parameters?.includes('tools'));
  }
}