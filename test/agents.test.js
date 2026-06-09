import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_COMMANDS, routeAgentInput, isLandingPageScaffold } from '../src/agents.js';

const CASES = [
  ['simplify', 'src/utils.js', /Simplified \[file\]: N changes, logic unchanged\./],
  ['review', 'src/Button.vue', /Review score: X\/10 — verdict\./],
  ['hunt', 'the login form is broken', /Hypothesis: \[cause\]/],
  ['fix', 'TypeError at auth.js:42', /Fix only that specific error/],
  ['test', 'src/api/users.js', /happy path, edge cases, validation errors, authorization failures, and boundary values/],
  ['commit', '', /git diff --cached/],
  ['migrate', 'Product', /Migration \[filename\]: N columns/],
  ['artisan', 'Product resource', /Scaffolded: \[list of files created\]/],
  ['scaffold', 'a Laravel ecommerce landing page', /composer create-project laravel\/laravel \./],
  ['feature', 'Product catalog', /complete vertical feature slice end-to-end/],
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
  for (const name of ['simplify', 'review', 'hunt', 'fix', 'test', 'migrate', 'artisan', 'scaffold', 'feature', 'component']) {
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

test('@scaffold uses the modern Tailwind v4 + Inertia vue3 stack', () => {
  const { input } = routeAgentInput('@scaffold build a landing page');
  assert.match(input, /@tailwindcss\/vite/);
  assert.match(input, /@inertiajs\/vue3/);
  assert.match(input, /@import ["']tailwindcss["']/);
});

test('@scaffold does not use the deprecated Tailwind v3 setup', () => {
  const { input } = routeAgentInput('@scaffold build a landing page');
  assert.doesNotMatch(input, /tailwindcss init/i);
  assert.doesNotMatch(input, /postcss\.config\.js/);
  assert.doesNotMatch(input, /autoprefixer/);
  assert.doesNotMatch(input, /@tailwind\s+(?:base|components|utilities)/);
});

test('@scaffold never reads the Laravel 10 HTTP kernel unless Laravel 10 is confirmed', () => {
  const { input } = routeAgentInput('@scaffold build a complete CRUD feature for Projects');

  assert.match(input, /Laravel 11\+.*bootstrap\/app\.php/is);
  assert.match(input, /never read app\/Http\/Kernel\.php/is);
  assert.match(input, /Only if php artisan --version confirms Laravel 10.*app\/Http\/Kernel\.php/is);
});

test('isLandingPageScaffold detects landing intent and ignores other features', () => {
  assert.equal(isLandingPageScaffold('create a fresh laravel project with a landing page'), true);
  assert.equal(isLandingPageScaffold('build a marketing homepage'), true);
  assert.equal(isLandingPageScaffold('build a complete CRUD feature for Projects'), false);
});

test('@scaffold builds the requested feature as a vertical slice for non-landing requests', () => {
  const { input } = routeAgentInput('@scaffold build a complete CRUD feature for Projects');
  assert.match(input, /make:controller/);
  assert.match(input, /--resource/);
  assert.match(input, /Index\.vue.*Create\.vue.*Edit\.vue.*Show\.vue/s);
  assert.doesNotMatch(input, /\bhero\b/i);
});

test('@scaffold builds a landing-page layout for landing requests', () => {
  const { input } = routeAgentInput('@scaffold build a marketing landing page');
  assert.match(input, /\bhero\b/i);
  assert.match(input, /\bfooter\b/i);
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
    '@scaffold',
    '@feature',
    '@component',
  ]);
  assert.equal(AGENT_COMMANDS.every(([, description]) => description.length > 0), true);
});

test('@scaffold verifies installation, builds a real feature, and verifies the build', () => {
  const input = routeAgentInput('@scaffold a fresh Laravel ecommerce landing page').input;
  assert.match(input, /Step 1 — Check if Laravel is already installed/);
  assert.match(input, /php artisan --version/);
  assert.match(input, /composer require inertiajs\/inertia-laravel/);
  assert.match(input, /php artisan inertia:middleware/);
  assert.match(input, /resources\/js\/Pages\/\[PageName\]\.vue/);
  assert.match(input, /nav.*hero.*features.*CTA.*footer/is);
  assert.match(input, /npm run build/);
  assert.match(input, /✓ Scaffolded \[feature name\]: \[N\] files created, ready at \[route path\]\./);
});

test('agents that cross Laravel and Vue receive shared data-contract rules', () => {
  const input = routeAgentInput('@feature Product catalog').input;
  assert.match(input, /Data contract rules/);
  assert.match(input, /Before writing a controller method, decide the exact prop shape/i);
  assert.match(input, /CONTRACT: \{ products: LengthAwarePaginator<Product>/);
  assert.match(input, /defineProps\(\{ products: Object \}\)/);
});

test('@feature defines and verifies the complete vertical slice', () => {
  const input = routeAgentInput('@feature Product catalog').input;
  assert.match(input, /MODEL CONTRACT/);
  assert.match(input, /INERTIA PROP CONTRACT/);
  assert.match(input, /Store\[Model\]Request/);
  assert.match(input, /Route::resource/);
  assert.match(input, /Index\.vue, Create\.vue, Edit\.vue, Show\.vue/);
  assert.match(input, /php artisan route:list --name=\[model\]/);
  assert.match(input, /npm run build/);
});

test('shared rules carry PHP and Laravel conventions', () => {
  const input = routeAgentInput('@simplify app/Models/Product.php').input;
  assert.match(input, /Always follow PSR-12 for PHP/);
  assert.match(input, /PHP 8\.3\+ features/);
  assert.match(input, /Prefer Laravel conventions over custom solutions/);
});
