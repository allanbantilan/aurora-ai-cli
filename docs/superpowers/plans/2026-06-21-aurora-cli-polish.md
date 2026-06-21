# Aurora CLI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a proper Aurora CLI surface for help, inspection, one-shot execution, and onboarding documentation.

**Architecture:** Keep `bin/aurora.js` thin by moving argument parsing, runtime loading, provider/model reporting, and one-shot orchestration into focused modules. Preserve the existing REPL and `runTurn` agent loop; the new CLI layer only decides how to enter it. Keep each task independently testable and committed separately.

**Tech Stack:** Node.js ESM, built-in `node:test`, OpenAI SDK-compatible providers, existing Aurora REPL/agent/tool modules.

---

## File Structure

- Create `src/cli.js`: argument parser, help formatter, command classification, provider/model formatting, runtime helpers.
- Create `src/one-shot.js`: non-interactive one-turn execution using `runTurn`, existing tools, and permissions.
- Modify `bin/aurora.js`: delegate to the CLI bootstrap and preserve interactive default behavior.
- Modify `src/repl.js`: update non-interactive model picker heading and model labels.
- Modify `src/banner.js` or `src/ui.js` only if provider tier/display helpers need one shared source.
- Modify `package.json`: update description.
- Create `README.md`: onboarding and usage.
- Create `CHANGELOG.md`: user-facing release notes.
- Add tests in `test/cli.test.js` and `test/one-shot.test.js`; update existing tests only when public output changes.

---

### Task 1: CLI Parser And Help

**Files:**
- Create: `src/cli.js`
- Modify: `bin/aurora.js`
- Test: `test/cli.test.js`

- [ ] **Step 1: Write failing parser/help tests**

Create `test/cli.test.js` with tests covering `parseCliArgs()` and `formatCliHelp()`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCliArgs, formatCliHelp } from '../src/cli.js';

test('parseCliArgs recognizes help without credentials', () => {
  assert.deepEqual(parseCliArgs(['--help']), { command: 'help', flags: {}, task: '' });
  assert.deepEqual(parseCliArgs(['help']), { command: 'help', flags: {}, task: '' });
});

test('parseCliArgs recognizes explicit commands', () => {
  assert.deepEqual(parseCliArgs(['chat']), { command: 'chat', flags: {}, task: '' });
  assert.deepEqual(parseCliArgs(['models']), { command: 'models', flags: {}, task: '' });
  assert.deepEqual(parseCliArgs(['providers']), { command: 'providers', flags: {}, task: '' });
  assert.deepEqual(parseCliArgs(['doctor']), { command: 'doctor', flags: {}, task: '' });
});

test('parseCliArgs recognizes one-shot run forms', () => {
  assert.deepEqual(parseCliArgs(['run', '--model', 'm1', '--yes', 'hello']), {
    command: 'run',
    flags: { model: 'm1', yes: true },
    task: 'hello',
  });
  assert.deepEqual(parseCliArgs(['--model', 'm1', '--yes', 'hello world']), {
    command: 'run',
    flags: { model: 'm1', yes: true },
    task: 'hello world',
  });
});

test('parseCliArgs reports unknown flags and commands', () => {
  assert.deepEqual(parseCliArgs(['--wat']), { command: 'error', flags: {}, task: '', error: 'Unknown flag: --wat' });
  assert.deepEqual(parseCliArgs(['wat']), { command: 'error', flags: {}, task: '', error: 'Unknown command: wat' });
});

