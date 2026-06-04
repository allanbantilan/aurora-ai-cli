import { test } from 'node:test';
import assert from 'node:assert/strict';
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
