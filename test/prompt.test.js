import { test } from 'node:test';
import assert from 'node:assert/strict';
import { systemPrompt } from '../src/prompt.js';

test('systemPrompt embeds the working directory', () => {
  assert.match(systemPrompt('/tmp/proj'), /\/tmp\/proj/);
});

test('systemPrompt forbids claiming changes without tool calls', () => {
  assert.match(systemPrompt('.'), /Never describe a change as applied/);
});

test('systemPrompt scopes Aurora to coding tasks but answers meta-questions', () => {
  const p = systemPrompt('.');
  assert.match(p, /I'm Aurora, a coding CLI agent/);
  assert.match(p, /DECLINE only/);
  assert.match(p, /Introduce yourself as Aurora/);
  assert.match(p, /Summarize what you can do/);
});

test('systemPrompt carries the stack defaults', () => {
  const p = systemPrompt('.');
  assert.match(p, /Tailwind CSS/);
  assert.match(p, /Composition API/);
  assert.match(p, /Laravel 12/);
  assert.match(p, /PHP 8\.3/);
  assert.match(p, /Inertia\.js/);
  assert.match(p, /Pinia/);
});

test('systemPrompt carries the agent-discipline rules', () => {
  const p = systemPrompt('.');
  assert.match(p, /read the live file before editing/i); // pre-flight
  assert.match(p, /ONE plain question/); // intent resolution
  assert.match(p, /minimal change/i); // edit discipline
  assert.match(p, /no-op/i); // no-op rejection
  assert.match(p, /dependency order/i); // multi-file awareness
  assert.match(p, /terse/i); // tone
  assert.match(p, /Permission decisions and tool results belong to the active coding task/i);
  assert.match(p, /Never decline while continuing an active coding task/i);
  assert.match(p, /Never claim.*runtime.*unavailable.*latest tool result/i);
  assert.match(p, /command fails.*exact failure.*diagnose.*continue/i);
});

test('systemPrompt requires evidence before assuming project state or framework', () => {
  const p = systemPrompt('.');
  assert.match(p, /Before the first edit.*list_files/i);
  assert.match(p, /Laravel-specific files.*artisan.*composer\.json/i);
  assert.match(p, /Do not create Laravel-shaped directories/i);
  assert.match(p, /installed.*present.*configured.*filesystem tools/i);
  assert.match(p, /Never claim.*already present.*without tool evidence/i);
});

test('systemPrompt does not silently pin framework versions for fresh projects', () => {
  assert.match(systemPrompt('.'), /fresh project.*do not pin.*version.*unless the user/i);
});

test('systemPrompt carries the automatic agent-task gauge', () => {
  const p = systemPrompt('.');
  assert.match(p, /Agent task detected/);
  assert.match(p, /3\+ files/);
  assert.match(p, /unknown bug root cause/i);
  assert.match(p, /full feature implementation/i);
  assert.match(p, /codebase-wide/i);
  assert.match(p, /Proceed\? \(y to start\)/);
  assert.match(p, /Step N complete/);
});

test('systemPrompt carries the built-in knowledge snippets', () => {
  const p = systemPrompt('.');
  assert.match(p, /FormRequest/);
  assert.match(p, /N\+1 prevention/);
  assert.match(p, /Sanctum/);
  assert.match(p, /<script setup>/);
  assert.match(p, /useForm\(\)/);
  assert.match(p, /parameterized bindings/i);
});

test('systemPrompt stays within the specialized prompt budget', () => {
  assert.ok(systemPrompt('.').split(/\s+/).length < 4000);
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
  assert.match(p, /"risks"/); // field-rules bullet mentions risks as a JSON field
  assert.match(p, /recommended choice first/i);
  assert.match(p, /Do not recommend installing packages/i);
  assert.match(p, /"title"/);
  assert.match(p, /"context"/);
  assert.match(p, /"plan"/);
  assert.match(p, /"files"/);
  assert.match(p, /"risks"/);
  assert.match(p, /2-4 lines/);
});

test('systemPrompt treats invalid modes as permission mode', () => {
  assert.match(systemPrompt('.', 'invalid'), /Active mode: Default/);
});
