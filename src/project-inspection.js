import fs from 'node:fs';
import path from 'node:path';

const CANONICAL_AREAS = [
  'routes',
  'app/Models',
  'app/Http/Controllers',
  'app/Http/Requests',
  'app/Http/Resources',
  'database/migrations',
  'resources/views',
  'resources/js/Pages',
  'resources/js/Components',
  'resources/js/composables',
  'tests',
];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function dependency(packages, name) {
  return packages?.dependencies?.[name] ?? packages?.devDependencies?.[name];
}

export function inspectProject(cwd = process.cwd()) {
  const composer = readJson(path.join(cwd, 'composer.json'));
  const npm = readJson(path.join(cwd, 'package.json'));
  const require = { ...composer?.['require-dev'], ...composer?.require };

  return {
    isLaravel: Boolean(require['laravel/framework']),
    php: require.php,
    laravel: require['laravel/framework'],
    vue: dependency(npm, 'vue'),
    inertia: dependency(npm, '@inertiajs/vue3') ?? require['inertiajs/inertia-laravel'],
    pinia: dependency(npm, 'pinia'),
    vite: dependency(npm, 'vite'),
    pest: require['pestphp/pest'],
    phpunit: require['phpunit/phpunit'],
    areas: CANONICAL_AREAS.filter((area) => fs.existsSync(path.join(cwd, area))),
  };
}
