import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as readFile from '../src/tools/read-file.js';
import * as listFiles from '../src/tools/list-files.js';
import * as grep from '../src/tools/grep.js';
import * as writeFile from '../src/tools/write-file.js';
import * as editFile from '../src/tools/edit-file.js';
import * as runCommand from '../src/tools/run-command.js';
import * as inspectProjectTool from '../src/tools/inspect-project.js';
import { inspectProject } from '../src/project-inspection.js';
import { definitions } from '../src/tools/index.js';

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jai-tools-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'app.js'), 'const x = 1;\nconst y = 2;\n');
  fs.writeFileSync(path.join(dir, 'readme.md'), 'hello world\n');
  return dir;
}

function tmpLaravelProject() {
  const dir = tmpProject();
  fs.writeFileSync(path.join(dir, 'composer.json'), JSON.stringify({
    require: {
      php: '^8.3',
      'laravel/framework': '^12.0',
      'inertiajs/inertia-laravel': '^2.0',
    },
    'require-dev': {
      'pestphp/pest': '^3.0',
    },
  }));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    dependencies: {
      vue: '^3.5.0',
      '@inertiajs/vue3': '^2.0.0',
      pinia: '^3.0.0',
    },
    devDependencies: {
      vite: '^7.0.0',
    },
  }));
  for (const rel of ['routes', 'app/Models', 'app/Http/Controllers', 'database/migrations', 'resources/js/Pages']) {
    fs.mkdirSync(path.join(dir, rel), { recursive: true });
  }
  return dir;
}

test('inspectProject detects Laravel and related stack metadata', () => {
  const project = inspectProject(tmpLaravelProject());

  assert.equal(project.isLaravel, true);
  assert.equal(project.php, '^8.3');
  assert.equal(project.laravel, '^12.0');
  assert.equal(project.vue, '^3.5.0');
  assert.equal(project.inertia, '^2.0.0');
  assert.equal(project.pinia, '^3.0.0');
  assert.equal(project.vite, '^7.0.0');
  assert.equal(project.pest, '^3.0');
  assert.deepEqual(project.areas, [
    'routes',
    'app/Models',
    'app/Http/Controllers',
    'database/migrations',
    'resources/js/Pages',
  ]);
});

test('inspectProject treats missing and malformed package metadata as generic', () => {
  const missing = inspectProject(tmpProject());
  assert.equal(missing.isLaravel, false);

  const malformedDir = tmpProject();
  fs.writeFileSync(path.join(malformedDir, 'composer.json'), '{bad');
  fs.writeFileSync(path.join(malformedDir, 'package.json'), '{bad');
  const malformed = inspectProject(malformedDir);
  assert.equal(malformed.isLaravel, false);
  assert.equal(malformed.vue, undefined);
});

test('inspect_project summarizes confirmed Laravel stack and areas', () => {
  const out = inspectProjectTool.execute({}, tmpLaravelProject());

  assert.match(out, /Project type: Laravel/);
  assert.match(out, /Laravel: \^12\.0/);
  assert.match(out, /Vue: \^3\.5\.0/);
  assert.match(out, /Existing areas:.*routes.*resources\/js\/Pages/s);
});

test('inspect_project clearly reports generic projects', () => {
  assert.match(inspectProjectTool.execute({}, tmpProject()), /Project type: Generic/);
});

test('inspect_project is registered as a tool', () => {
  assert.ok(definitions.some((tool) => tool.function.name === 'inspect_project'));
});

test('read_file returns numbered lines', () => {
  const dir = tmpProject();
  const out = readFile.execute({ path: 'src/app.js' }, dir);
  assert.match(out, /1\tconst x = 1;/);
  assert.match(out, /2\tconst y = 2;/);
  assert.doesNotMatch(out, /Related files:/);
});

test('read_file returns an inclusive numbered line range', () => {
  const dir = tmpProject();
  fs.writeFileSync(path.join(dir, 'src', 'app.js'), 'one\ntwo\nthree\nfour');

  assert.equal(readFile.execute({ path: 'src/app.js', start_line: 2, end_line: 3 }, dir), '2\ttwo\n3\tthree');
});

test('read_file validates line ranges and reports ranges beyond the file', () => {
  const dir = tmpProject();

  assert.throws(
    () => readFile.execute({ path: 'src/app.js', start_line: 0 }, dir),
    /positive integers/
  );
  assert.throws(
    () => readFile.execute({ path: 'src/app.js', start_line: 3, end_line: 2 }, dir),
    /start_line.*end_line/
  );
  assert.equal(
    readFile.execute({ path: 'src/app.js', start_line: 20, end_line: 30 }, dir),
    '(requested range 20-30 is beyond the 3-line file)'
  );
});

