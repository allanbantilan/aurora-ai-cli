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

test('grep finds matching lines with locations', () => {
  const dir = tmpProject();
  const out = grep.execute({ pattern: 'const y' }, dir);
  assert.equal(out, 'src/app.js:2: const y = 2;');
});

test('grep reports no matches', () => {
  const dir = tmpProject();
  assert.equal(grep.execute({ pattern: 'zzz' }, dir), '(no matches)');
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
