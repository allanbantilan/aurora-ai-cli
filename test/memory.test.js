import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryStore, extractExplicitPreferences, learnExplicitPreferences } from '../src/memory.js';

function fixture() {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-memory-'));
  return {
    baseDir,
    cwd: path.join(baseDir, 'project'),
    store: createMemoryStore({ baseDir, cwd: path.join(baseDir, 'project') }),
  };
}

test('memory store keeps global and project preferences separate', () => {
  const { store } = fixture();
  store.add('Use concise commit messages.', 'global');
  store.add('Use Pest for tests.', 'project');

  assert.deepEqual(store.list(), [
    { scope: 'global', text: 'Use concise commit messages.' },
    { scope: 'project', text: 'Use Pest for tests.' },
  ]);
});

test('memory store deduplicates normalized preferences', () => {
  const { store } = fixture();
  assert.equal(store.add('Use Pest for tests.', 'project').added, true);
  assert.equal(store.add('  use pest for tests.  ', 'project').added, false);
  assert.equal(store.list().length, 1);
});

test('memory store removes a matching preference from its scope', () => {
  const { store } = fixture();
  store.add('Use Pest for tests.', 'project');

  assert.equal(store.remove('use pest for tests.', 'project'), true);
  assert.deepEqual(store.list(), []);
  assert.equal(store.remove('missing', 'project'), false);
});

test('memory store persists enabled state', () => {
  const { baseDir, cwd, store } = fixture();
  assert.equal(store.isEnabled(), true);
  store.setEnabled(false);

  assert.equal(createMemoryStore({ baseDir, cwd }).isEnabled(), false);
});

test('memory store treats malformed files as empty', () => {
  const { baseDir, cwd } = fixture();
  fs.mkdirSync(baseDir, { recursive: true });
  fs.writeFileSync(path.join(baseDir, 'global.json'), 'not json');

  assert.deepEqual(createMemoryStore({ baseDir, cwd }).list(), []);
});

test('memory store rejects likely secrets', () => {
  const { store } = fixture();

  assert.equal(store.add('OPENROUTER_API_KEY=sk-secret-value', 'global').added, false);
  assert.equal(store.add('password: hunter2', 'project').added, false);
  assert.deepEqual(store.list(), []);
});

test('memory store isolates project preferences by working directory', () => {
  const { baseDir, cwd, store } = fixture();
  store.add('Use Pest.', 'project');

  const other = createMemoryStore({ baseDir, cwd: `${cwd}-other` });
  assert.deepEqual(other.list(), []);
});

test('extractExplicitPreferences keeps explicit durable preferences', () => {
  assert.deepEqual(
    extractExplicitPreferences('Please always use Pest for tests. I prefer concise commit messages. Use pnpm instead of npm.'),
    ['Please always use Pest for tests.', 'I prefer concise commit messages.', 'Use pnpm instead of npm.']
  );
});

test('extractExplicitPreferences rejects transient instructions and secrets', () => {
  assert.deepEqual(extractExplicitPreferences('For this task, use Pest instead of PHPUnit.'), []);
  assert.deepEqual(extractExplicitPreferences('Always use this file for now.'), []);
  assert.deepEqual(extractExplicitPreferences('Always use token=sk-secret-value.'), []);
  assert.deepEqual(extractExplicitPreferences('Fix the failing test.'), []);
});

test('learnExplicitPreferences saves project preferences only when memory is enabled', () => {
  const { store } = fixture();
  assert.equal(learnExplicitPreferences('Always use Pest for tests.', store), 1);
  assert.deepEqual(store.list(), [{ scope: 'project', text: 'Always use Pest for tests.' }]);

  store.setEnabled(false);
  assert.equal(learnExplicitPreferences('Prefer PHPUnit for tests.', store), 0);
  assert.equal(store.list().length, 1);
});
