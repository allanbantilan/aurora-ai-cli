import fs from 'node:fs';
import path from 'node:path';
import { resolveSafe } from '../paths.js';

export const definition = {
  type: 'function',
  function: {
    name: 'write_file',
    description: 'Create or overwrite a file with the given content. Creates parent directories.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to the working directory' },
        content: { type: 'string', description: 'Full file content to write' },
      },
      required: ['path', 'content'],
    },
  },
};

export function execute({ path: relPath, content }, cwd = process.cwd()) {
  const file = resolveSafe(relPath, cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return `Wrote ${relPath} (${content.length} chars)`;
}