test('read_file suggests existing related files for Laravel models', () => {
  const dir = tmpLaravelProject();
  const files = {
    'app/Models/Product.php': '<?php\nclass Product {}',
    'database/migrations/2026_01_01_000000_create_products_table.php': '<?php',
    'database/factories/ProductFactory.php': '<?php',
    'app/Policies/ProductPolicy.php': '<?php',
    'app/Http/Resources/ProductResource.php': '<?php',
    'tests/Feature/ProductTest.php': '<?php',
  };
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }

  const out = readFile.execute({ path: 'app/Models/Product.php' }, dir);

  assert.match(out, /Related files:/);
  assert.match(out, /database\/migrations\/2026_01_01_000000_create_products_table\.php/);
  assert.match(out, /database\/factories\/ProductFactory\.php/);
  assert.match(out, /app\/Policies\/ProductPolicy\.php/);
  assert.match(out, /app\/Http\/Resources\/ProductResource\.php/);
  assert.match(out, /tests\/Feature\/ProductTest\.php/);
});

test('read_file rejects path escape', () => {
  const dir = tmpProject();
  assert.throws(() => readFile.execute({ path: '../oops' }, dir), /escapes/);
});

test('list_files returns matching paths', () => {
  const dir = tmpProject();
  assert.equal(listFiles.execute({ pattern: '**/*.js' }, dir), 'src/app.js');
});

test('list_files reports no matches', () => {
  const dir = tmpProject();
  assert.equal(listFiles.execute({ pattern: '**/*.py' }, dir), '(no matches)');
});

test('list_files returns canonical Laravel and Vue categories', () => {
  const dir = tmpLaravelProject();
  const files = [
    'app/Models/Product.php',
    'app/Http/Controllers/ProductController.php',
    'resources/js/Pages/Products/Index.vue',
    'resources/js/Components/ProductCard.vue',
    'resources/js/composables/useProducts.js',
    'resources/views/products/index.blade.php',
  ];
  for (const rel of files) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), '');
  }

  assert.equal(listFiles.execute({ category: 'models' }, dir), 'app/Models/Product.php');
  assert.equal(listFiles.execute({ category: 'vue-pages' }, dir), 'resources/js/Pages/Products/Index.vue');
  assert.match(listFiles.execute({ category: 'php' }, dir), /app\/Models\/Product\.php/);
  assert.match(listFiles.execute({ category: 'vue' }, dir), /resources\/js\/Components\/ProductCard\.vue/);
});

test('list_files combines a Laravel category with a caller glob', () => {
  const dir = tmpLaravelProject();
  for (const rel of ['app/Models/Product.php', 'app/Models/User.php']) {
    fs.writeFileSync(path.join(dir, rel), '');
  }

  assert.equal(listFiles.execute({ category: 'models', pattern: '**/Product.php' }, dir), 'app/Models/Product.php');
});

test('list_files rejects unknown categories and Laravel categories in generic projects', () => {
  const laravel = tmpLaravelProject();
  assert.throws(() => listFiles.execute({ category: 'services' }, laravel), /Unknown file category/);
  assert.throws(() => listFiles.execute({ category: 'models' }, tmpProject()), /requires a detected Laravel project/);
});

test('grep finds matching lines with locations', () => {
  const dir = tmpProject();
  const out = grep.execute({ pattern: 'const y' }, dir);
  assert.equal(out, 'src/app.js:2: const y = 2;');
});

test('grep reports no matches', () => {
  const dir = tmpProject();
  assert.equal(grep.execute({ pattern: 'zzz' }, dir), '(no matches)');
});

test('grep uses generic PHP class and method presets outside Laravel', () => {
  const dir = tmpProject();
  fs.mkdirSync(path.join(dir, 'lib'));
  fs.writeFileSync(path.join(dir, 'lib', 'Worker.php'), '<?php\nclass Worker\n{\n    public function run() {}\n}\n');

  assert.equal(grep.execute({ preset: 'php-classes' }, dir), 'lib/Worker.php:2: class Worker');
  assert.equal(grep.execute({ preset: 'php-methods' }, dir), 'lib/Worker.php:4: public function run() {}');
});

test('grep uses Laravel and Vue presets with defaults and caller overrides', () => {
  const dir = tmpLaravelProject();
  const files = {
    'routes/web.php': "<?php\nRoute::get('/products', ProductController::class);\n",
    'app/Models/Product.php': '<?php\nclass Product extends Model {}\n',
    'resources/js/Pages/Products/Index.vue': '<script setup>\nimport { useForm } from "@inertiajs/vue3";\n</script>\n',
  };
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }

  assert.match(grep.execute({ preset: 'routes' }, dir), /routes\/web\.php:2/);
  assert.match(grep.execute({ preset: 'eloquent-models' }, dir), /app\/Models\/Product\.php:2/);
  assert.match(grep.execute({ preset: 'inertia' }, dir), /resources\/js\/Pages\/Products\/Index\.vue:2/);
  assert.equal(
    grep.execute({ preset: 'routes', pattern: 'ProductController' }, dir),
    "routes/web.php:2: Route::get('/products', ProductController::class);"
  );
});

test('grep rejects unknown presets and Laravel presets in generic projects', () => {
  const laravel = tmpLaravelProject();
  assert.throws(() => grep.execute({ preset: 'services' }, laravel), /Unknown grep preset/);
  assert.throws(() => grep.execute({ preset: 'routes' }, tmpProject()), /requires a detected Laravel project/);
});

