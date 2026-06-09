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

test('risky tool asks every time when the user chooses allow once', async () => {
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

test("'always' (allow for the session) covers every risky tool, not just the approved one", async () => {
  let asks = 0;
  const p = createPermissions(async () => {
    asks += 1;
    return { choice: 'always' };
  });
  assert.equal((await p.check('run_command', { command: 'composer install' })).allowed, true);
  assert.equal((await p.check('edit_file', { path: 'bootstrap/app.php', old_string: 'x', new_string: 'y' })).allowed, true);
  assert.equal((await p.check('write_file', { path: 'vite.config.js', content: '' })).allowed, true);
  assert.equal(asks, 1); // one "allow for this session" stops all further prompts
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

test('auto mode allows risky tools without asking', async () => {
  const perms = createPermissions(
    async () => {
      throw new Error('should not ask');
    },
    () => 'auto'
  );
  assert.deepEqual(await perms.check('write_file', { path: 'a', content: '' }), { allowed: true });
  assert.deepEqual(await perms.check('run_command', { command: 'npm test' }), { allowed: true });
});

test('plan mode allows reads and blocks risky tools without asking', async () => {
  const perms = createPermissions(
    async () => {
      throw new Error('should not ask');
    },
    () => 'plan'
  );
  assert.deepEqual(await perms.check('read_file', { path: 'a' }), { allowed: true });
  for (const tool of ['write_file', 'edit_file', 'run_command']) {
    const result = await perms.check(tool, {});
    assert.equal(result.allowed, false);
    assert.match(result.feedback, /Plan mode is read-only/);
  }
});

test('plan mode overrides permission-mode session allow rules', async () => {
  let mode = 'permission';
  const perms = createPermissions(async () => ({ choice: 'always' }), () => mode);
  assert.equal((await perms.check('write_file', {})).allowed, true);
  mode = 'plan';
  assert.equal((await perms.check('write_file', {})).allowed, false);
  mode = 'permission';
  assert.equal((await perms.check('write_file', {})).allowed, true);
});

test('invalid mode falls back to permission behavior', async () => {
  let asks = 0;
  const perms = createPermissions(async () => {
    asks++;
    return { choice: 'no' };
  }, () => 'invalid');
  assert.equal((await perms.check('run_command', {})).allowed, false);
  assert.equal(asks, 1);
});

test('a granted file path re-prompts after allow once', async () => {
  let asks = 0;
  const p = createPermissions(async () => {
    asks += 1;
    return { choice: 'yes' };
  });
  await p.check('write_file', { path: 'index.html' });
  const second = await p.check('edit_file', { path: 'index.html' });
  assert.equal(second.allowed, true);
  assert.equal(asks, 2);
  await p.check('write_file', { path: 'other.html' });
  assert.equal(asks, 3);
});

test('session-wide tool grant also covers new paths without prompting', async () => {
  let asks = 0;
  const p = createPermissions(async () => {
    asks += 1;
    return { choice: 'always' };
  });
  await p.check('write_file', { path: 'a.html' });
  await p.check('write_file', { path: 'b.html' });
  assert.equal(asks, 1);
});

test('denied file paths are not remembered as granted', async () => {
  const answers = [{ choice: 'no' }, { choice: 'yes' }];
  let asks = 0;
  const p = createPermissions(async () => {
    asks += 1;
    return answers.shift();
  });
  const first = await p.check('write_file', { path: 'x.html' });
  assert.equal(first.allowed, false);
  const second = await p.check('write_file', { path: 'x.html' });
  assert.equal(second.allowed, true);
  assert.equal(asks, 2); // deny does not poison or grant the path
});
