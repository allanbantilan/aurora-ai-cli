#!/usr/bin/env node
import { loadConfig, saveConfig, migrateConfig, getProviderConfig } from '../src/config.js';
import { createClient, fetchFreeToolModels } from '../src/client.js';
import { loadApiKey, loadAllApiKeys, migratePlaintextKey, saveApiKey } from '../src/credentials.js';
import { providers, getAvailableProviders } from '../src/providers/index.js';
import { promptSecret } from '../src/secret.js';
import { startRepl } from '../src/repl.js';

const config = loadConfig();
if (migrateConfig(config)) saveConfig(config);
if (await migratePlaintextKey({ config })) saveConfig(config);

// Load API keys for all providers
const apiKeys = await loadAllApiKeys({ config });

// Get available providers
const env = process.env;
const availableProviders = Object.values(providers).filter((p) => {
  const key = apiKeys[p.id];
  return key && p.isAvailable(key);
});

if (!availableProviders.length) {
  // No providers configured - prompt for OpenRouter (default)
  const key = await promptSecret('Paste your OpenRouter API key (or set OPENROUTER_API_KEY): ');
  if (!key || !key.trim()) {
    console.error('An API key is required. Get one at https://openrouter.ai/keys');
    process.exit(1);
  }
  if (!key.trim().startsWith('sk-')) {
    console.error('OpenRouter API keys must start with sk-. Get one at https://openrouter.ai/keys');
    process.exit(1);
  }
  apiKeys.openrouter = key.trim();
  await saveApiKey('openrouter', key.trim(), { config });
  saveConfig(config);
  console.log('Saved OpenRouter API key.');
  availableProviders.push(providers.openrouter);
}

// Log available providers
if (availableProviders.length > 1) {
  console.log(`[providers] Available: ${availableProviders.map((p) => p.name).join(', ')}`);
}

const strictPrivacy = config.strictPrivacy === true;
if (!strictPrivacy) {
  console.log('[privacy] Provider data collection is allowed. Set "strictPrivacy": true in ~/.aurora/config.json to deny it.');
}

const savedChain = Array.isArray(config.lastModels) ? config.lastModels : [];

// Fetch models from all available providers
let models = [];
for (const provider of availableProviders) {
  try {
    const providerModels = await provider.fetchModels();
    const filtered = provider.filterFreeToolModels(providerModels);
    models.push(...filtered.map((m) => ({ ...m, provider: provider.id })));
  } catch (err) {
    console.error(`[warn] ${provider.name} model fetch failed: ${err.message}`);
  }
}

if (!models.length) {
  if (!savedChain.length) {
    console.error('No free tool-capable models are currently available.');
    console.error('Configure a provider API key or check your connection.');
    process.exit(1);
  }
  console.error(`Falling back to last-used models: ${savedChain.join(', ')}`);
  models = savedChain.map((id) => ({ id, provider: 'openrouter' }));
}

// drop chain entries that no longer exist in the live model list
const initialChain = savedChain.filter((id) => models.some((m) => m.id === id));

// Create client for the default provider (OpenRouter for backwards compatibility)
const defaultProvider = availableProviders.find((p) => p.id === 'openrouter') || availableProviders[0];
const client = defaultProvider.createClient(apiKeys[defaultProvider.id]);

await startRepl({
  client,
  models,
  initialChain,
  strictPrivacy,
  apiKeys,
  providers: availableProviders,
  telemetry: config.modelTelemetry ??= {},
  saveTelemetry: (telemetry) => {
    config.modelTelemetry = telemetry;
    saveConfig(config);
  },
  saveModels: (chain) => {
    config.lastModels = chain;
    saveConfig(config);
  },
});