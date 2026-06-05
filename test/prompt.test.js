import { test } from 'node:test';
import assert from 'node:assert/strict';
import { systemPrompt } from '../src/prompt.js';

test('systemPrompt embeds the working directory', () => {
  assert.match(systemPrompt('/tmp/proj'), /\/tmp\/proj/);
});

test('systemPrompt forbids claiming changes without tool calls', () => {
  assert.match(systemPrompt('.'), /Never describe a change as if you applied it/);
});

test('systemPrompt scopes Aurora to coding tasks only', () => {
  const p = systemPrompt('.');
  assert.match(p, /coding assistant only/i);
  assert.match(p, /I'm Aurora, a coding CLI agent/);
  assert.match(p, /DECLINE/);
});

test('systemPrompt carries the stack defaults', () => {
  const p = systemPrompt('.');
  assert.match(p, /Tailwind CSS/);
  assert.match(p, /Composition API/);
  assert.match(p, /ESM/);
});

test('systemPrompt carries the agent-discipline rules', () => {
  const p = systemPrompt('.');
  assert.match(p, /read the live file before editing/i); // pre-flight
  assert.match(p, /ONE plain question/); // intent resolution
  assert.match(p, /minimal change/i); // edit discipline
  assert.match(p, /no-op/i); // no-op rejection
  assert.match(p, /revert/i); // circular edit guard
  assert.match(p, /dependency order/i); // multi-file awareness
  assert.match(p, /what have you changed/i); // session log
  assert.match(p, /terse/i); // tone
});

test('systemPrompt carries the built-in knowledge snippets', () => {
  const p = systemPrompt('.');
  assert.match(p, /useEffect cleanup/);
  assert.match(p, /Promise\.all/);
  assert.match(p, /parameterized queries/i);
  assert.match(p, /imperative mood/); // git commit style
});

test('systemPrompt stays small enough for free models', () => {
  // guardrail: the whole prompt must stay under ~1200 words
  assert.ok(systemPrompt('.').split(/\s+/).length < 1200);
});