test('grep requires a pattern without a preset and resets global regex state per line', () => {
  const dir = tmpProject();
  fs.writeFileSync(path.join(dir, 'src', 'app.js'), 'const x = 1;\nconst x = 2;\n');

  assert.throws(() => grep.execute({}, dir), /pattern is required/);
  assert.equal(
    grep.execute({ pattern: 'const x', glob: '**/*.js', regex_flags: 'g' }, dir),
    'src/app.js:1: const x = 1;\nsrc/app.js:2: const x = 2;'
  );
});

test('write_file creates a file, including parent dirs', () => {
  const dir = tmpProject();
  writeFile.execute({ path: 'new/deep/file.txt', content: 'hi' }, dir);
  assert.equal(fs.readFileSync(path.join(dir, 'new', 'deep', 'file.txt'), 'utf8'), 'hi');
});

test('write_file rejects new Laravel files when Laravel is not installed', () => {
  const dir = tmpProject();
  assert.throws(
    () => writeFile.execute({ path: 'resources/views/landing.blade.php', content: '<h1>Hi</h1>' }, dir),
    /Laravel is not confirmed/i
  );
  assert.equal(fs.existsSync(path.join(dir, 'resources', 'views', 'landing.blade.php')), false);
});

test('write_file allows new Laravel files in a verified Laravel project', () => {
  const dir = tmpProject();
  fs.writeFileSync(path.join(dir, 'artisan'), '');
  fs.writeFileSync(path.join(dir, 'composer.json'), JSON.stringify({ require: { 'laravel/framework': '^12.0' } }));

  writeFile.execute({ path: 'routes/web.php', content: '<?php' }, dir);

  assert.equal(fs.readFileSync(path.join(dir, 'routes', 'web.php'), 'utf8'), '<?php');
});

test('write_file rejects path escape', () => {
  const dir = tmpProject();
  assert.throws(() => writeFile.execute({ path: '../evil.txt', content: 'x' }, dir), /escapes/);
});

test('edit_file replaces a unique string', () => {
  const dir = tmpProject();
  editFile.execute({ path: 'src/app.js', old_string: 'const x = 1;', new_string: 'const x = 42;' }, dir);
  assert.match(fs.readFileSync(path.join(dir, 'src', 'app.js'), 'utf8'), /const x = 42;/);
});

test('edit_file rejects missing old_string', () => {
  const dir = tmpProject();
  assert.throws(
    () => editFile.execute({ path: 'src/app.js', old_string: 'nope', new_string: 'x' }, dir),
    /not found/
  );
});

test('edit_file rejects non-unique old_string', () => {
  const dir = tmpProject();
  fs.writeFileSync(path.join(dir, 'dup.txt'), 'aa\naa\n');
  assert.throws(
    () => editFile.execute({ path: 'dup.txt', old_string: 'aa', new_string: 'b' }, dir),
    /2 times/
  );
});

test('edit_file treats $ patterns in new_string literally', () => {
  const dir = tmpProject();
  editFile.execute({ path: 'src/app.js', old_string: 'const x = 1;', new_string: 'const x = "$&$$";' }, dir);
  assert.match(fs.readFileSync(path.join(dir, 'src', 'app.js'), 'utf8'), /const x = "\$&\$\$";/);
});

test('run_command captures stdout', async () => {
  const dir = tmpProject();
  const out = await runCommand.execute({ command: 'node -e "console.log(1)"' }, dir);
  assert.match(out, /1/);
});

test('run_command reports output progress before completion', async () => {
  const dir = tmpProject();
  const progress = [];
  const out = await runCommand.execute(
    { command: 'node -e "console.log(\'installing\'); setTimeout(() => console.log(\'done\'), 30)"' },
    dir,
    { onProgress: (text) => progress.push(text) }
  );

  assert.ok(progress.some((text) => text.includes('installing')));
  assert.match(out, /done/);
});

test('run_command disables interactive Composer prompts', async () => {
  const dir = tmpProject();
  const out = await runCommand.execute(
    { command: 'node -e "console.log(process.env.COMPOSER_NO_INTERACTION)"' },
    dir
  );
  assert.match(out, /1/);
});

test('run_command timeout terminates descendant processes and resolves', async () => {
  const dir = tmpProject();
  const started = Date.now();
  const command =
    'node -e "require(\'node:child_process\').spawn(process.execPath,[\'-e\',\'setInterval(()=>{},1000)\'],{stdio:\'inherit\'}); setInterval(()=>{},1000)"';
  const out = await runCommand.execute({ command }, dir, { timeoutMs: 100 });

  assert.match(out, /timed out/i);
  assert.ok(Date.now() - started < 5000);
});

test('run_command reports failure without throwing', async () => {
  const dir = tmpProject();
  const out = await runCommand.execute({ command: 'node -e "process.exit(3)"' }, dir);
  assert.match(out, /Command failed/);
});
