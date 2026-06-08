import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadInstructions, formatInstructionContext } from '../src/instructions.js';

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-instructions-'));
  const home = path.join(base, 'home');
  const root = path.join(base, 'project');
  const cwd = path.join(root, 'packages', 'app');
  fs.mkdirSync(path.join(home, '.aurora'), { recursive: true });
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  return { home, root, cwd };
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

test('loadInstructions returns global then root-to-cwd instructions', () => {
  const { home, root, cwd } = fixture();
  write(path.join(home, '.aurora', 'AGENTS.md'), 'global preference');
  write(path.join(root, 'AGENTS.md'), 'root rule');
  write(path.join(root, 'packages', 'AGENTS.md'), 'package rule');
  write(path.join(cwd, 'AGENTS.md'), 'app rule');

  const entries = loadInstructions({ cwd, home });

  assert.deepEqual(entries.map((entry) => entry.content), [
    'global preference',
    'root rule',
    'package rule',
    'app rule',
  ]);
});

test('loadInstructions supports CLAUDE.md with AGENTS.md taking later precedence', () => {
  const { root, cwd, home } = fixture();
  write(path.join(root, 'CLAUDE.md'), 'claude-compatible rule');
  write(path.join(root, 'AGENTS.md'), 'agents rule');

  const entries = loadInstructions({ cwd, home });

  assert.deepEqual(entries.map((entry) => path.basename(entry.file)), ['CLAUDE.md', 'AGENTS.md']);
});

test('AGENTS.override.md replaces AGENTS.md at the same scope', () => {
  const { root, cwd, home } = fixture();
  write(path.join(root, 'AGENTS.md'), 'ordinary rule');
  write(path.join(root, 'AGENTS.override.md'), 'override rule');

  const entries = loadInstructions({ cwd, home });

  assert.deepEqual(entries.map((entry) => entry.content), ['override rule']);
});

test('loadInstructions stays empty when no instruction files exist', () => {
  const { cwd, home } = fixture();
  assert.deepEqual(loadInstructions({ cwd, home }), []);
});

test('formatInstructionContext labels sources and applies a character budget', () => {
  const entries = [
    { file: '/project/AGENTS.md', content: 'root rule' },
    { file: '/project/app/AGENTS.md', content: `closest rule ${'x'.repeat(200)}` },
  ];

  const context = formatInstructionContext(entries, { cwd: '/project/app', maxChars: 100 });

  assert.match(context, /AGENTS\.md/);
  assert.match(context, /closest rule/);
  assert.doesNotMatch(context, /root rule/);
  assert.ok(context.length <= 100);
});
