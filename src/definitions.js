import fs from 'node:fs';
import path from 'node:path';

export function findProjectRoot(cwd = process.cwd()) {
  let current = path.resolve(cwd);
  for (;;) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(cwd);
    current = parent;
  }
}

function parseValue(value) {
  const clean = value.trim();
  if (/^(?:true|false)$/i.test(clean)) return clean.toLowerCase() === 'true';
  if (/^\d+$/.test(clean)) return Number(clean);
  return clean.replace(/^(['"])(.*)\1$/, '$2');
}

export function parseDefinitionFile(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
    if (!match) return null;
    const metadata = {};
    for (const line of match[1].split(/\r?\n/)) {
      const field = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
      if (field) metadata[field[1]] = parseValue(field[2]);
    }
    return { metadata, body: match[2].trim(), file };
  } catch {
    return null;
  }
}

export function readDefinitionDirectory(dir, entryFile = null) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const file = entryFile
        ? path.join(dir, entry.name, entryFile)
        : path.join(dir, entry.name);
      if (entryFile ? !entry.isDirectory() : !entry.isFile() || path.extname(entry.name) !== '.md') return [];
      const parsed = parseDefinitionFile(file);
      return parsed ? [parsed] : [];
    });
  } catch {
    return [];
  }
}
