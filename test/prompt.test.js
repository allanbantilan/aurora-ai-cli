import { test } from 'node:test';
import assert from 'node:assert/strict';
import { systemPrompt } from '../src/prompt.js';

test('systemPrompt embeds the working directory', () => {
  assert.match(systemPrompt('/tmp/proj'), /\/tmp\/proj/);
});

test('systemPrompt forbids claiming changes without tool calls', () => {
  assert.match(systemPrompt('.'), /Never describe a change as if you applied it/);
});

test('systemPrompt scopes Aurora to coding tasks but answers meta-questions', () => {
  const p = systemPrompt('.');
  assert.match(p, /I'm Aurora, a coding CLI agent/);
  assert.match(p, /DECLINE only/);
  assert.match(p, /what can you do/i); // capability questions answered, not declined
  assert.match(p, /Never decline these/);
  assert.match(p, /treat it as dev-related/i); // doubt resolves toward helping
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

test('systemPrompt carries permission-mode instructions by default', () => {
  const p = systemPrompt('.');
  assert.match(p, /Active mode: Default/);
  assert.match(p, /approval prompts/);
});

test('systemPrompt carries auto-mode instructions', () => {
  const p = systemPrompt('.', 'auto');
  assert.match(p, /Active mode: Auto/);
  assert.match(p, /without waiting for approval/i);
});

test('systemPrompt carries Claude Code-style plan-mode instructions', () => {
  const p = systemPrompt('.', 'plan');
  assert.match(p, /Active mode: Plan/);
  assert.match(p, /read-only/i);
  assert.match(p, /ask focused questions/i);
  assert.match(p, /execution plan/i);
  assert.match(p, /do not attempt/i);
  assert.match(p, /discovery first/i);
  assert.match(p, /Not confirmed yet/);
  assert.match(p, /do not assume/i);
  assert.match(p, /AURORA_PLAN_PROTOCOL/);
  assert.match(p, /Verified project context/);
  assert.match(p, /Questions \/ Unknowns/);
  assert.match(p, /Files likely to change/);
  assert.match(p, /Risks/);
  assert.match(p, /recommended choice first/i);
  assert.match(p, /Do not recommend installing libraries/i);
  assert.match(p, /"title"/);
  assert.match(p, /"context"/);
  assert.match(p, /"plan"/);
  assert.match(p, /"files"/);
  assert.match(p, /"risks"/);
  assert.match(p, /2-4 line summary/);
});

test('systemPrompt treats invalid modes as permission mode', () => {
  assert.match(systemPrompt('.', 'invalid'), /Active mode: Default/);
});
