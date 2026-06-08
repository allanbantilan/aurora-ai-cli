import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function readEntry(file) {
  try {
    const content = fs.readFileSync(file, 'utf8').trim();
    return content ? { file, content } : null;
  } catch {
    return null;
  }
}

function agentsFile(dir) {
  const override = path.join(dir, 'AGENTS.override.md');
  return fs.existsSync(override) ? override : path.join(dir, 'AGENTS.md');
}

function findProjectRoot(cwd) {
  let current = path.resolve(cwd);
  for (;;) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(cwd);
    current = parent;
  }
}

function directoriesBetween(root, cwd) {
  const dirs = [root];
  const relative = path.relative(root, cwd);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return dirs;
  for (const part of relative.split(path.sep)) dirs.push(path.join(dirs.at(-1), part));
  return dirs;
}

export function loadInstructions({ cwd = process.cwd(), home = os.homedir(), projectRoot } = {}) {
  const entries = [];
  const add = (file) => {
    const entry = readEntry(file);
    if (entry) entries.push(entry);
  };

  add(agentsFile(path.join(home, '.aurora')));
  const root = projectRoot ? path.resolve(projectRoot) : findProjectRoot(cwd);
  for (const dir of directoriesBetween(root, path.resolve(cwd))) {
    add(path.join(dir, 'CLAUDE.md'));
    add(agentsFile(dir));
  }
  return entries;
}

export function formatInstructionContext(entries, { cwd = process.cwd(), maxChars = 12_000 } = {}) {
  let output = '';
  for (const entry of entries) {
    const label = path.relative(cwd, entry.file) || path.basename(entry.file);
    const section = `${output ? '\n\n' : ''}[${label}]\n${entry.content}`;
    if (output.length + section.length <= maxChars) {
      output += section;
      continue;
    }
    const remaining = maxChars - output.length;
    if (remaining > 0) output += section.slice(0, remaining);
    break;
  }
  return output;
}
