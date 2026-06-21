import OpenAI from 'openai';
import { BaseProvider } from './base.js';

const BASE_URL = 'https://api.anthropic.com/v1';

export class AnthropicProvider extends BaseProvider {
  get id() {
    return 'anthropic';
  }

  get name() {
    return 'Anthropic';
  }

  get hasFreeTier() {
    return false;
  }

  isAvailable(apiKey) {
    return typeof apiKey === 'string' && apiKey.startsWith('sk-ant-');
  }

  getApiKey(env = process.env) {
    return env.ANTHROPIC_API_KEY || null;
  }

  createClient(apiKey) {
    return new OpenAI({
      apiKey,
      baseURL: BASE_URL,
      maxRetries: 0,
      defaultHeaders: { 'anthropic-version': '2023-06-01' },
    });
  }

  async fetchModels(apiKey = this.getApiKey()) {
    if (!apiKey) return [];

    const models = [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', context: 200000 },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', context: 200000 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', context: 200000 },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', context: 200000 },
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
