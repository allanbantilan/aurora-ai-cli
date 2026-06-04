import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, saveConfig, getApiKey, migrateConfig } from '../src/config.js';

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jai-cfg-')), 'config.json');
}

test('loadConfig returns {} when file is missing', () => {
  assert.deepEqual(loadConfig(tmpFile()), {});
});

test('loadConfig falls back to legacy config when aurora config is missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-cfg-'));
  const auroraFile = path.join(dir, '.aurora', 'config.json');
  const legacyFile = path.join(dir, '.jonathan-ai', 'config.json');
  saveConfig({ apiKey: 'legacy-key' }, legacyFile);

  assert.deepEqual(loadConfig(auroraFile, legacyFile), { apiKey: 'legacy-key' });
});

test('saveConfig then loadConfig round-trips', () => {
  const file = tmpFile();
  saveConfig({ apiKey: 'k', lastModel: 'm' }, file);
  assert.deepEqual(loadConfig(file), { apiKey: 'k', lastModel: 'm' });
});

test('getApiKey prefers env var over config', () => {
  process.env.OPENROUTER_API_KEY = 'sk-env-key';
  assert.equal(getApiKey({ apiKey: 'sk-cfg-key' }), 'sk-env-key');
  delete process.env.OPENROUTER_API_KEY;
  assert.equal(getApiKey({ apiKey: 'sk-cfg-key' }), 'sk-cfg-key');
  assert.equal(getApiKey({}), null);
});

test('getApiKey ignores clearly invalid saved keys', () => {
  assert.equal(getApiKey({ apiKey: 'hello' }), null);
  assert.equal(getApiKey({ apiKey: '' }), null);
});

test('migrateConfig converts lastModel to lastModels', () => {
  const config = { lastModel: 'a/m1' };
  assert.equal(migrateConfig(config), true);
  assert.deepEqual(config.lastModels, ['a/m1']);
  assert.equal('lastModel' in config, false);
});

test('migrateConfig prefers existing lastModels and drops lastModel', () => {
  const config = { lastModel: 'a/old', lastModels: ['b/new'] };
  assert.equal(migrateConfig(config), true);
  assert.deepEqual(config.lastModels, ['b/new']);
  assert.equal('lastModel' in config, false);
});

test('migrateConfig leaves modern or empty configs untouched', () => {
  const modern = { lastModels: ['a/m1'] };
  assert.equal(migrateConfig(modern), false);
  assert.deepEqual(modern, { lastModels: ['a/m1'] });
  const empty = {};
  assert.equal(migrateConfig(empty), false);
  assert.deepEqual(empty, {});
});
