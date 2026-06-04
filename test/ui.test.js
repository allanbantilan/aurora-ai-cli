import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import readlinePromises from 'node:readline/promises';
import { promptLabel, createSpinner } from '../src/ui.js';
import { CodeHighlighter } from '../src/ui.js';
import { menuReduce, selectMenu, multiMenuReduce, formatModelStatus, statusLine, modelCategory } from '../src/ui.js';

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

test('spinner update accepts a text function and renders its value', () => {
  // a function text provider lets the spinner re-render time-driven content
  // (e.g. a reasoning elapsed counter) on every frame, not just on events
  const logs = [];
  const orig = console.log;
  console.log = (s) => logs.push(s);
  try {
    const s = createSpinner(); // tests run non-TTY → static line variant
    s.start('thinking...');
    s.update(() => 'reasoning... (3s)');
    s.stop();
  } finally {
    console.log = orig;
  }
  assert.deepEqual(logs, ['thinking...', 'reasoning... (3s)']);
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

test('menus restore the previous raw-mode state on close', async () => {
  // terminal-mode readline keeps the tty raw for its whole lifetime; if the
  // menu drops it to cooked on release, the console re-echoes every later
  // input line (seen as doubled input on Windows)
  const input = new PassThrough();
  input.isTTY = true;
  input.isRaw = true; // as readline left it
  input.setRawMode = function (v) {
    this.isRaw = v;
    return this;
  };
  const fakeRl = { input, pause() {}, resume() {} };

  const menuPromise = selectMenu(fakeRl, 'Pick:', [{ label: 'A', value: 'a' }]);
  input.write('\r');
  assert.equal(await menuPromise, 'a');
  assert.equal(input.isRaw, true, 'raw mode must be restored, not unconditionally disabled');
});

const mm = (over = {}) => ({ index: 0, count: 4, checked: [], done: false, cancelled: false, ...over });

test('multiMenuReduce toggles with space preserving check order', () => {
  let s = mm();
  s = multiMenuReduce(s, { name: 'down' });
  s = multiMenuReduce(s, { name: 'space' }); // check row 1
  s = multiMenuReduce(s, { name: 'down' });
  s = multiMenuReduce(s, { name: 'down' });
  s = multiMenuReduce(s, { name: 'space' }); // check row 3
  assert.deepEqual(s.checked, [1, 3]);
  s = multiMenuReduce(s, { name: 'space' }); // uncheck row 3
  assert.deepEqual(s.checked, [1]);
});

test('multiMenuReduce toggles via digits', () => {
  let s = mm();
  s = multiMenuReduce(s, { name: '2', sequence: '2' });
  s = multiMenuReduce(s, { name: '4', sequence: '4' });
  assert.deepEqual(s.checked, [1, 3]);
  s = multiMenuReduce(s, { name: '9', sequence: '9' }); // out of range: identity
  assert.deepEqual(s.checked, [1, 3]);
});

test('multiMenuReduce blocks enter with zero selections', () => {
  const s = mm();
  assert.equal(multiMenuReduce(s, { name: 'return' }), s); // identity: not done
  const picked = multiMenuReduce(mm({ checked: [0] }), { name: 'return' });
  assert.equal(picked.done, true);
  assert.equal(picked.cancelled, false);
});

test('multiMenuReduce escape cancels', () => {
  const s = multiMenuReduce(mm({ checked: [2] }), { name: 'escape' });
  assert.deepEqual([s.done, s.cancelled], [true, true]);
});

test('formatModelStatus formats health buckets', () => {
  assert.match(formatModelStatus({ uptime: 99.1, ok: true }), /99% up/);
  assert.match(formatModelStatus({ uptime: 64, ok: true }), /64% up/);
  assert.match(formatModelStatus({ uptime: 12, ok: true }), /12% up/);
  assert.match(formatModelStatus({ uptime: null, ok: true }), /no data/);
  assert.match(formatModelStatus({ uptime: null, ok: false }), /down/);
  assert.match(formatModelStatus(null), /no data/);
});

test('statusLine shows full cwd, active model and fallback count', () => {
  const line = statusLine('C:\\projects\\demo', ['deepseek/deepseek-chat:free', 'qwen/qwen3-coder:free', 'z-ai/glm-4.5-air:free']);
  assert.match(line, /C:\\projects\\demo/);
  assert.match(line, /deepseek\/deepseek-chat:free/);
  assert.match(line, /\+2 fallbacks/);
});

test('statusLine with a single model has no fallback suffix', () => {
  const line = statusLine('/home/x', ['m/one']);
  assert.match(line, /m\/one/);
  assert.doesNotMatch(line, /fallback/);
});

test('statusLine with two models uses singular fallback', () => {
  assert.match(statusLine('/home/x', ['m/a', 'm/b']), /\+1 fallback(?!s)/);
});

test('statusLine with an empty chain says no model', () => {
  const line = statusLine('/home/x', []);
  assert.match(line, /no model/);
  assert.doesNotMatch(line, /fallback/);
});

test('modelCategory buckets coder-ish ids as Coding, rest as General', () => {
  const cases = [
    ['qwen/qwen3-coder:free', 'Coding'],
    ['deepseek/deepseek-chat-v3:free', 'Coding'],
    ['mistralai/devstral-small:free', 'Coding'],
    ['mistralai/codestral-2501', 'Coding'],
    ['meta-llama/llama-3.3-70b-instruct:free', 'General'],
    ['google/gemma-3-27b-it:free', 'General'],
    ['some/brand-new-model', 'General'], // unknown ids never vanish — default bucket
  ];
  for (const [id, want] of cases) assert.equal(modelCategory(id), want, id);
});
