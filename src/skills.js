import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { findProjectRoot, readDefinitionDirectory } from './definitions.js';

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_BUNDLED_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills');

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

export function discoverSkills({ cwd = process.cwd(), home = os.homedir(), bundledDir = DEFAULT_BUNDLED_DIR } = {}) {
  const root = findProjectRoot(cwd);
  const byName = new Map();
  const load = (dir, scope) => {
    for (const parsed of readDefinitionDirectory(dir, 'SKILL.md')) {
      const skill = validSkill(parsed, scope);
      if (skill) byName.set(skill.name, skill);
    }
  };
  load(bundledDir, 'bundled');
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

const STOP_WORDS = new Set(['a', 'an', 'and', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'this', 'to', 'with']);

function words(text) {
  return new Set(String(text).toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 2 && !STOP_WORDS.has(word)) ?? []);
}

export function activateSkills(input, skills, { maxChars = 8_000 } = {}) {
  const explicit = String(input).match(/^\$([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s+([\s\S]*))?$/i);
  let selected = [];
  let cleanInput = String(input);
  if (explicit) {
    const skill = skills.find((candidate) => candidate.name === explicit[1].toLowerCase());
    if (!skill) return { input: String(input), selected: [], error: `Unknown skill: $${explicit[1]}` };
    selected = [skill];
    cleanInput = (explicit[2] ?? '').trim();
  } else {
    const inputWords = words(input);
    selected = skills.filter((skill) => {
      if (!skill.implicit) return false;
      const descriptionWords = words(skill.description);
      const overlap = [...descriptionWords].filter((word) => inputWords.has(word)).length;
      return overlap >= 2 && overlap / Math.max(descriptionWords.size, 1) >= 0.2;
    }).slice(0, 2);
  }

  let remaining = maxChars;
  selected = selected.map((skill) => {
    const body = skill.body.slice(0, remaining);
    remaining -= body.length;
    return { ...skill, body };
  }).filter((skill) => skill.body);
  return { input: cleanInput, selected };
}
