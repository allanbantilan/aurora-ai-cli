import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { definitions, executeTool, previewTool, RISKY } from '../src/tools/index.js';

test('definitions lists all registered tools', () => {
  const names = definitions.map((d) => d.function.name).sort();
  assert.deepEqual(names, ['edit_file', 'grep', 'inspect_project', 'list_files', 'read_file', 'run_command', 'write_file']);
});

test('RISKY contains exactly the mutating tools', () => {
  assert.deepEqual([...RISKY].sort(), ['edit_file', 'run_command', 'write_file']);
});

test('executeTool dispatches and returns result', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jai-reg-'));
  fs.writeFileSync(path.join(dir, 'f.txt'), 'hello');
  const out = await executeTool('read_file', { path: 'f.txt' }, dir);
  assert.match(out, /hello/);
});

test('executeTool returns error string for unknown tool', async () => {
  const out = await executeTool('nope', {}, '/tmp');
  assert.match(out, /unknown tool/);
});

test('executeTool returns error string instead of throwing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jai-reg-'));
  const out = await executeTool('read_file', { path: 'missing.txt' }, dir);
  assert.match(out, /^Error:/);
});

test('executeTool truncates long results to ~8k chars', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jai-reg-'));
  fs.writeFileSync(path.join(dir, 'big.txt'), 'x'.repeat(20_000));
  const out = await executeTool('read_file', { path: 'big.txt' }, dir);
  assert.ok(out.length < 8_200);
  assert.match(out, /truncated/);
});

test('previewTool renders write_file preview', () => {
  const p = previewTool('write_file', { path: 'a.txt', content: 'body' });
  assert.match(p, /a\.txt/);
  assert.match(p, /body/);
});
