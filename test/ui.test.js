import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { PassThrough } from 'node:stream';
import readlinePromises from 'node:readline/promises';
import { promptLabel, createSpinner } from '../src/ui.js';
import { CodeHighlighter } from '../src/ui.js';
import {
  menuReduce,
  selectMenu,
  multiMenuReduce,
  formatModelStatus,
  statusLine,
  modelCategory,
  formatToolPreview,
  formatCtx,
} from '../src/ui.js';

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

test('menus hide the terminal cursor while open and restore it on close', async () => {
  const input = new PassThrough();
  input.isTTY = true;
  input.isRaw = true;
  input.setRawMode = function (v) {
    this.isRaw = v;
    return this;
  };
  const fakeRl = { input, pause() {}, resume() {} };

  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => {
    out += s;
    return true;
  };
  try {
    const menuPromise = selectMenu(fakeRl, 'Pick:', [{ label: 'A', value: 'a' }]);
    input.write('\r');
    await menuPromise;
  } finally {
    process.stdout.write = orig;
  }
  const esc = String.fromCharCode(27);
  assert.ok(out.includes(`${esc}[?25l`), 'cursor hidden while the menu is open');
  assert.ok(out.includes(`${esc}[?25h`), 'cursor restored on close');
  assert.ok(out.lastIndexOf(`${esc}[?25h`) > out.lastIndexOf(`${esc}[?25l`), 'restore comes last');
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

test('selectMenu erases its block from the screen on close', async () => {
  const input = new PassThrough();
  input.isTTY = true;
  input.isRaw = true;
  input.setRawMode = function (v) {
    this.isRaw = v;
    return this;
  };
  const fakeRl = { input, pause() {}, resume() {} };

  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => {
    out += s;
    return true;
  };
  try {
    const menuPromise = selectMenu(fakeRl, 'Allow?', [{ label: 'A', value: 'a' }]);
    input.write('\r');
    await menuPromise;
  } finally {
    process.stdout.write = orig;
  }
  const esc = String.fromCharCode(27);
  // title + 1 option = 2 lines erased (cursor up 2, clear to end of screen)
  assert.ok(out.includes(`${esc}[2A${esc}[0J`), 'menu block erased on close');
});

test('formatToolPreview renders write_file content as a numbered code block', () => {
  const p = formatToolPreview('write_file', { path: 'a.html', content: '<p>x</p>\n<i>y</i>' }, { colors: true });
  assert.match(p, /\[write_file\][^\n]*a\.html/);
  assert.match(p, /╭── a\.html/);
  assert.match(p, /│ 1 /); // line numbers in the gutter
  assert.match(p, /│ 2 /);
  assert.match(p, /<p>x<\/p>/);
  assert.match(p, /╰/);
});

test('formatToolPreview renders edit_file as remove/insert blocks', () => {
  const p = formatToolPreview('edit_file', { path: 'no-such-file.js', old_string: 'old()', new_string: 'new()' }, { colors: true });
  assert.match(p, /\[edit_file\][^\n]*no-such-file\.js/);
  assert.match(p, /╭── remove/);
  assert.match(p, /old\(\)/);
  assert.match(p, /╭── insert/);
  assert.match(p, /new\(\)/);
  assert.match(p, /│ 1 /); // unknown file → numbering falls back to 1
});

test('edit_file preview numbers lines from the match position in the file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-ui-'));
  const f = path.join(dir, 'x.js');
  fs.writeFileSync(f, 'a\nb\nc\nTARGET\nd\n');
  const p = formatToolPreview('edit_file', { path: f, old_string: 'TARGET', new_string: 'X' }, { colors: true });
  assert.match(p, /│ 4 /); // TARGET sits on line 4
});

test('formatToolPreview falls back to the plain preview without colors', () => {
  const p = formatToolPreview('write_file', { path: 'a', content: 'b' }, { colors: false });
  assert.match(p, /write_file → a/);
  assert.doesNotMatch(p, /╭/);
});

test('highlighter pads fences with blank lines next to prose', () => {
  const h = new CodeHighlighter({ enabled: true });
  const out = h.highlight('Here is the code:\n```js\nx\n```\nDone.\n');
  assert.match(out, /Here is the code:\n\n/); // blank line before the opening rule
  assert.match(out, /╰─+[^\n]*\n\nDone\./); // blank line after the closing rule
});

test('highlighter adds no extra padding when blank lines already exist', () => {
  const h = new CodeHighlighter({ enabled: true });
  const out = h.highlight('Prose.\n\n```js\nx\n```\n');
  assert.doesNotMatch(out, /Prose\.\n\n\n/); // no doubled padding
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

test('statusLine shows user@host:cwd, short model name and fallback count', () => {
  const line = statusLine('C:\\projects\\demo', ['deepseek/deepseek-chat:free', 'qwen/qwen3-coder:free', 'z-ai/glm-4.5-air:free']);
  assert.ok(line.includes(`${os.userInfo().username}@${os.hostname()}:`), 'should contain user@host:');
  assert.match(line, /C:\\projects\\demo/);
  assert.match(line, /deepseek-chat/); // short name…
  assert.doesNotMatch(line, /deepseek\/deepseek-chat:free/); // …not the full id
  assert.match(line, /\+2 fallbacks/);
});

test('statusLine with a single model has no fallback suffix', () => {
  const line = statusLine('/home/x', ['m/one']);
  assert.match(line, /one/);
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

test('statusLine shows ctx: -- when no usage data is given', () => {
  assert.match(statusLine('/home/x', ['m/a']), /ctx: --/);
});

test('statusLine renders the ctx percentage when given', () => {
  assert.match(statusLine('/home/x', ['m/a'], { pct: 19 }), /ctx: 19% used/);
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

test('formatCtx renders -- for missing data', () => {
  assert.deepEqual(formatCtx(null), { text: 'ctx: --', level: 'dim' });
  assert.deepEqual(formatCtx(undefined), { text: 'ctx: --', level: 'dim' });
  assert.deepEqual(formatCtx(NaN), { text: 'ctx: --', level: 'dim' });
});

test('formatCtx buckets percentages into dim/yellow/red levels', () => {
  assert.deepEqual(formatCtx(19), { text: 'ctx: 19% used', level: 'dim' });
  assert.deepEqual(formatCtx(69.4), { text: 'ctx: 69% used', level: 'dim' });
  assert.deepEqual(formatCtx(70), { text: 'ctx: 70% used', level: 'yellow' });
  assert.deepEqual(formatCtx(89), { text: 'ctx: 89% used', level: 'yellow' });
  assert.deepEqual(formatCtx(90), { text: 'ctx: 90% used', level: 'red' });
  assert.deepEqual(formatCtx(91), { text: 'ctx: 91% used', level: 'red' });
});

test('formatCtx clamps out-of-range values', () => {
  assert.deepEqual(formatCtx(140), { text: 'ctx: 100% used', level: 'red' });
  assert.deepEqual(formatCtx(-5), { text: 'ctx: 0% used', level: 'dim' });
});
