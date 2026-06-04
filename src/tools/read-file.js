import fs from 'node:fs';
import { resolveSafe } from '../paths.js';

export const definition = {
  type: 'function',
  function: {
    name: 'read_file',
    description: 'Read a file and return its content with line numbers.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to the working directory' },
      },
      required: ['path'],
    },
  },
};

export function execute({ path: relPath }, cwd = process.cwd()) {
  const file = resolveSafe(relPath, cwd);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  return lines.map((line, i) => `${i + 1}\t${line}`).join('\n');
}