test('formatCliHelp documents public commands', () => {
  const help = formatCliHelp();
  for (const text of ['aurora', 'aurora chat', 'aurora models', 'aurora providers', 'aurora doctor', 'aurora run', '--model', '--yes']) {
    assert.match(help, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cli.test.js`

Expected: FAIL because `src/cli.js` does not exist.

- [ ] **Step 3: Implement `src/cli.js` parser/help**

Create `src/cli.js`:

```js
const COMMANDS = new Set(['chat', 'help', 'models', 'providers', 'doctor', 'run']);

export function parseCliArgs(argv = []) {
  const args = [...argv];
  const flags = {};

  if (!args.length) return { command: 'chat', flags, task: '' };
  if (args[0] === '--help' || args[0] === '-h' || args[0] === 'help') return { command: 'help', flags, task: '' };

  let command = 'chat';
  if (COMMANDS.has(args[0])) command = args.shift();
  else if (!args[0].startsWith('-')) return { command: 'error', flags, task: '', error: `Unknown command: ${args[0]}` };
  else command = 'run';

  if (command === 'help') return { command, flags, task: '' };
  if (['models', 'providers', 'doctor', 'chat'].includes(command) && args.length) {
    return { command: 'error', flags, task: '', error: `Unexpected argument for ${command}: ${args[0]}` };
  }

  const taskParts = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--yes' || arg === '-y') {
      flags.yes = true;
      continue;
    }
    if (arg === '--model') {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) return { command: 'error', flags: {}, task: '', error: '--model requires a value' };
      flags.model = value;
      i += 1;
      continue;
    }
    if (arg.startsWith('-')) return { command: 'error', flags: {}, task: '', error: `Unknown flag: ${arg}` };
    taskParts.push(arg);
  }

  return { command, flags, task: taskParts.join(' ').trim() };
}

export function formatCliHelp() {
  return [
    'Aurora - CLI coding agent with tool use and provider fallback',
    '',
    'Usage:',
    '  aurora                         Start interactive chat',
    '  aurora chat                    Start interactive chat',
    '  aurora help | --help           Show this help',
    '  aurora models                  List available tool-capable models',
    '  aurora providers               Show provider configuration',
    '  aurora doctor                  Check local setup and provider health',
    '  aurora run [options] "task"    Run one task and exit',
    '  aurora --model <id> --yes "task"',
    '',
    'Options for run:',
    '  --model <id>   Use a specific model id',
    '  --yes, -y      Allow file changes and shell commands',
  ].join('\n');
}
```

- [ ] **Step 4: Wire early help/error handling in `bin/aurora.js`**

At the top of `bin/aurora.js`, import `parseCliArgs` and `formatCliHelp`, parse `process.argv.slice(2)`, and handle only `help` and `error` before existing startup:

```js
import { parseCliArgs, formatCliHelp } from '../src/cli.js';

const cli = parseCliArgs(process.argv.slice(2));
if (cli.command === 'help') {
  console.log(formatCliHelp());
  process.exit(0);
}
if (cli.command === 'error') {
  console.error(cli.error);
  console.error('Run aurora --help for usage.');
  process.exit(1);
}
```

Leave `chat` as the existing path for now. Later tasks will handle `models`, `providers`, `doctor`, and `run`.

- [ ] **Step 5: Run tests**

Run: `node --test test/cli.test.js`

Expected: PASS.

Run: `node bin/aurora.js --help`

Expected: prints help and exits without model selection.

- [ ] **Step 6: Commit**

```bash
git add bin/aurora.js src/cli.js test/cli.test.js
git commit -m "feat: add Aurora CLI help parser"
```

---

### Task 2: Provider And Model Inspection Commands

**Files:**
- Modify: `src/cli.js`
- Modify: `bin/aurora.js`
- Modify: `src/repl.js`
- Test: `test/cli.test.js`

- [ ] **Step 1: Add failing tests for provider/model labels**

Extend `test/cli.test.js`:

```js
import {
  formatProviderRows,
  formatModelRows,
  providerTier,
} from '../src/cli.js';

test('providerTier distinguishes free and paid providers', () => {
  assert.equal(providerTier('openrouter'), 'free');
  assert.equal(providerTier('anthropic'), 'paid');
  assert.equal(providerTier('openai'), 'paid');
});

test('formatProviderRows distinguishes configured and failed states', () => {
  const rows = formatProviderRows([
    { id: 'openrouter', name: 'OpenRouter', status: 'usable' },
    { id: 'groq', name: 'Groq', status: 'fetch failed', error: 'HTTP 401' },
    { id: 'openai', name: 'OpenAI', status: 'not configured' },
  ]);
  assert.match(rows, /OpenRouter\s+usable\s+free/);
  assert.match(rows, /Groq\s+fetch failed: HTTP 401\s+free/);
  assert.match(rows, /OpenAI\s+not configured\s+paid/);
});

test('formatModelRows uses available model heading and tier labels', () => {
  const out = formatModelRows([
    { id: 'qwen3-coder', provider: 'openrouter' },
    { id: 'claude-sonnet-4-20250514', provider: 'anthropic' },
  ]);
  assert.match(out, /Available tool-capable models:/);
  assert.doesNotMatch(out, /Free tool-capable models/);
  assert.match(out, /qwen3-coder \(OpenRouter, free\)/);
  assert.match(out, /claude-sonnet-4-20250514 \(Anthropic, paid\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cli.test.js`

Expected: FAIL because formatting helpers are missing.

- [ ] **Step 3: Implement formatting and provider status helpers**

Add to `src/cli.js`:

```js
const PROVIDER_NAMES = {
  openrouter: 'OpenRouter',
  google: 'Google AI Studio',
  groq: 'Groq',
  mistral: 'Mistral',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
};

const PAID_PROVIDERS = new Set(['anthropic', 'openai']);

export function providerName(id) {
  return PROVIDER_NAMES[id] || id;
}

export function providerTier(id) {
  return PAID_PROVIDERS.has(id) ? 'paid' : 'free';
}

export function formatProviderRows(rows) {
  return rows.map((row) => {
    const status = row.status === 'fetch failed' ? `fetch failed: ${row.error}` : row.status;
    return `${row.name.padEnd(20)} ${status.padEnd(24)} ${providerTier(row.id)}`;
  }).join('\n');
}

export function formatModelRows(models) {
  const lines = ['Available tool-capable models:'];
  models.forEach((model, index) => {
    const provider = model.provider || 'openrouter';
    lines.push(`${String(index + 1).padStart(3)}. ${model.id} (${providerName(provider)}, ${providerTier(provider)})`);
  });
  return lines.join('\n');
}
```

- [ ] **Step 4: Wire `providers` command**

In `bin/aurora.js`, handle `cli.command === 'providers'` after config load but before network model fetches. Use existing `loadAllApiKeys({ config })` and all provider ids from `providers`. Print rows with statuses `configured` or `not configured`.

Implementation shape:

```js
if (cli.command === 'providers') {
  const apiKeys = await loadAllApiKeys({ config });
  console.log(formatProviderRows(Object.values(providers).map((provider) => ({
    id: provider.id,
    name: provider.name,
    status: apiKeys[provider.id] ? 'configured' : 'not configured',
  }))));
  process.exit(0);
}
```

- [ ] **Step 5: Wire `models` command and improve startup labels**

Reuse the existing model fetch loop but collect provider status rows:

```js
const providerStatuses = [];
let models = [];
for (const provider of availableProviders) {
  try {
    const providerModels = await provider.fetchModels();
    const filtered = provider.filterFreeToolModels(providerModels);
    models.push(...filtered.map((m) => ({ ...m, provider: provider.id })));
    providerStatuses.push({ id: provider.id, name: provider.name, status: 'usable' });
  } catch (err) {
    providerStatuses.push({ id: provider.id, name: provider.name, status: 'fetch failed', error: err.message });
    console.error(`[warn] ${provider.name} model fetch failed: ${err.message}`);
  }
}
```

For `cli.command === 'models'`, print `formatProviderRows(providerStatuses)`, a blank line, then `formatModelRows(models)`, and exit `0` if models exist or `1` if none exist.

In `src/repl.js`, change non-interactive picker output from:

```js
console.log('\nFree tool-capable models:');
```

to:

```js
console.log('\nAvailable tool-capable models:');
```

Include tier in the option label using a local helper or the exported `providerTier`.

- [ ] **Step 6: Run tests and smoke commands**

Run: `node --test test/cli.test.js`

Expected: PASS.

Run: `node bin/aurora.js providers`

Expected: configured/not configured provider table, no model picker.

Run: `node bin/aurora.js models`

Expected: provider fetch status and available model list.

- [ ] **Step 7: Commit**

```bash
git add bin/aurora.js src/cli.js src/repl.js test/cli.test.js
git commit -m "feat: add provider and model inspection commands"
```

---

### Task 3: One-Shot Execution

**Files:**
- Create: `src/one-shot.js`
- Modify: `bin/aurora.js`
- Modify: `src/cli.js`
- Test: `test/one-shot.test.js`

- [ ] **Step 1: Write failing one-shot tests**

Create `test/one-shot.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOneShotPermissions, resolveRunModels } from '../src/one-shot.js';

test('createOneShotPermissions denies mutating tools without --yes', async () => {
  const permissions = createOneShotPermissions({ yes: false });
  assert.deepEqual(await permissions.check('write_file', { path: 'a.txt' }), {
    allowed: false,
    feedback: 'This command needs --yes for file changes or shell commands.',
  });
});

test('createOneShotPermissions allows mutating tools with --yes', async () => {
  const permissions = createOneShotPermissions({ yes: true });
  assert.deepEqual(await permissions.check('write_file', { path: 'a.txt' }), { allowed: true });
});

test('createOneShotPermissions allows read-only tools without --yes', async () => {
  const permissions = createOneShotPermissions({ yes: false });
  assert.deepEqual(await permissions.check('read_file', { path: 'a.txt' }), { allowed: true });
});

test('resolveRunModels uses explicit model when available', () => {
  const models = [{ id: 'a', provider: 'openrouter' }, { id: 'b', provider: 'openrouter' }];
  assert.deepEqual(resolveRunModels({ requestedModel: 'b', savedChain: ['a'], models }), ['b']);
});

test('resolveRunModels rejects unknown explicit model', () => {
  assert.throws(
    () => resolveRunModels({ requestedModel: 'missing', savedChain: [], models: [{ id: 'a', provider: 'openrouter' }] }),
    /Unknown model: missing/
  );
});

test('resolveRunModels filters saved chain to one provider', () => {
  const models = [{ id: 'a', provider: 'openrouter' }, { id: 'b', provider: 'anthropic' }, { id: 'c', provider: 'openrouter' }];
  assert.deepEqual(resolveRunModels({ requestedModel: '', savedChain: ['a', 'b', 'c'], models }), ['a', 'c']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/one-shot.test.js`

Expected: FAIL because `src/one-shot.js` does not exist.

- [ ] **Step 3: Implement one-shot helpers**

Create `src/one-shot.js`:

```js
import { runTurn } from './agent.js';
import * as tools from './tools/index.js';
import { createPermissions } from './permissions.js';
import { systemPrompt } from './prompt.js';

export function createOneShotPermissions({ yes = false } = {}) {
  return createPermissions(
    async () => ({
      choice: 'no',
      feedback: 'This command needs --yes for file changes or shell commands.',
    }),
    () => (yes ? 'auto' : 'permission')
  );
}

export function resolveRunModels({ requestedModel = '', savedChain = [], models = [] }) {
  const byId = new Map(models.map((model) => [model.id, model]));
  if (requestedModel) {
    if (!byId.has(requestedModel)) throw new Error(`Unknown model: ${requestedModel}`);
    return [requestedModel];
  }
  const validSaved = savedChain.filter((id) => byId.has(id));
  const seed = validSaved.length ? validSaved : models.slice(0, 1).map((model) => model.id);
  if (!seed.length) throw new Error('No usable models are available.');
  const provider = byId.get(seed[0])?.provider || 'openrouter';
  return seed.filter((id) => (byId.get(id)?.provider || 'openrouter') === provider);
}

export async function runOneShot({
  client,
  models,
  task,
  yes = false,
  strictPrivacy = false,
  cwd = process.cwd(),
  write = (text) => process.stdout.write(text),
  onToolEnd,
}) {
  if (!task || !task.trim()) throw new Error('Usage: aurora run [--model <id>] [--yes] "task"');
  const messages = [
    { role: 'system', content: systemPrompt(cwd, yes ? 'auto' : 'permission') },
    { role: 'user', content: task.trim() },
  ];
  let output = '';
  await runTurn({
    client,
    models,
    messages,
    tools,
    permissions: createOneShotPermissions({ yes }),
    strictPrivacy,
    onText: (text) => {
      output += text;
      write(text);
    },
    onToolEnd,
  });
  if (output && !output.endsWith('\n')) write('\n');
  return { output, messages };
}
```

- [ ] **Step 4: Wire `run` in `bin/aurora.js`**

After fetching models and choosing provider/client, handle `cli.command === 'run'` before `startRepl`:

```js
if (cli.command === 'run') {
  try {
    const chain = resolveRunModels({ requestedModel: cli.flags.model, savedChain, models });
    const providerId = models.find((model) => model.id === chain[0])?.provider || defaultProvider.id;
    const provider = providers[providerId] || defaultProvider;
    const runClient = provider.createClient(apiKeys[provider.id]);
    await runOneShot({
      client: runClient,
      models: chain,
      task: cli.task,
      yes: cli.flags.yes,
      strictPrivacy,
    });
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
```

Import `runOneShot` and `resolveRunModels`.

- [ ] **Step 5: Run tests**

Run: `node --test test/one-shot.test.js`

Expected: PASS.

Run: `node --test test/cli.test.js test/one-shot.test.js`

Expected: PASS.

- [ ] **Step 6: Manual smoke**

Run with a real configured provider:

```bash
node bin/aurora.js run --model <known-model> --yes "Reply with exactly AURORA_OK and nothing else."
```

Expected: prints `AURORA_OK` and exits `0`.

- [ ] **Step 7: Commit**

```bash
git add bin/aurora.js src/cli.js src/one-shot.js test/one-shot.test.js
git commit -m "feat: add one-shot Aurora run mode"
```

---

### Task 4: Doctor Command And Documentation

**Files:**
- Modify: `src/cli.js`
- Modify: `bin/aurora.js`
- Modify: `package.json`
- Create: `README.md`
- Create: `CHANGELOG.md`
- Test: `test/cli.test.js`

- [ ] **Step 1: Add failing doctor formatting test**

Extend `test/cli.test.js`:

```js
import { formatDoctorReport } from '../src/cli.js';

test('formatDoctorReport gives actionable setup output', () => {
  const out = formatDoctorReport({
    nodeOk: true,
    providers: [{ id: 'openrouter', name: 'OpenRouter', status: 'not configured' }],
    models: [],
  });
  assert.match(out, /Node.js/);
  assert.match(out, /OpenRouter/);
  assert.match(out, /https:\/\/openrouter.ai\/keys/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cli.test.js`

Expected: FAIL because `formatDoctorReport` is missing.

- [ ] **Step 3: Implement doctor report helper**

Add provider setup URLs and doctor formatter to `src/cli.js`:

```js
const PROVIDER_URLS = {
  openrouter: 'https://openrouter.ai/keys',
  google: 'https://aistudio.google.com/apikey',
  groq: 'https://console.groq.com/keys',
  mistral: 'https://console.mistral.ai/api-keys',
  anthropic: 'https://console.anthropic.com/',
  openai: 'https://platform.openai.com/api-keys',
};

export function providerSetupUrl(id) {
  return PROVIDER_URLS[id] || '';
}

export function formatDoctorReport({ nodeOk, providers = [], models = [] }) {
  const lines = ['Aurora doctor', '', `Node.js: ${nodeOk ? 'ok' : 'requires Node 20+'}`, '', 'Providers:'];
  for (const provider of providers) {
    const setup = provider.status === 'not configured' ? ` (${providerSetupUrl(provider.id)})` : '';
    const status = provider.status === 'fetch failed' ? `fetch failed: ${provider.error}` : provider.status;
    lines.push(`  ${provider.name}: ${status}${setup}`);
  }
  lines.push('', `Models: ${models.length ? `${models.length} usable` : 'none usable'}`);
  return lines.join('\n');
}
```

- [ ] **Step 4: Wire `doctor` in `bin/aurora.js`**

For `cli.command === 'doctor'`, load credentials, fetch models using the same provider-status loop, print `formatDoctorReport`, and exit `0` if Node is ok and at least one usable model exists; otherwise exit `1`.

- [ ] **Step 5: Update package metadata**

In `package.json`, change description to:

```json
"description": "CLI coding agent with tool use, provider fallback, and Laravel-aware workflows",
```

- [ ] **Step 6: Add README**

Create `README.md` with these sections:

```md
# Aurora

Aurora is a CLI coding agent with file tools, shell-command tools, provider fallback, and Laravel-aware workflows.

## Requirements

- Node.js 20 or newer
- At least one provider API key

## Install From This Repo

```bash
npm install
npm link
aurora --help
```

## Configure A Provider

OpenRouter is the default free-model path:

```bash
set OPENROUTER_API_KEY=sk-...
```

PowerShell:

```powershell
$env:OPENROUTER_API_KEY = "sk-..."
```

Inside Aurora, use `/provider` to add or remove providers.

## Interactive Usage

```bash
aurora
```

Useful commands:

- `/help`
- `/model`
- `/provider`
- `/permission`
- `/plan`
- `/skills`
- `/agents`
- `/exit`

## One-Shot Usage

```bash
aurora run --model <model-id> --yes "Create hello.txt with hello"
```

Omit `--yes` for read-only tasks. File changes and shell commands require `--yes` in one-shot mode.

## Inspection Commands

```bash
aurora providers
aurora models
aurora doctor
```

## Permission Modes

Default mode asks before file changes and shell commands. Auto mode allows them for the session. Plan mode is read-only.

## Troubleshooting

- `aurora --help` should work without API keys.
- If `aurora models` shows no usable models, run `aurora providers` and check your keys.
- If a provider says `fetch failed`, verify the key in that provider's dashboard.
- On Windows, Aurora can use Windows Credential Manager for saved provider keys.
```

- [ ] **Step 7: Add changelog**

Create `CHANGELOG.md`:

```md
# Changelog

## Unreleased

- Added first-class CLI help, provider inspection, model inspection, doctor, and one-shot run surfaces.
- Clarified free versus paid provider model labels.
- Added onboarding documentation for install, provider setup, interactive usage, one-shot usage, and troubleshooting.

## 0.1.0

- Initial Aurora CLI coding-agent release.
```

- [ ] **Step 8: Run tests**

Run: `node --test test/cli.test.js`

Expected: PASS.

Run: `node bin/aurora.js doctor`

Expected: setup report, no REPL prompt.

- [ ] **Step 9: Commit**

```bash
git add bin/aurora.js src/cli.js test/cli.test.js package.json README.md CHANGELOG.md
git commit -m "docs: add Aurora onboarding and doctor command"
```

---

### Task 5: Integration Verification And Final Polish

**Files:**
- Modify only files needed to fix issues found by the verification commands.

- [ ] **Step 1: Run focused test suite**

Run:

```bash
node --test test/cli.test.js test/one-shot.test.js
```

Expected: PASS.

- [ ] **Step 2: Run full unit suite**

Run:

```bash
npm test
```

Expected: 381+ tests pass. If the count changes because new tests were added, all tests must pass.

- [ ] **Step 3: Run offline evals**

Run:

```bash
node scripts/eval.js
```

Expected: all evals pass.

- [ ] **Step 4: Run CLI smoke checks**

Run:

```bash
node bin/aurora.js --help
node bin/aurora.js providers
node bin/aurora.js models
node bin/aurora.js doctor
```

Expected: each command exits without entering the REPL.

- [ ] **Step 5: Run live one-shot smoke if a provider key is configured**

Run:

```bash
node bin/aurora.js run --yes "Reply with exactly AURORA_OK and nothing else."
```

Expected: `AURORA_OK` and exit `0`.

If no provider key is configured, record that live smoke was skipped and keep the unit/eval verification as the gate.

- [ ] **Step 6: Inspect diff and fix issues**

Run:

```bash
git diff --stat HEAD~4..HEAD
git status --short
```

Expected: only intended files changed. Fix any accidental churn.

- [ ] **Step 7: Commit final verification fixes if needed**

If any fixes were required:

```bash
git add <fixed-files>
git commit -m "fix: polish Aurora CLI integration"
```

If no fixes were required, do not create an empty commit.
