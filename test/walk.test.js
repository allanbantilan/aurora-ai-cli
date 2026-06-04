import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectFiles } from '../src/walk.js';

function makeTmpTree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jai-walk-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.mkdirSync(path.join(dir, 'node_modules', 'x'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
  fs.writeFileSync(path.join(dir, 'src', 'b.js'), 'b');
  fs.writeFileSync(path.join(dir, 'node_modules', 'x', 'c.js'), 'c');
  return dir;
}

test('collects files matching a glob, posix-style relative paths', () => {
  const dir = makeTmpTree();
  assert.deepEqual(collectFiles(dir, '**/*.js'), ['src/b.js']);
});

test('matches everything with **/* but skips node_modules and .git', () => {
  const dir = makeTmpTree();
  assert.deepEqual(collectFiles(dir, '**/*').sort(), ['a.txt', 'src/b.js']);
});
