import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveSafe } from '../src/paths.js';

const cwd = path.resolve('/tmp/project');

test('resolves a relative path inside cwd', () => {
  assert.equal(resolveSafe('src/app.js', cwd), path.join(cwd, 'src', 'app.js'));
});

test('rejects paths escaping cwd via ..', () => {
  assert.throws(() => resolveSafe('../secrets.txt', cwd), /escapes working directory/);
});

test('rejects absolute paths outside cwd', () => {
  assert.throws(() => resolveSafe('/etc/passwd', cwd), /escapes working directory/);
});

test('allows absolute paths inside cwd', () => {
  assert.equal(resolveSafe(path.join(cwd, 'a.txt'), cwd), path.join(cwd, 'a.txt'));
});

test('rejects existing and new paths through a symlink that escapes cwd', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-safe-root-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-safe-outside-'));
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
  fs.symlinkSync(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');

  assert.throws(() => resolveSafe('linked/secret.txt', root), /escapes working directory/);
  assert.throws(() => resolveSafe('linked/new.txt', root), /escapes working directory/);
});
