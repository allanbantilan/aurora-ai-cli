#!/usr/bin/env node
import { loadConfig, saveConfig, getApiKey, migrateConfig } from '../src/config.js';
import { createClient, fetchFreeToolModels } from '../src/client.js';
import { promptSecret } from '../src/secret.js';
import { startRepl } from '../src/repl.js';

const config = loadConfig();
if (migrateConfig(config)) saveConfig(config);

let apiKey = getApiKey(config);
if (!apiKey) {
  apiKey = (await promptSecret('Paste your OpenRouter API key (saved to ~/.aurora/config.json): ')).trim();
  if (!apiKey) {
    console.error('An API key is required. Get one at https://openrouter.ai/keys');
    process.exit(1);
  }
  if (!getApiKey({ apiKey })) {
    console.error('OpenRouter API keys must start with sk-. Get one at https://openrouter.ai/keys');
    process.exit(1);
  }
  config.apiKey = apiKey;
  saveConfig(config);
  console.log('Saved OpenRouter API key to ~/.aurora/config.json.');
}

const savedChain = Array.isArray(config.lastModels) ? config.lastModels : [];

let models;
try {
  models = await fetchFreeToolModels();
  if (!models.length) {
    console.error('No free tool-capable models are currently available on OpenRouter.');
    process.exit(1);
  }
} catch (err) {
  console.error(`[warn] Could not fetch model list: ${err.message}`);
  if (!savedChain.length) {
    console.error('No previously used models to fall back to. Check your connection and retry.');
    process.exit(1);
  }
  console.error(`Falling back to last-used models: ${savedChain.join(', ')}`);
  models = savedChain.map((id) => ({ id }));
}

// drop chain entries that no longer exist in the live model list
const initialChain = savedChain.filter((id) => models.some((m) => m.id === id));

await startRepl({
  client: createClient(apiKey),
  models,
  initialChain,
  saveModels: (chain) => {
    config.lastModels = chain;
    saveConfig(config);
  },
});
