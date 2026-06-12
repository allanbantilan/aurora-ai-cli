import { OpenRouterProvider } from './openrouter.js';
import { GoogleProvider } from './google.js';
import { GroqProvider } from './groq.js';
import { MistralProvider } from './mistral.js';

export const providers = {
  openrouter: new OpenRouterProvider(),
  google: new GoogleProvider(),
  groq: new GroqProvider(),
  mistral: new MistralProvider(),
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