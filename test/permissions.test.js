import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPermissions } from '../src/permissions.js';

test('read-only tools are always allowed without asking', async () => {
  const perms = createPermissions(async () => {
    throw new Error('should not ask');
  });
  assert.deepEqual(await perms.check('read_file', { path: 'a' }), { allowed: true });
  assert.deepEqual(await perms.check('grep', { pattern: 'x' }), { allowed: true });
});

test('risky tool asks; yes allows once', async () => {
  const answers = [{ choice: 'yes' }, { choice: 'no' }];
  const perms = createPermissions(async () => answers.shift());
  assert.equal((await perms.check('write_file', { path: 'a', content: '' })).allowed, true);
  assert.equal((await perms.check('write_file', { path: 'a', content: '' })).allowed, false);
});

test('always allows the tool for the rest of the session', async () => {
  let asks = 0;
  const perms = createPermissions(async () => {
    asks++;
    return { choice: 'always' };
  });
  assert.equal((await perms.check('run_command', { command: 'ls' })).allowed, true);
  assert.equal((await perms.check('run_command', { command: 'rm x' })).allowed, true);
  assert.equal(asks, 1);
});

test('denial feedback is passed through', async () => {
  const perms = createPermissions(async () => ({ choice: 'no', feedback: 'use a backup folder instead' }));
  assert.deepEqual(await perms.check('run_command', { command: 'rm x' }), {
    allowed: false,
    feedback: 'use a backup folder instead',
  });
});

test('malformed answers count as deny', async () => {
  const perms = createPermissions(async () => 'banana');
  assert.equal((await perms.check('edit_file', { path: 'a', old_string: 'x', new_string: 'y' })).allowed, false);
});
