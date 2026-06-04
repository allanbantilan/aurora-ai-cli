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

test('systemPrompt carries the agent-discipline rules', () => {
  const p = systemPrompt('.');
  assert.match(p, /read a file('s current state)? from disk before editing/i); // pre-flight
  assert.match(p, /ONE clarifying question/); // intent resolution
  assert.match(p, /minimal change/i); // edit discipline
  assert.match(p, /no-op/i); // no-op rejection
  assert.match(p, /revert/i); // circular edit guard
  assert.match(p, /dependency order/i); // multi-file awareness
  assert.match(p, /what have you changed so far/i); // session log
  assert.match(p, /terse/i); // tone
});

test('systemPrompt stays small enough for free models', () => {
  // guardrail: the whole prompt must stay well under ~500 words
  assert.ok(systemPrompt('.').split(/\s+/).length < 500);
});
