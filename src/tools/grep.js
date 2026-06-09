import fs from 'node:fs';
import path from 'node:path';
import picomatch from 'picomatch';
import { collectFiles } from '../walk.js';
import { inspectProject } from '../project-inspection.js';

const PRESETS = {
  'php-classes': {
    globs: ['**/*.php'],
    pattern: '\\b(?:(?:abstract|final)\\s+)?(?:class|interface|trait|enum)\\s+\\w+',
  },
  'php-methods': {
    globs: ['**/*.php'],
    pattern: '\\bfunction\\s+\\w+\\s*\\(',
  },
  routes: {
    globs: ['routes/*.php'],
    pattern: '\\bRoute::',
    laravel: true,
  },
  'eloquent-models': {
    globs: ['app/Models/**/*.php'],
    pattern: 'extends\\s+Model\\b',
    laravel: true,
  },
  blade: {
    globs: ['resources/views/**/*.blade.php'],
    pattern: '\\{\\{|\\{!!|@\\w+',
    laravel: true,
  },
  'vue-components': {
    globs: ['resources/js/**/*.vue'],
    pattern: '<script\\s+setup|defineProps|defineEmits',
    laravel: true,
  },
  'vue-composables': {
    globs: ['resources/js/composables/**/*.{js,ts}'],
    pattern: '\\buse[A-Z]\\w*',
    laravel: true,
  },
  inertia: {
    globs: ['**/*.php', 'resources/js/**/*.{js,ts,vue}'],
    pattern: 'Inertia::|@inertiajs/vue3|useForm\\(',
    laravel: true,
  },
};

export const definition = {
  type: 'function',
  function: {
    name: 'grep',
    description: 'Search file contents with a regex or preset. Use when: locating symbols, routes, or text inside files. Prefer this tool over shell grep or rg. Example: search for ProductController or use the routes preset.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'JavaScript regex pattern to search for. Example: "\\bclass\\s+Product".' },
        glob: { type: 'string', description: 'Limit search to files matching this glob (default all files). Example: "app/**/*.php".' },
        regex_flags: { type: 'string', description: 'JavaScript regex flags. Example: "i".' },
        preset: {
          type: 'string',
          enum: Object.keys(PRESETS),
          description: 'Common PHP/Laravel/Vue search preset; Laravel presets require detected Laravel. Example: "routes".',
        },
      },
      required: [],
    },
  },
};

export function execute({ pattern, glob = '**/*', regex_flags: regexFlags = '', preset } = {}, cwd = process.cwd()) {
  if (preset && !PRESETS[preset]) {
    throw new Error(`Unknown grep preset "${preset}". Available: ${Object.keys(PRESETS).join(', ')}`);
  }
  const presetConfig = preset ? PRESETS[preset] : undefined;
  if (presetConfig?.laravel && !inspectProject(cwd).isLaravel) {
    throw new Error(`Grep preset "${preset}" requires a detected Laravel project`);
  }
  const expression = pattern ?? presetConfig?.pattern;
  if (expression === undefined) {
    throw new Error('pattern is required when preset is not provided');
  }

  const regex = new RegExp(expression, regexFlags);
  const globMatch = picomatch(glob);
  const presetMatch = presetConfig ? picomatch(presetConfig.globs) : () => true;
  const matches = [];
  for (const rel of collectFiles(cwd).filter((file) => globMatch(file) && presetMatch(file))) {
    let content;
    try {
      content = fs.readFileSync(path.join(cwd, rel), 'utf8');
    } catch {
      continue; // unreadable/binary-ish: skip
    }
    content.split('\n').forEach((line, i) => {
      regex.lastIndex = 0;
      if (regex.test(line)) matches.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
  return matches.length ? matches.join('\n') : '(no matches)';
}
