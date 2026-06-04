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

export function getApiKey(config) {
  const key = process.env.OPENROUTER_API_KEY || config.apiKey || '';
  return isApiKey(key) ? key : null;
}

function isApiKey(value) {
  return typeof value === 'string' && value.trim().startsWith('sk-');
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
  return changed;
}
