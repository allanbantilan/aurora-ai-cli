import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_COMMANDS, routeAgentInput } from '../src/agents.js';

const CASES = [
  ['simplify', 'src/utils.js', /Simplified \[file\]: N changes, logic unchanged\./],
  ['review', 'src/Button.vue', /Review score: X\/10 — verdict\./],
  ['hunt', 'the login form is broken', /Hypothesis: \[cause\]/],
  ['fix', 'TypeError at auth.js:42', /Fix only that specific error/],
  ['test', 'src/api/users.js', /happy path, edge cases, validation errors, authorization failures, and boundary values/],
  ['commit', '', /git diff --cached/],
  ['migrate', 'Product', /Migration \[filename\]: N columns/],
  ['artisan', 'Product resource', /Scaffolded: \[list of files created\]/],
  ['component', 'ProductCard.vue', /Component \[name\]: \[created\|refactored\]/],
];

for (const [name, arg, required] of CASES) {
  test(`routes @${name} with its exact workflow`, () => {
    const result = routeAgentInput(`@${name}${arg ? ` ${arg}` : ''}`);
    assert.equal(result.matched, true);
    assert.match(result.announcement, new RegExp(`◆ @${name} dispatched`));
    assert.match(result.input, required);
    assert.match(result.input, /Read all relevant files before making any changes/);
    assert.match(result.input, /Never make speculative edits/);
    assert.match(result.input, /Report every file touched/);
    assert.match(result.input, /one-line plain-text summary/);
  });
}

test('agent names are case-insensitive and arguments are preserved', () => {
  const result = routeAgentInput('@REVIEW src/My Button.vue');
  assert.equal(result.matched, true);
  assert.match(result.input, /src\/My Button\.vue/);
});

test('agents requiring a target return an error when it is missing', () => {
  for (const name of ['simplify', 'review', 'hunt', 'fix', 'test', 'migrate', 'artisan', 'component']) {
    const result = routeAgentInput(`@${name}`);
    assert.equal(result.matched, true);
    assert.match(result.error, new RegExp(`@${name} requires`, 'i'));
  }
});

test('unknown agents pass through as ordinary input', () => {
  assert.deepEqual(routeAgentInput('@unknown do work'), { matched: false, input: '@unknown do work' });
});

test('@commit waits for confirmation and handles unstaged changes', () => {
  const result = routeAgentInput('@commit');
  assert.match(result.input, /If nothing is staged, run git diff and tell the user to stage first/);
  assert.match(result.input, /Wait for user confirmation before committing/);
  assert.match(result.input, /feat \| fix \| refactor \| style \| test \| docs \| chore \| migration \| security/);
});

test('@review reports findings without editing files', () => {
  assert.match(routeAgentInput('@review src/app.js').input, /Do not edit files; report findings only/);
});

test('agent command catalog lists every available agent for the @ menu', () => {
  assert.deepEqual(AGENT_COMMANDS.map(([command]) => command), [
    '@simplify',
    '@review',
    '@hunt',
    '@fix',
    '@test',
    '@commit',
    '@migrate',
    '@artisan',
    '@component',
  ]);
  assert.equal(AGENT_COMMANDS.every(([, description]) => description.length > 0), true);
});

test('shared rules carry PHP and Laravel conventions', () => {
  const input = routeAgentInput('@simplify app/Models/Product.php').input;
  assert.match(input, /Always follow PSR-12 for PHP/);
  assert.match(input, /PHP 8\.3\+ features/);
  assert.match(input, /Prefer Laravel conventions over custom solutions/);
});
