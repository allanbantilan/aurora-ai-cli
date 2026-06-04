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

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jai-tools-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'app.js'), 'const x = 1;\nconst y = 2;\n');
  fs.writeFileSync(path.join(dir, 'readme.md'), 'hello world\n');
  return dir;
}

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
