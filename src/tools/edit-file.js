import fs from 'node:fs';
import { resolveSafe } from '../paths.js';

export const definition = {
  type: 'function',
  function: {
    name: 'edit_file',
    description:
      'Replace one exact unique string in an existing file. Use when: making a focused change after reading live content. Prefer this tool over sed or Perl shell edits. Example: replace one function body.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to the working directory. Example: "src/app.js".' },
        old_string: { type: 'string', description: 'Exact text to replace (must be unique in the file). Example: "const enabled = false;".' },
        new_string: { type: 'string', description: 'Replacement text. Example: "const enabled = true;".' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
};

export function execute({ path: relPath, old_string, new_string }, cwd = process.cwd()) {
  const file = resolveSafe(relPath, cwd);
  const content = fs.readFileSync(file, 'utf8');
  const count = content.split(old_string).length - 1;
  if (count === 0) throw new Error(`old_string not found in ${relPath}`);
  if (count > 1) throw new Error(`old_string found ${count} times in ${relPath}; it must be unique`);
  fs.writeFileSync(file, content.replace(old_string, () => new_string));
  return `Edited ${relPath}`;
}
