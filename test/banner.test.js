import { test } from 'node:test';
import assert from 'node:assert/strict';
import { printBanner } from '../src/banner.js';

test('banner shows compact aligned /help, /permission, and /plan helper rows', () => {
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
  const lines = out.split('\n');
  const help = lines.find((line) => line.includes('/help'));
  const permission = lines.find((line) => line.includes('/permission'));
  const plan = lines.find((line) => line.includes('/plan'));
  assert.match(help, /type a request, or \/help for commands/);
  assert.match(permission, /\/permission  change mode/);
  assert.match(plan, /\/plan        plan feature/);
  assert.equal(permission.indexOf('/permission'), plan.indexOf('/plan'));
  assert.ok(Math.max(...lines.map((line) => line.length)) < 100);
  assert.doesNotMatch(out, /Shift\+Tab/);
  assert.doesNotMatch(out, /\[Permission\]|\[Auto\]|\[Plan\]/);
});
