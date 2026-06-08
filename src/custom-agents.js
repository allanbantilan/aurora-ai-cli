import path from 'node:path';
import os from 'node:os';
import { findProjectRoot, readDefinitionDirectory } from './definitions.js';

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MODES = new Set(['permission', 'auto', 'plan']);

function list(value) {
  return typeof value === 'string'
    ? value.split(',').map((item) => item.trim()).filter(Boolean)
    : [];
}

function validAgent(parsed, scope) {
  const { name, description } = parsed.metadata;
  const mode = parsed.metadata.mode ?? 'permission';
  const maxTurns = parsed.metadata.max_turns ?? 15;
  if (
    !NAME_RE.test(name ?? '') ||
    typeof description !== 'string' ||
    !description.trim() ||
    !parsed.body ||
    !MODES.has(mode) ||
    !Number.isInteger(maxTurns) ||
    maxTurns < 1 ||
    maxTurns > 30
  ) return null;
  return {
    name,
    description: description.trim(),
    mode,
    maxTurns,
    tools: parsed.metadata.tools ? list(parsed.metadata.tools) : null,
    skills: list(parsed.metadata.skills),
    body: parsed.body,
    file: parsed.file,
    scope,
  };
}

export function discoverCustomAgents({ cwd = process.cwd(), home = os.homedir() } = {}) {
  const root = findProjectRoot(cwd);
  const byName = new Map();
  const load = (dir, scope) => {
    for (const parsed of readDefinitionDirectory(dir)) {
      const agent = validAgent(parsed, scope);
      if (agent) byName.set(agent.name, agent);
    }
  };
  load(path.join(home, '.aurora', 'agents'), 'global');
  load(path.join(root, '.aurora', 'agents'), 'project');
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function routeCustomAgentInput(input, agents) {
  const match = String(input).match(/^@([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s+([\s\S]*))?$/i);
  if (!match) return { matched: false };
  const agent = agents.find((candidate) => candidate.name === match[1].toLowerCase());
  if (!agent) return { matched: false };
  const task = (match[2] ?? '').trim();
  if (!task) return { matched: true, error: `@${agent.name} requires a task.` };
  return {
    matched: true,
    agent,
    task,
    announcement: `◆ @${agent.name} dispatched — ${agent.description}`,
  };
}
