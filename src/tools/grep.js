import fs from 'node:fs';
import path from 'node:path';
import { collectFiles } from '../walk.js';

export const definition = {
  type: 'function',
  function: {
    name: 'grep',
    description: 'Search file contents with a regex. Returns "path:line: text" matches.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'JavaScript regex pattern to search for' },
        glob: { type: 'string', description: 'Limit search to files matching this glob (default all files)' },
      },
      required: ['pattern'],
    },
  },
};

export function execute({ pattern, glob = '**/*' }, cwd = process.cwd()) {
  const regex = new RegExp(pattern);
  const matches = [];
  for (const rel of collectFiles(cwd, glob)) {
    let content;
    try {
      content = fs.readFileSync(path.join(cwd, rel), 'utf8');
    } catch {
      continue; // unreadable/binary-ish: skip
    }
    content.split('\n').forEach((line, i) => {
      if (regex.test(line)) matches.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
  return matches.length ? matches.join('\n') : '(no matches)';
}
