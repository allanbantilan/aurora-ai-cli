#!/usr/bin/env node
import readline from 'node:readline/promises';
import { loadConfig, saveConfig, getApiKey, migrateConfig } from '../src/config.js';
import { createClient, fetchFreeToolModels } from '../src/client.js';
import { startRepl } from '../src/repl.js';

const config = loadConfig();
if (migrateConfig(config)) saveConfig(config);

let apiKey = getApiKey(config);
if (!apiKey) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  apiKey = (await rl.question('Paste your OpenRouter API key (saved to ~/.jonathan-ai/config.json): ')).trim();
  rl.close();
  if (!apiKey) {
    console.error('An API key is required. Get one at https://openrouter.ai/keys');
    process.exit(1);
  }
  config.apiKey = apiKey;
  saveConfig(config);
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
