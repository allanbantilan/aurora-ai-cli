import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApiKey, saveApiKey, migratePlaintextKey } from '../src/credentials.js';

test('environment key has highest precedence', async () => {
  assert.equal(await loadApiKey({ config: { apiKey: 'sk-config' }, env: { OPENROUTER_API_KEY: 'sk-env' }, platform: 'win32' }), 'sk-env');
});

test('non-Windows uses config fallback', async () => {
  assert.equal(await loadApiKey({ config: { apiKey: 'sk-config' }, env: {}, platform: 'linux' }), 'sk-config');
});

test('Windows loads, saves, and migrates through injected credential adapter', async () => {
  let stored = '';
  const credentialStore = {
    get: async () => stored,
    set: async (key) => { stored = key; },
  };
  const config = { apiKey: 'sk-old', lastModels: [] };
  assert.equal(await migratePlaintextKey({ config, platform: 'win32', credentialStore }), true);
  assert.equal(stored, 'sk-old');
  assert.equal('apiKey' in config, false);
  await saveApiKey('sk-new', { config, platform: 'win32', credentialStore });
  assert.equal(await loadApiKey({ config, env: {}, platform: 'win32', credentialStore }), 'sk-new');
});
