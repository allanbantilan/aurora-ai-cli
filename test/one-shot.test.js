import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOneShotPermissions, resolveRunModels } from '../src/one-shot.js';

test('createOneShotPermissions denies mutating tools without --yes', async () => {
  const permissions = createOneShotPermissions({ yes: false });
  assert.deepEqual(await permissions.check('write_file', { path: 'a.txt' }), {
    allowed: false,
    feedback: 'This command needs --yes for file changes or shell commands.',
  });
});

test('createOneShotPermissions allows mutating tools with --yes', async () => {
  const permissions = createOneShotPermissions({ yes: true });
  assert.deepEqual(await permissions.check('write_file', { path: 'a.txt' }), { allowed: true });
});

test('createOneShotPermissions allows read-only tools without --yes', async () => {
  const permissions = createOneShotPermissions({ yes: false });
  assert.deepEqual(await permissions.check('read_file', { path: 'a.txt' }), { allowed: true });
});

test('resolveRunModels uses explicit model when available', () => {
  const models = [{ id: 'a', provider: 'openrouter' }, { id: 'b', provider: 'openrouter' }];
  assert.deepEqual(resolveRunModels({ requestedModel: 'b', savedChain: ['a'], models }), ['b']);
});

test('resolveRunModels rejects unknown explicit model', () => {
  assert.throws(
    () => resolveRunModels({ requestedModel: 'missing', savedChain: [], models: [{ id: 'a', provider: 'openrouter' }] }),
    /Unknown model: missing/
  );
});

test('resolveRunModels filters saved chain to one provider', () => {
  const models = [
    { id: 'a', provider: 'openrouter' },
    { id: 'b', provider: 'anthropic' },
    { id: 'c', provider: 'openrouter' },
  ];
  assert.deepEqual(resolveRunModels({ requestedModel: '', savedChain: ['a', 'b', 'c'], models }), ['a', 'c']);
});
