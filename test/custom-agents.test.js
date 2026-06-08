import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createAgentTools,
  createAgentPermissions,
  discoverCustomAgents,
  isolatedAgentPrompt,
  routeCustomAgentInput,
  runIsolatedAgent,
} from '../src/custom-agents.js';

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-agents-'));
  const home = path.join(base, 'home');
  const root = path.join(base, 'project');
  const cwd = path.join(root, 'app');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  return { home, root, cwd };
}

function agent(dir, filename, frontmatter, body = 'Perform the task carefully.') {
  const folder = path.join(dir, '.aurora', 'agents');
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, `${filename}.md`), `---\n${frontmatter}\n---\n\n${body}\n`);
}

test('discoverCustomAgents loads global agents and applies project overrides', () => {
  const { home, root, cwd } = fixture();
  agent(home, 'reviewer', 'name: reviewer\ndescription: Global reviewer');
  agent(root, 'reviewer', 'name: reviewer\ndescription: Project reviewer\nmode: plan\nmax_turns: 8\ntools: read_file,list_files\nskills: php-review,pest');

  const agents = discoverCustomAgents({ home, cwd });

  assert.equal(agents.length, 1);
  assert.deepEqual(agents[0], {
    name: 'reviewer',
    description: 'Project reviewer',
    mode: 'plan',
    maxTurns: 8,
    tools: ['read_file', 'list_files'],
    skills: ['php-review', 'pest'],
    body: 'Perform the task carefully.',
    file: path.join(root, '.aurora', 'agents', 'reviewer.md'),
    scope: 'project',
  });
});

test('discoverCustomAgents ignores malformed metadata and normalizes defaults', () => {
  const { root, cwd, home } = fixture();
  agent(root, 'valid', 'name: valid\ndescription: Valid agent');
  agent(root, 'bad-name', 'name: Bad Name\ndescription: Invalid');
  agent(root, 'bad-mode', 'name: bad-mode\ndescription: Invalid\nmode: unsafe');

  const agents = discoverCustomAgents({ home, cwd });

  assert.deepEqual(agents.map(({ name, mode, maxTurns, tools, skills }) => ({ name, mode, maxTurns, tools, skills })), [
    { name: 'valid', mode: 'permission', maxTurns: 15, tools: null, skills: [] },
  ]);
});

test('routeCustomAgentInput recognizes custom agents and preserves the task', () => {
  const agents = [{ name: 'reviewer', description: 'Review code' }];
  assert.deepEqual(routeCustomAgentInput('@reviewer inspect auth', agents), {
    matched: true,
    agent: agents[0],
    task: 'inspect auth',
    announcement: '◆ @reviewer dispatched — Review code',
  });
  assert.match(routeCustomAgentInput('@reviewer', agents).error, /requires a task/i);
  assert.deepEqual(routeCustomAgentInput('@unknown task', agents), { matched: false });
});

test('createAgentTools enforces the configured tool allowlist', async () => {
  const executed = [];
  const tools = createAgentTools(
    { tools: ['read_file'] },
    {
      definitions: [
        { type: 'function', function: { name: 'read_file' } },
        { type: 'function', function: { name: 'write_file' } },
      ],
      executeTool: async (name) => { executed.push(name); return 'ok'; },
    }
  );

  assert.deepEqual(tools.definitions.map((tool) => tool.function.name), ['read_file']);
  assert.equal(await tools.executeTool('read_file', {}), 'ok');
  assert.match(await tools.executeTool('write_file', {}), /not allowed/i);
  assert.deepEqual(executed, ['read_file']);
});

test('createAgentPermissions allows plan agents to restrict but never elevate parent permissions', async () => {
  const risky = new Set(['write_file']);
  const parent = { check: async () => ({ allowed: false, feedback: 'parent denied' }) };

  assert.deepEqual(await createAgentPermissions({ mode: 'auto' }, parent, risky).check('write_file', {}), {
    allowed: false,
    feedback: 'parent denied',
  });
  assert.deepEqual(await createAgentPermissions({ mode: 'plan' }, { check: async () => ({ allowed: true }) }, risky).check('write_file', {}), {
    allowed: false,
  });
  assert.deepEqual(await createAgentPermissions({ mode: 'plan' }, { check: async () => ({ allowed: true }) }, risky).check('read_file', {}), {
    allowed: true,
  });
});

test('isolatedAgentPrompt includes agent instructions, project context, and configured skills', () => {
  const prompt = isolatedAgentPrompt(
    { name: 'reviewer', body: 'Review carefully.', skills: ['php-review'] },
    {
      instructions: 'Project rule',
      memories: '- Prefer Pest',
      skills: [{ name: 'php-review', body: 'Check Laravel security.' }],
    }
  );
  assert.match(prompt, /Review carefully/);
  assert.match(prompt, /Project rule/);
  assert.match(prompt, /Prefer Pest/);
  assert.match(prompt, /Check Laravel security/);
});

test('runIsolatedAgent uses a fresh history and returns only the final response', async () => {
  let capturedMessages;
  const client = {
    chat: {
      completions: {
        create: async ({ messages }) => {
          capturedMessages = messages.map((message) => ({ ...message }));
          return {
            async *[Symbol.asyncIterator]() {
              yield { choices: [{ delta: { content: 'isolated result' } }] };
            },
          };
        },
      },
    },
  };
  const result = await runIsolatedAgent({
    agent: { name: 'reviewer', body: 'Review.', skills: [], tools: null, maxTurns: 4 },
    task: 'inspect auth',
    client,
    models: ['m'],
    tools: { definitions: [], executeTool: async () => 'unused' },
    permissions: { check: async () => ({ allowed: true }) },
    context: {},
  });

  assert.equal(result, 'isolated result');
  assert.deepEqual(capturedMessages.map((message) => message.role), ['system', 'user']);
  assert.match(capturedMessages[1].content, /inspect auth/);
});
