import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TARGET = 'Aurora OpenRouter API Key';

const defaultWindowsStore = {
  async get() {
    const script = `$v=[Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]::new();try{$c=$v.Retrieve('${TARGET}','openrouter');$c.RetrievePassword();$c.Password}catch{''}`;
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
    return stdout.trim();
  },
  async set(key) {
    const encoded = Buffer.from(key, 'utf8').toString('base64');
    const script = `$k=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'));$v=[Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]::new();try{$old=$v.Retrieve('${TARGET}','openrouter');$v.Remove($old)}catch{};$c=[Windows.Security.Credentials.PasswordCredential,Windows.Security.Credentials,ContentType=WindowsRuntime]::new('${TARGET}','openrouter',$k);$v.Add($c)`;
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
  },
};

const valid = (key) => typeof key === 'string' && key.trim().startsWith('sk-');

export async function loadApiKey({
  config = {},
  env = process.env,
  platform = process.platform,
  credentialStore = defaultWindowsStore,
} = {}) {
  if (valid(env.OPENROUTER_API_KEY)) return env.OPENROUTER_API_KEY.trim();
  if (platform === 'win32') {
    const stored = await credentialStore.get();
    return valid(stored) ? stored.trim() : null;
  }
  return valid(config.apiKey) ? config.apiKey.trim() : null;
}

export async function saveApiKey(key, {
  config = {},
  platform = process.platform,
  credentialStore = defaultWindowsStore,
} = {}) {
  if (!valid(key)) throw new Error('OpenRouter API keys must start with sk-');
  if (platform === 'win32') {
    await credentialStore.set(key.trim());
    delete config.apiKey;
    return 'Windows Credential Manager';
  }
  config.apiKey = key.trim();
  return 'config file';
}

export async function migratePlaintextKey({
  config = {},
  platform = process.platform,
  credentialStore = defaultWindowsStore,
} = {}) {
  if (platform !== 'win32' || !valid(config.apiKey)) return false;
  const existing = await credentialStore.get();
  if (!valid(existing)) await credentialStore.set(config.apiKey.trim());
  delete config.apiKey;
  return true;
}
