import { test } from 'node:test';
import assert from 'node:assert/strict';
import { systemPrompt } from '../src/prompt.js';

test('systemPrompt is a lean general coding core with stack strengths', () => {
  const prompt = systemPrompt('/tmp/proj');

  assert.match(prompt, /coding agent running in: \/tmp\/proj/);
  assert.match(prompt, /general-purpose coding agent/i);
  assert.match(prompt, /strongest in Laravel.*Vue 3.*Inertia.*Tailwind/i);
  assert.match(prompt, /other languages and frameworks normally/i);
  assert.ok(prompt.split(/\r?\n/).length <= 80);
});

test('systemPrompt keeps execution, tool, editing, and verification discipline', () => {
  const prompt = systemPrompt('.');

  assert.match(prompt, /Act immediately on clear requests/i);
  assert.match(prompt, /ONE plain question/i);
  assert.match(prompt, /literal shell command.*run_command/i);
  assert.match(prompt, /inspect_project.*stack/i);
  assert.match(prompt, /read the live file before editing/i);
  assert.match(prompt, /minimal change/i);
  assert.match(prompt, /latest tool result is authoritative/i);
  assert.match(prompt, /Before claiming.*complete.*objective verification/i);
  assert.match(prompt, /build.*test.*filesystem tool/i);
  assert.match(prompt, /Never describe a change as applied/i);
});

test('systemPrompt removes always-on Laravel and Vue knowledge dumps', () => {
  const prompt = systemPrompt('.');

  assert.doesNotMatch(prompt, /PHP & Laravel knowledge/);
  assert.doesNotMatch(prompt, /Vue 3 knowledge/);
  assert.doesNotMatch(prompt, /Laravel \+ Vue 3 project structure \(canonical\)/);
  assert.doesNotMatch(prompt, /N\+1 prevention/);
  assert.doesNotMatch(prompt, /Use Headless UI/);
  assert.doesNotMatch(prompt, /Stack preferences/);
});

test('systemPrompt preserves fresh-project and framework-evidence safeguards', () => {
  const prompt = systemPrompt('.');

  assert.match(prompt, /fresh .*project.*@scaffold/i);
  assert.match(prompt, /composer\.json.*artisan/i);
  assert.match(prompt, /Never create framework-shaped files as a substitute for installation/i);
  assert.match(prompt, /Never claim.*installed.*without current tool evidence/i);
});

test('systemPrompt carries permission and auto mode instructions', () => {
  assert.match(systemPrompt('.'), /Active mode: Default[\s\S]*approval prompts/);
  assert.match(systemPrompt('.', 'auto'), /Active mode: Auto[\s\S]*without waiting for approval/i);
  assert.match(systemPrompt('.', 'invalid'), /Active mode: Default/);
});

test('systemPrompt preserves the plan-mode protocol and rules', () => {
  const prompt = systemPrompt('.', 'plan');

  assert.match(prompt, /Active mode: Plan/);
  assert.match(prompt, /read-only planning mode/i);
  assert.match(prompt, /Not confirmed yet/);
  assert.match(prompt, /AURORA_PLAN_PROTOCOL/);
  for (const field of ['title', 'context', 'questions', 'plan', 'files', 'risks']) {
    assert.match(prompt, new RegExp(`"${field}"`));
  }
  assert.match(prompt, /2-4 lines/);
});

test('systemPrompt retains bounded dynamic instructions, memory, and skill catalog', () => {
  const prompt = systemPrompt('.', 'permission', {
    instructions: '[AGENTS.md]\nRun composer test before finishing.',
    memories: '- [project] Use Pest for tests.',
    skillCatalog: '- $eloquent: Eloquent models, relationships, scopes, and migrations',
  });

  assert.match(prompt, /Required project instructions/);
  assert.match(prompt, /Run composer test before finishing/);
  assert.match(prompt, /User memory/);
  assert.match(prompt, /Available skills/);
  assert.match(prompt, /\$eloquent/);
  assert.match(prompt, /project instructions take precedence/i);
  assert.ok(prompt.length < systemPrompt('.').length + 21_000);
});
