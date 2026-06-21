#!/usr/bin/env node
import {
  parseCliArgs,
  formatCliHelp,
  formatModelRows,
  formatProviderRows,
  providerStatusRows,
} from '../src/cli.js';
import { loadConfig, saveConfig, migrateConfig, getProviderConfig } from '../src/config.js';
import { createClient, fetchFreeToolModels } from '../src/client.js';
import { loadApiKey, loadAllApiKeys, migratePlaintextKey, saveApiKey } from '../src/credentials.js';
import { providers, getAvailableProviders } from '../src/providers/index.js';
import { promptSecret } from '../src/secret.js';
import { startRepl } from '../src/repl.js';
import { resolveRunModels, runOneShot } from '../src/one-shot.js';

const cli = parseCliArgs(process.argv.slice(2));
if (cli.command === 'help') {
  console.log(formatCliHelp());
  process.exit(0);
}
if (cli.command === 'error') {
  console.error(cli.error);
  console.error('Run aurora --help for usage.');
  process.exit(1);
}

const config = loadConfig();

if (cli.command === 'providers') {
  const apiKeys = await loadAllApiKeys({ config });
  console.log(formatProviderRows(providerStatusRows(Object.values(providers), apiKeys)));
  process.exit(0);
}

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
  if (cli.command === 'models') {
    console.log(formatProviderRows(Object.values(providers).map((provider) => ({
      id: provider.id,
      name: provider.name,
      status: 'not configured',
    }))));
    console.log();
    console.log(formatModelRows([]));
    process.exit(1);
  }

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

const savedChain = Array.isArray(config.lastModels) ? config.lastModels : [];

// Fetch models from all available providers
const providerStatuses = [];
let models = [];
for (const provider of availableProviders) {
  try {
    const providerModels = await provider.fetchModels(apiKeys[provider.id]);
    const filtered = provider.filterFreeToolModels(providerModels);
    models.push(...filtered.map((m) => ({ ...m, provider: provider.id })));
    providerStatuses.push({ id: provider.id, name: provider.name, status: 'usable' });
  } catch (err) {
    providerStatuses.push({ id: provider.id, name: provider.name, status: 'fetch failed', error: err.message });
    console.error(`[warn] ${provider.name} model fetch failed: ${err.message}`);
  }
}

if (cli.command === 'models') {
  console.log(formatProviderRows(providerStatuses));
  console.log();
  console.log(formatModelRows(models));
  process.exit(models.length ? 0 : 1);
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

if (cli.command === 'run') {
  try {
    const chain = resolveRunModels({
      requestedModel: cli.flags.model,
      savedChain,
      models,
    });
    const providerId = models.find((model) => model.id === chain[0])?.provider || defaultProvider.id;
    const provider = providers[providerId] || defaultProvider;
    const runClient = provider.createClient(apiKeys[provider.id]);

    await runOneShot({
      client: runClient,
      models: chain,
      task: cli.task,
      yes: cli.flags.yes,
      strictPrivacy,
    });
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

await startRepl({
  client,
  models,
  initialChain,
  strictPrivacy,
  config,
  saveConfig,
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
