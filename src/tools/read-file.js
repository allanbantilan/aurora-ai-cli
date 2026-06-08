import fs from 'node:fs';
import path from 'node:path';
import { resolveSafe } from '../paths.js';
import { inspectProject } from '../project-inspection.js';
import { collectFiles } from '../walk.js';

export const definition = {
  type: 'function',
  function: {
    name: 'read_file',
    description: 'Read a file and return its content with line numbers.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to the working directory' },
        start_line: { type: 'integer', description: 'First line to read, inclusive (default 1)' },
        end_line: { type: 'integer', description: 'Last line to read, inclusive (default end of file)' },
      },
      required: ['path'],
    },
  },
};

export function execute({ path: relPath, start_line: startLine = 1, end_line: endLine }, cwd = process.cwd()) {
  validateRange(startLine, endLine);
  const file = resolveSafe(relPath, cwd);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const lastLine = endLine ?? lines.length;
  if (startLine > lines.length) {
    return `(requested range ${startLine}-${lastLine} is beyond the ${lines.length}-line file)`;
  }

  const content = lines
    .slice(startLine - 1, lastLine)
    .map((line, i) => `${startLine + i}\t${line}`)
    .join('\n');
  const related = relatedFiles(relPath, cwd);
  return related.length ? `${content}\n\nRelated files:\n${related.map((rel) => `- ${rel}`).join('\n')}` : content;
}

function validateRange(startLine, endLine) {
  if (!Number.isInteger(startLine) || startLine < 1 || (endLine !== undefined && (!Number.isInteger(endLine) || endLine < 1))) {
    throw new Error('start_line and end_line must be positive integers');
  }
  if (endLine !== undefined && startLine > endLine) {
    throw new Error('start_line must be less than or equal to end_line');
  }
}

function relatedFiles(relPath, cwd) {
  if (!inspectProject(cwd).isLaravel) return [];

  const normalized = relPath.replaceAll('\\', '/');
  const name = path.posix.basename(normalized).replace(/\.(?:blade\.)?(?:php|vue)$/, '');
  const candidates = [];

  if (/^app\/Models\/.+\.php$/i.test(normalized)) {
    const plural = `${name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}s`;
    candidates.push(
      `database/factories/${name}Factory.php`,
      `app/Policies/${name}Policy.php`,
      `app/Http/Resources/${name}Resource.php`
    );
    candidates.push(...collectFiles(cwd, 'database/migrations/*.php').filter((rel) => rel.includes(plural)));
    candidates.push(...collectFiles(cwd, 'tests/**/*.php').filter((rel) => path.posix.basename(rel).includes(name)));
  } else if (/^app\/Http\/Controllers\/.+Controller\.php$/i.test(normalized)) {
    candidates.push(...collectFiles(cwd, 'routes/*.php'));
    candidates.push(...collectFiles(cwd, 'app/Http/{Requests,Resources}/**/*.php').filter((rel) => rel.includes(name.replace(/Controller$/, ''))));
    candidates.push(...collectFiles(cwd, 'tests/**/*.php').filter((rel) => rel.includes(name.replace(/Controller$/, ''))));
  } else if (/^resources\/js\/Pages\/.+\.vue$/i.test(normalized)) {
    candidates.push(...collectFiles(cwd, 'app/Http/Controllers/**/*.php').filter((rel) => rel.includes(name)));
    candidates.push(...collectFiles(cwd, 'resources/js/Pages/**/*.vue').filter((rel) => rel !== normalized && rel.includes(name)));
  } else if (/^routes\/.+\.php$/i.test(normalized)) {
    candidates.push(...collectFiles(cwd, 'app/Http/Controllers/**/*.php'));
  }

  return [...new Set(candidates)]
    .filter((rel) => rel !== normalized && fs.existsSync(path.join(cwd, rel)))
    .sort();
}
