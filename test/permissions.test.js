import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPermissions } from '../src/permissions.js';

test('read-only tools are always allowed without asking', async () => {
  const perms = createPermissions(async () => {
    throw new Error('should not ask');
  });
  assert.equal(await perms.check('read_file', { path: 'a' }), true);
  assert.equal(await perms.check('grep', { pattern: 'x' }), true);
});

test('risky tool asks; y allows once', async () => {
  const answers = ['y', 'n'];
  const perms = createPermissions(async () => answers.shift());
  assert.equal(await perms.check('write_file', { path: 'a', content: '' }), true);
  assert.equal(await perms.check('write_file', { path: 'a', content: '' }), false);
});

test('a allows the tool for the rest of the session', async () => {
  let asks = 0;
  const perms = createPermissions(async () => {
    asks++;
    return 'a';
  });
  assert.equal(await perms.check('run_command', { command: 'ls' }), true);
  assert.equal(await perms.check('run_command', { command: 'rm x' }), true);
  assert.equal(asks, 1);
});

test('unrecognized answer counts as deny', async () => {
  const perms = createPermissions(async () => 'banana');
  assert.equal(await perms.check('edit_file', { path: 'a', old_string: 'x', new_string: 'y' }), false);
});
