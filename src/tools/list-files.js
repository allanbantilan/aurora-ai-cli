import { collectFiles } from '../walk.js';
import picomatch from 'picomatch';
import { inspectProject } from '../project-inspection.js';

const CATEGORIES = {
  routes: ['routes/*.php'],
  models: ['app/Models/**/*.php'],
  controllers: ['app/Http/Controllers/**/*.php'],
  requests: ['app/Http/Requests/**/*.php'],
  resources: ['app/Http/Resources/**/*.php'],
  migrations: ['database/migrations/*.php'],
  tests: ['tests/**/*.php'],
  blade: ['resources/views/**/*.blade.php'],
  'vue-pages': ['resources/js/Pages/**/*.vue'],
  'vue-components': ['resources/js/Components/**/*.vue'],
  'vue-composables': ['resources/js/composables/**/*.{js,ts}'],
  php: ['**/*.php'],
  vue: ['**/*.vue'],
};

export const definition = {
  type: 'function',
  function: {
    name: 'list_files',
    description: 'List files matching a glob pattern or a detected Laravel/Vue category.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern relative to the working directory' },
        category: {
          type: 'string',
          enum: Object.keys(CATEGORIES),
          description: 'Laravel/Vue file category; requires a detected Laravel project',
        },
      },
      required: [],
    },
  },
};

export function execute({ pattern = '**/*', category } = {}, cwd = process.cwd()) {
  if (category && !CATEGORIES[category]) {
    throw new Error(`Unknown file category "${category}". Available: ${Object.keys(CATEGORIES).join(', ')}`);
  }
  if (category && !inspectProject(cwd).isLaravel) {
    throw new Error(`File category "${category}" requires a detected Laravel project; use pattern for generic projects`);
  }

  const patternMatch = picomatch(pattern);
  const categoryMatch = category ? picomatch(CATEGORIES[category]) : () => true;
  const files = collectFiles(cwd).filter((rel) => patternMatch(rel) && categoryMatch(rel));
  return files.length ? files.join('\n') : '(no matches)';
}
