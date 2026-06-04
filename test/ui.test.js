import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import readlinePromises from 'node:readline/promises';
import { promptLabel, createSpinner } from '../src/ui.js';
import { CodeHighlighter } from '../src/ui.js';
import { menuReduce, selectMenu } from '../src/ui.js';

test('promptLabel shows the cwd folder name', () => {
  const label = promptLabel(path.join('C:', 'projects', 'my-app'));
  // colors are disabled under non-TTY test runs, so the label is plain text
  assert.equal(label.includes('my-app'), true);
  assert.equal(label.endsWith(' > '), true);
});

test('spinner is safe to start/update/stop without a TTY', () => {
  const s = createSpinner();
  s.start('thinking...');
  s.update('still thinking...');
  s.stop();
  s.stop(); // idempotent
});

test('highlighter passes prose through unchanged', () => {
  const h = new CodeHighlighter({ enabled: true });
  assert.equal(h.highlight('hello world\n'), 'hello world\n');
});

test('highlighter styles a fenced code block', () => {
  const h = new CodeHighlighter({ enabled: true });
  const out = h.highlight('```js\nconst x = 1;\n```\n');
  assert.match(out, /╭── js/);          // opening rule with language
  assert.match(out, /│ /);              // gutter on the code line
  assert.match(out, /const x = 1;/);    // code text present
  assert.match(out, /╰/);               // closing rule
  assert.ok(out.includes(String.fromCharCode(27) + '[33m')); // yellow ANSI applied to code
});

test('highlighter handles a fence split across chunks', () => {
  const h = new CodeHighlighter({ enabled: true });
  let out = h.highlight('``');
  out += h.highlight('`\ncode line\n```\n');
  assert.match(out, /╭/);
  assert.match(out, /│ /);
  assert.match(out, /code line/);
  assert.match(out, /╰/);
});

test('highlighter flush returns trailing partial line', () => {
  const h = new CodeHighlighter({ enabled: true });
  h.highlight('no newline yet');
  assert.equal(h.flush(), 'no newline yet');
  assert.equal(h.flush(), '');
});

test('highlighter is a pure passthrough when disabled', () => {
  const h = new CodeHighlighter({ enabled: false });
  const text = '```js\ncode\n```\npartial';
  assert.equal(h.highlight(text), text);
  assert.equal(h.flush(), '');
});

test('menuReduce moves and wraps with arrow keys', () => {
  let s = { index: 0, count: 3, done: false, escaped: false };
  s = menuReduce(s, { name: 'down' });
  assert.equal(s.index, 1);
  s = menuReduce(s, { name: 'up' });
  s = menuReduce(s, { name: 'up' });
  assert.equal(s.index, 2); // wrapped from 0 to last
  s = menuReduce(s, { name: 'down' });
  assert.equal(s.index, 0); // wrapped back to first
});

test('menuReduce selects on enter', () => {
  const s = menuReduce({ index: 1, count: 3, done: false, escaped: false }, { name: 'return' });
  assert.deepEqual([s.done, s.index], [true, 1]);
});

test('menuReduce selects directly with a digit', () => {
  const s = menuReduce({ index: 0, count: 4, done: false, escaped: false }, { name: '3', sequence: '3' });
  assert.deepEqual([s.done, s.index], [true, 2]);
});

test('menuReduce ignores out-of-range digits and unknown keys', () => {
  const start = { index: 0, count: 2, done: false, escaped: false };
  assert.deepEqual(menuReduce(start, { name: '9', sequence: '9' }), start);
  assert.deepEqual(menuReduce(start, { name: 'x', sequence: 'x' }), start);
});

test('menuReduce flags escape', () => {
  const s = menuReduce({ index: 0, count: 3, done: false, escaped: false }, { name: 'escape' });
  assert.deepEqual([s.done, s.escaped], [true, true]);
});

test('selectMenu does not let readline eat the selection keystrokes', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  output.on('data', () => {}); // drain so writes never block
  const rl = readlinePromises.createInterface({ input, output, terminal: true });

  const menuPromise = selectMenu(rl, 'Pick:', [
    { label: 'A', value: 'a' },
    { label: 'B', value: 'b' },
  ]);
  input.write('\r'); // Enter selects the first option
  const value = await menuPromise;
  assert.equal(value, 'a');

  // The very next rl.question must receive the FIRST line typed after the
  // menu — if readline buffered the menu's Enter, this hangs or misreads.
  const answerPromise = rl.question('q> ');
  input.write('hello\r');
  const answer = await Promise.race([
    answerPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('rl.question deadlocked after menu')), 2000).unref()),
  ]);
  assert.equal(answer, 'hello');
  rl.close();
});
