import path from 'node:path';
import os from 'node:os';
import { findProjectRoot, readDefinitionDirectory } from './definitions.js';

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validSkill(parsed, scope) {
  const { name, description, implicit = false } = parsed.metadata;
  if (!NAME_RE.test(name ?? '') || typeof description !== 'string' || !description.trim() || !parsed.body) return null;
  return {
    name,
    description: description.trim(),
    implicit: implicit === true,
    body: parsed.body,
    file: parsed.file,
    dir: path.dirname(parsed.file),
    scope,
  };
}

export function discoverSkills({ cwd = process.cwd(), home = os.homedir() } = {}) {
  const root = findProjectRoot(cwd);
  const byName = new Map();
  const load = (dir, scope) => {
    for (const parsed of readDefinitionDirectory(dir, 'SKILL.md')) {
      const skill = validSkill(parsed, scope);
      if (skill) byName.set(skill.name, skill);
    }
  };
  load(path.join(home, '.aurora', 'skills'), 'global');
  load(path.join(root, '.aurora', 'skills'), 'project');
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function formatSkillCatalog(skills, { maxChars = 4_000 } = {}) {
  let output = '';
  for (const skill of skills) {
    const line = `${output ? '\n' : ''}- $${skill.name}: ${skill.description}`;
    if (output.length + line.length > maxChars) break;
    output += line;
  }
  return output;
}
