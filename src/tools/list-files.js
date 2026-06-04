import { collectFiles } from '../walk.js';

export const definition = {
  type: 'function',
  function: {
    name: 'list_files',
    description: 'List files matching a glob pattern, e.g. "src/**/*.js". Defaults to all files.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern relative to the working directory' },
      },
      required: [],
    },
  },
};

export function execute({ pattern = '**/*' } = {}, cwd = process.cwd()) {
  const files = collectFiles(cwd, pattern);
  return files.length ? files.join('\n') : '(no matches)';
}
