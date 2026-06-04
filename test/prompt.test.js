import { test } from 'node:test';
import assert from 'node:assert/strict';
import { systemPrompt } from '../src/prompt.js';

test('systemPrompt embeds the working directory', () => {
  assert.match(systemPrompt('/tmp/proj'), /\/tmp\/proj/);
});

test('systemPrompt forbids claiming changes without tool calls', () => {
  assert.match(systemPrompt('.'), /Never describe or paste code as if you applied it/);
});

test('systemPrompt carries the frontend rules', () => {
  const p = systemPrompt('.');
  assert.match(p, /HTML, CSS, JavaScript, PHP, and Vue\.js/);
  assert.match(p, /Tailwind CSS/);
  assert.match(p, /Composition API/);
});

test('systemPrompt stays small enough for free models', () => {
  // guardrail: the whole prompt must stay well under ~500 words
  assert.ok(systemPrompt('.').split(/\s+/).length < 500);
});
