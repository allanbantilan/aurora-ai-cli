import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { discoverCustomAgents, routeCustomAgentInput } from '../src/custom-agents.js';

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
