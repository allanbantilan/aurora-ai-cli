import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_FILE = path.join(os.homedir(), '.aurora', 'config.json');
const LEGACY_CONFIG_FILE = path.join(os.homedir(), '.jonathan-ai', 'config.json');

export function loadConfig(file = CONFIG_FILE, legacyFile = file === CONFIG_FILE ? LEGACY_CONFIG_FILE : null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    if (!legacyFile) return {};
    try {
      return JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
    } catch {
      return {};
    }
  }
}

export function saveConfig(config, file = CONFIG_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
}

/**
 * Get provider configuration.
 * Returns: { enabled: ['openrouter', 'google', ...], default: 'openrouter', ... }
 */
export function getProviderConfig(config) {
  return config.providers || { enabled: ['openrouter'], default: 'openrouter' };
}

/**
 * Set provider configuration.
 */
export function setProviderConfig(config, providerConfig) {
  config.providers = providerConfig;
  return config;
}

/**
 * Enable a provider in config.
 */
export function enableProvider(config, providerId) {
  const providers = getProviderConfig(config);
  if (!providers.enabled.includes(providerId)) {
    providers.enabled.push(providerId);
  }
  setProviderConfig(config, providers);
  return config;
}

/**
 * Disable a provider in config.
 */
export function disableProvider(config, providerId) {
  const providers = getProviderConfig(config);
  providers.enabled = providers.enabled.filter((id) => id !== providerId);
  if (providers.default === providerId) {
    providers.default = providers.enabled[0] || 'openrouter';
  }
  setProviderConfig(config, providers);
  return config;
}

/**
 * Set default provider.
 */
export function setDefaultProvider(config, providerId) {
  const providers = getProviderConfig(config);
  providers.default = providerId;
  setProviderConfig(config, providers);
  return config;
}

/**
 * Get API key for a specific provider from config.
 */
export function getApiKey(config, provider = 'openrouter', env = process.env) {
  const envKeyMap = {
    openrouter: 'OPENROUTER_API_KEY',
    google: 'GOOGLE_API_KEY',
    groq: 'GROQ_API_KEY',
    mistral: 'MISTRAL_API_KEY',
  };
  const envKey = env[envKeyMap[provider]];
  if (isValidKey(provider, envKey)) return envKey.trim();
  
  const keyMap = {
    openrouter: config.apiKey,
    google: config.googleApiKey,
    groq: config.groqApiKey,
    mistral: config.mistralApiKey,
  };
  const key = keyMap[provider] || '';
  return isValidKey(provider, key) ? key.trim() : null;
}

function isValidKey(provider, value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (provider === 'openrouter') return trimmed.startsWith('sk-');
  if (provider === 'groq') return trimmed.startsWith('gsk_');
  return trimmed.length > 10;
}

/** Normalize legacy config (lastModel → lastModels). Returns true if changed. */
export function migrateConfig(config) {
  let changed = false;
  if (!Array.isArray(config.lastModels) && typeof config.lastModel === 'string') {
    config.lastModels = [config.lastModel];
    changed = true;
  }
  if ('lastModel' in config) {
    delete config.lastModel;
    changed = true;
  }
  // Add default provider config if missing
  if (!config.providers) {
    config.providers = { enabled: ['openrouter'], default: 'openrouter' };
    changed = true;
  }
  return changed;
}