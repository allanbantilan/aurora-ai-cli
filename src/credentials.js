import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Provider-specific key validators */
const KEY_VALIDATORS = {
  openrouter: (key) => typeof key === 'string' && key.trim().startsWith('sk-'),
  google: (key) => typeof key === 'string' && key.trim().length > 10,
  groq: (key) => typeof key === 'string' && key.trim().startsWith('gsk_'),
  mistral: (key) => typeof key === 'string' && key.trim().length > 10,
  anthropic: (key) => typeof key === 'string' && key.trim().startsWith('sk-ant-'),
  openai: (key) => typeof key === 'string' && key.trim().startsWith('sk-'),
};

const DEFAULT_VALIDATOR = (key) => typeof key === 'string' && key.trim().length > 10;

function createWindowsStore(target) {
  return {
    async get() {
      const script = `$v=[Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]::new();try{$c=$v.Retrieve('${target}','apikey');$c.RetrievePassword();$c.Password}catch{''}`;
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
      return stdout.trim();
    },
    async set(key) {
      const encoded = Buffer.from(key, 'utf8').toString('base64');
      const script = `$k=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'));$v=[Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]::new();try{$old=$v.Retrieve('${target}','apikey');$v.Remove($old)}catch{};$c=[Windows.Security.Credentials.PasswordCredential,Windows.Security.Credentials,ContentType=WindowsRuntime]::new('${target}','apikey',$k);$v.Add($c)`;
      await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
    },
  };
}

const defaultStores = {
  openrouter: createWindowsStore('Aurora OpenRouter API Key'),
  google: createWindowsStore('Aurora Google API Key'),
  groq: createWindowsStore('Aurora Groq API Key'),
  mistral: createWindowsStore('Aurora Mistral API Key'),
  anthropic: createWindowsStore('Aurora Anthropic API Key'),
  openai: createWindowsStore('Aurora OpenAI API Key'),
};

/** Environment variable names for each provider */
const ENV_KEYS = {
  openrouter: 'OPENROUTER_API_KEY',
  google: 'GOOGLE_API_KEY',
  groq: 'GROQ_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

/** Config file key names for each provider */
const CONFIG_KEYS = {
  openrouter: 'apiKey',
  google: 'googleApiKey',
  groq: 'groqApiKey',
  mistral: 'mistralApiKey',
  anthropic: 'anthropicApiKey',
  openai: 'openaiApiKey',
};

function isValidKey(provider, key) {
  const validator = KEY_VALIDATORS[provider] || DEFAULT_VALIDATOR;
  return validator(key);
}

/**
 * Load API key for a specific provider.
 * Priority: env var > Windows Credential Manager > config file
 */
export async function loadApiKey(provider, {
  config = {},
  env = process.env,
  platform = process.platform,
  credentialStore = defaultStores[provider],
} = {}) {
  const envKey = ENV_KEYS[provider];
  const configKey = CONFIG_KEYS[provider];

  if (envKey && isValidKey(provider, env[envKey])) return env[envKey].trim();
  if (platform === 'win32' && credentialStore) {
    const stored = await credentialStore.get();
    if (isValidKey(provider, stored)) return stored.trim();
  }
  if (configKey && isValidKey(provider, config[configKey])) return config[configKey].trim();
  return null;
}

/**
 * Save API key for a specific provider.
 */
export async function saveApiKey(provider, key, {
  config = {},
  platform = process.platform,
  credentialStore = defaultStores[provider],
} = {}) {
  if (!isValidKey(provider, key)) {
    throw new Error(`Invalid API key format for ${provider}`);
  }
  const configKey = CONFIG_KEYS[provider];
  if (platform === 'win32' && credentialStore) {
    await credentialStore.set(key.trim());
    if (configKey) delete config[configKey];
    return 'Windows Credential Manager';
  }
  if (configKey) config[configKey] = key.trim();
  return 'config file';
}

/**
 * Load API keys for all configured providers.
 * Returns: { openrouter: '...', google: '...', ... }
 */
export async function loadAllApiKeys({
  config = {},
  env = process.env,
  platform = process.platform,
} = {}) {
  const keys = {};
  for (const provider of Object.keys(ENV_KEYS)) {
    keys[provider] = await loadApiKey(provider, { config, env, platform });
  }
  return keys;
}

/**
 * Migrate legacy OpenRouter plaintext key to Windows Credential Manager.
 */
export async function migratePlaintextKey({
  config = {},
  platform = process.platform,
  credentialStore = defaultStores.openrouter,
} = {}) {
  const configKey = CONFIG_KEYS.openrouter;
  if (platform !== 'win32' || !isValidKey('openrouter', config[configKey])) return false;
  const existing = await credentialStore.get();
  if (!isValidKey('openrouter', existing)) await credentialStore.set(config[configKey].trim());
  delete config[configKey];
  return true;
}

/**
 * Prompt user for API key for a specific provider.
 */
export async function promptApiKey(provider, { promptSecret } = {}) {
  if (!promptSecret) throw new Error('promptSecret function required');
  const providerNames = {
    openrouter: 'OpenRouter',
    google: 'Google AI Studio',
    groq: 'Groq',
    mistral: 'Mistral',
  };
  const name = providerNames[provider] || provider;
  return (await promptSecret(`Paste your ${name} API key: `)).trim();
}