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

test('systemPrompt guides Laravel-aware project discovery with generic fallback', () => {
  const p = systemPrompt('.');
  assert.match(p, /You have tools: inspect_project, read_file, list_files, grep,/);
  assert.doesNotMatch(p, /search_files/);
  assert.match(p, /project structure.*inspect_project first/i);
  assert.match(p, /Laravel is detected.*list_files categories/i);
  assert.match(p, /grep presets.*routes.*eloquent-models.*inertia/i);
  assert.match(p, /non-Laravel.*generic pattern and glob behavior/i);
  assert.match(p, /read_file.*start_line.*end_line/i);
});

test('systemPrompt gates fresh project scaffolding and verifies installation', () => {
  const p = systemPrompt('.');
  assert.match(p, /create a fresh \[framework\] project.*STOP before any file edits/i);
  assert.match(p, /composer\.json.*artisan.*project is not installed/i);
  assert.match(p, /composer create-project laravel\/laravel \./i);
  assert.match(p, /php artisan --version/i);
  assert.match(p, /Never edit framework files.*as a substitute for actual installation/i);
  assert.match(p, /Do not pin a framework version unless the user/i);
  assert.match(p, /fresh \[framework\] project.*@scaffold/i);
});

test('systemPrompt defines minimum completion scope for named features', () => {
  const p = systemPrompt('.');
  assert.match(p, /A task is NOT complete until every named deliverable physically exists on disk/i);
  assert.match(p, /landing page.*route in web\.php.*Vue page file.*navbar\/hero\/features\/CTA\/footer.*Tailwind styling/i);
  assert.match(p, /auth.*routes.*controller.*Blade or Vue views.*middleware wired up/i);
  assert.match(p, /dashboard.*protected route.*controller returning data.*Vue page rendering it/i);
  assert.match(p, /CRUD.*migration.*model.*FormRequest.*controller with all 5 methods.*resource routes.*Vue pages/i);
  assert.match(p, /Still needed: \[what\].*continue/i);
});

test('systemPrompt requires explicit step execution and disk verification', () => {
  const p = systemPrompt('.');
  assert.match(p, /explicit, numbered steps/i);
  assert.match(p, /Each step has one action and one verification/i);
  assert.match(p, /do NOT move to the next step until the current step is confirmed complete/i);
  assert.match(p, /A file "exists" only after write_file or edit_file confirms it/i);
});

test('systemPrompt documents the canonical Laravel Vue Inertia structure', () => {
  const p = systemPrompt('.');
  assert.match(p, /Laravel \+ Vue 3 project structure \(canonical\)/);
  assert.match(p, /resources\/js\/Pages\//);
  assert.match(p, /HandleInertiaRequests/);
  assert.match(p, /bootstrap\/app\.php/);
  assert.match(p, /app\/Http\/Kernel\.php/);
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

test('systemPrompt stays within the expanded specialized prompt budget', () => {
  assert.ok(systemPrompt('.').split(/\s+/).length < 5000);
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
