import { test } from 'node:test';
import assert from 'node:assert/strict';
import { printBanner } from '../src/banner.js';

test('banner footer shows /help, /permission, and /plan helpers', () => {
  let out = '';
  const original = process.stdout.write;
  process.stdout.write = (text) => {
    out += text;
    return true;
  };
  try {
    printBanner({ chain: ['author/model:free'] });
  } finally {
    process.stdout.write = original;
  }

  assert.match(out, /\/permission/);
  assert.match(out, /change mode/);
  assert.match(out, /\/plan/);
  assert.match(out, /plan feature/);
  assert.match(out, /type a request, or.*\/help.*for commands.*\/permission.*change mode.*\/plan.*plan feature/);
  assert.doesNotMatch(out, /Shift\+Tab/);
  assert.doesNotMatch(out, /\[Permission\]|\[Auto\]|\[Plan\]/);
});
