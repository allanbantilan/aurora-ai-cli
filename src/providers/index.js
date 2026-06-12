import { OpenRouterProvider } from './openrouter.js';
import { GoogleProvider } from './google.js';
import { GroqProvider } from './groq.js';
import { MistralProvider } from './mistral.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAIProvider } from './openai.js';

export const providers = {
  openrouter: new OpenRouterProvider(),
  google: new GoogleProvider(),
  groq: new GroqProvider(),
  mistral: new MistralProvider(),
  anthropic: new AnthropicProvider(),
  openai: new OpenAIProvider(),
};

export function getProvider(id) {
  return providers[id] || null;
}

export function getAvailableProviders(env = process.env, config = {}) {
  return Object.values(providers).filter((p) => {
    const key = p.getApiKey(env, config);
    return key && p.isAvailable(key);
  });
}

export function getProviderIds() {
  return Object.keys(providers);
}