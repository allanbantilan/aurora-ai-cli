import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const DEFAULT_BASE_DIR = path.join(os.homedir(), '.aurora', 'memory');
const SECRET_RE = /(?:\b(?:api[_ -]?key|password|passwd|secret|token)\b\s*[:=]|\bsk-[a-z0-9_-]{8,})/i;
const EXPLICIT_PREFERENCE_RE = /\b(?:always|never|prefer|preference is|use\b.+\binstead of|do not|don't)\b/i;
const TRANSIENT_RE = /\b(?:this|that|current|today|now|once|temporarily|for this|for now|next time|in this task|in this file)\b/i;

function normalize(text) {
  return String(text ?? '').trim().replace(/\s+/g, ' ');
}

function key(text) {
  return normalize(text).toLocaleLowerCase();
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function projectId(cwd) {
  return crypto.createHash('sha256').update(path.resolve(cwd).toLocaleLowerCase()).digest('hex').slice(0, 16);
}

function memoryFile(baseDir, cwd, scope) {
  return scope === 'global'
    ? path.join(baseDir, 'global.json')
    : path.join(baseDir, 'projects', `${projectId(cwd)}.json`);
}

export function extractExplicitPreferences(input) {
  return (String(input).match(/[^.!?\n]+[.!?]?/g) ?? [])
    .map((sentence) => normalize(sentence))
    .filter((sentence) =>
      sentence.length >= 8 &&
      sentence.length <= 500 &&
      EXPLICIT_PREFERENCE_RE.test(sentence) &&
      !TRANSIENT_RE.test(sentence) &&
      !SECRET_RE.test(sentence) &&
      !/^never mind[.!]?$/i.test(sentence)
    )
    .slice(0, 3);
}

export function learnExplicitPreferences(input, store) {
  if (!store.isEnabled()) return 0;
  return extractExplicitPreferences(input)
    .filter((preference) => store.add(preference, 'project').added)
    .length;
}

function readMemories(file) {
  const value = readJson(file, {});
  return Array.isArray(value.memories) ? value.memories.filter((item) => typeof item?.text === 'string') : [];
}

export function createMemoryStore({ baseDir = DEFAULT_BASE_DIR, cwd = process.cwd() } = {}) {
  const fileFor = (scope) => memoryFile(baseDir, cwd, scope === 'global' ? 'global' : 'project');

  return {
    list() {
      return ['global', 'project'].flatMap((scope) =>
        readMemories(fileFor(scope)).map(({ text }) => ({ scope, text }))
      );
    },

    add(text, scope = 'project') {
      const clean = normalize(text);
      if (!clean) return { added: false, reason: 'empty' };
      if (clean.length > 500) return { added: false, reason: 'too_long' };
      if (SECRET_RE.test(clean)) return { added: false, reason: 'secret' };

      const file = fileFor(scope);
      const memories = readMemories(file);
      if (memories.some((item) => key(item.text) === key(clean))) return { added: false, reason: 'duplicate' };
      memories.push({ text: clean, createdAt: new Date().toISOString() });
      writeJson(file, { version: 1, memories });
      return { added: true, scope: scope === 'global' ? 'global' : 'project', text: clean };
    },

    remove(text, scope = 'project') {
      const file = fileFor(scope);
      const memories = readMemories(file);
      const filtered = memories.filter((item) => key(item.text) !== key(text));
      if (filtered.length === memories.length) return false;
      writeJson(file, { version: 1, memories: filtered });
      return true;
    },

    isEnabled() {
      return readJson(path.join(baseDir, 'settings.json'), {}).enabled !== false;
    },

    setEnabled(enabled) {
      writeJson(path.join(baseDir, 'settings.json'), { version: 1, enabled: Boolean(enabled) });
    },
  };
}
