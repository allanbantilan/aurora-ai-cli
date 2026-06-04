import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_FILE = path.join(os.homedir(), '.jonathan-ai', 'config.json');

export function loadConfig(file = CONFIG_FILE) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

export function saveConfig(config, file = CONFIG_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
}

export function getApiKey(config) {
  return process.env.OPENROUTER_API_KEY || config.apiKey || null;
}
