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
  slashMenuReduce,
  slashMatches,
  multiMenuReduce,
  formatModelStatus,
  statusLine,
  modelCategory,
  formatToolPreview,
  formatCtx,
  renderPlan,
  renderDoneSummary,
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

const CMDS = [['/model', 'select models'], ['/clear', 'reset conversation'], ['/help', 'show help'], ['/exit', 'quit']];
const sm = (over = {}) => ({ all: CMDS, filter: '/', index: 0, done: false, cancelled: false, picked: null, ...over });

test('slashMenuReduce filters live as the user types', () => {
  let s = sm();
  s = slashMenuReduce(s, { name: 'm' }, 'm');
  assert.equal(s.filter, '/m');
  assert.deepEqual(slashMatches(s.all, s.filter).map(([c]) => c), ['/model']);
  s = slashMenuReduce(s, { name: 'return' });
  assert.deepEqual([s.done, s.picked], [true, '/model']);
});

test('slashMenuReduce enter picks the highlighted command', () => {
  let s = sm();
  s = slashMenuReduce(s, { name: 'down' });
  s = slashMenuReduce(s, { name: 'return' });
  assert.equal(s.picked, '/clear');
});

test('slashMenuReduce tab cycles within the filtered set', () => {
  let s = sm();
  s = slashMenuReduce(s, { name: 'tab' });
  assert.equal(s.index, 1);
  s = slashMenuReduce(s, { name: 'tab', shift: true });
  assert.equal(s.index, 0);
});

test('slashMenuReduce backspace past "/" cancels', () => {
  const s = slashMenuReduce(sm(), { name: 'backspace' });
  assert.deepEqual([s.done, s.cancelled], [true, true]);
});

test('slashMenuReduce backspace shrinks the filter and resets selection', () => {
  let s = sm({ filter: '/mo', index: 0 });
  s = slashMenuReduce(s, { name: 'backspace' });
  assert.equal(s.filter, '/m');
  assert.equal(s.done, false);
});

test('slashMenuReduce enter with no matches cancels', () => {
  const s = slashMenuReduce(sm({ filter: '/zzz' }), { name: 'return' });
  assert.deepEqual([s.done, s.cancelled], [true, true]);
});

test('searchable command menu supports @ agent filters', () => {
  const agents = [['@simplify', 'simplify code'], ['@review', 'audit code']];
  let s = { all: agents, filter: '@', index: 0, done: false, cancelled: false, picked: null };
  s = slashMenuReduce(s, { name: 'r' }, 'r');
  assert.deepEqual(slashMatches(s.all, s.filter).map(([c]) => c), ['@review']);
  s = slashMenuReduce(s, { name: 'return' });
  assert.equal(s.picked, '@review');
});

test('menuReduce cycles with tab and back with shift-tab', () => {
  let s = { index: 0, count: 3, done: false, escaped: false };
  s = menuReduce(s, { name: 'tab' });
  assert.equal(s.index, 1);
  s = menuReduce(s, { name: 'tab' });
  s = menuReduce(s, { name: 'tab' });
  assert.equal(s.index, 0); // wrapped around
  s = menuReduce(s, { name: 'tab', shift: true });
  assert.equal(s.index, 2); // shift-tab moves backward
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

test('formatToolPreview renders write_file content as a diff', () => {
  const p = formatToolPreview('write_file', { path: 'a.html', content: '<p>x</p>\n<i>y</i>' }, { colors: true });
  assert.match(p, /\[write_file\][^\n]*a\.html/);
  assert.match(p, /Created .*a\.html/); // new file → Created diff
  assert.match(p, /\+.* <p>x<\/p>/); // fg reset sits between marker and text in tinted rows
  assert.match(p, /\+.* <i>y<\/i>/);
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

test('edit_file preview shows diff when old_string is unique and file is readable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-ui-'));
  const f = path.join(dir, 'x.js');
  fs.writeFileSync(f, 'a\nb\nc\nTARGET\nd\n');
  const p = formatToolPreview('edit_file', { path: f, old_string: 'TARGET', new_string: 'X' }, { colors: true });
  assert.match(p, /Edited .*x\.js/); // shows diff for successful replacement
  assert.match(p, /-.* TARGET/); // fg reset sits between marker and text in tinted rows
  assert.match(p, /\+.* X/);
  fs.rmSync(dir, { recursive: true, force: true });
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

const PLAN_FIXTURE = {
  status: 'complete',
  title: 'make landing page modern',
  context: ['index.html  (main landing page)', 'about.html  (secondary page)'],
  questions: [],
  plan: ['Set up Tailwind CDN in index.html', 'Redesign hero section'],
  files: [
    { path: 'index.html', change: '~', note: 'major redesign' },
    { path: 'styles.css', change: '+', note: 'custom overrides' },
  ],
  risks: ['No backend — cart is placeholder only'],
};

test('renderPlan shows boxed title and all populated sections', () => {
  const out = renderPlan(PLAN_FIXTURE, { colors: false, ascii: false, columns: 80 });
  assert.match(out, /AURORA PLAN/);
  assert.match(out, /make landing page modern/);
  assert.match(out, /📁 Context/);
  assert.match(out, /📋 Plan/);
  assert.match(out, /📄 Files/);
  assert.match(out, /⚠ {2}Risks/);
  assert.doesNotMatch(out, /❓/); // no questions in fixture
});

test('renderPlan uses tree characters for context and numbers plan steps', () => {
  const out = renderPlan(PLAN_FIXTURE, { colors: false, ascii: false, columns: 80 });
  assert.match(out, /├─ index\.html/);
  assert.match(out, /└─ about\.html/);
  assert.match(out, /1\. Set up Tailwind CDN/);
  assert.match(out, /2\. Redesign hero/);
});

test('renderPlan labels files with their change marker and note', () => {
  const out = renderPlan(PLAN_FIXTURE, { colors: false, ascii: false, columns: 80 });
  assert.match(out, /~ {2}index\.html\s+major redesign/);
  assert.match(out, /\+ {2}styles\.css\s+custom overrides/);
});

test('renderPlan never renders questions — the REPL asks them interactively', () => {
  const plan = {
    ...PLAN_FIXTURE,
    status: 'needs_input',
    questions: [{ prompt: 'Tech stack?', choices: ['plain HTML/CSS', 'React'] }],
  };
  const out = renderPlan(plan, { colors: false, ascii: false, columns: 80 });
  assert.doesNotMatch(out, /❓|Questions|Tech stack/);
});

test('renderPlan update mode shows refresh line with Plan and Files only', () => {
  const out = renderPlan(PLAN_FIXTURE, { colors: false, ascii: false, columns: 80, update: true });
  assert.match(out, /^↻ Plan updated ─ 2 steps/);
  assert.match(out, /📋 Plan/);
  assert.match(out, /📄 Files/);
  assert.doesNotMatch(out, /AURORA PLAN|Context|Risks|❓/);
});

test('renderPlan skips empty sections entirely', () => {
  const out = renderPlan(
    { status: 'complete', title: 't', context: [], questions: [], plan: ['x'], files: [], risks: [] },
    { colors: false, ascii: false, columns: 80 }
  );
  assert.doesNotMatch(out, /Context|Files|Risks|Questions/);
  assert.match(out, /📋 Plan/);
});

test('renderPlan falls back to ASCII icons and box chars under legacy conhost', () => {
  const out = renderPlan(PLAN_FIXTURE, { colors: false, ascii: true, columns: 80 });
  assert.doesNotMatch(out, /[📁📋📄╭─├└❓]|⚠/u);
  assert.match(out, /\[ctx\] Context/);
  assert.match(out, /\[plan\] Plan/);
  assert.match(out, /\[files\] Files/);
  assert.match(out, /\[!\] {2}Risks/);
});

test('renderPlan emits no ANSI codes when colors are off', () => {
  const out = renderPlan(PLAN_FIXTURE, { colors: false, ascii: false, columns: 80 });
  assert.equal(out.includes(String.fromCharCode(27)), false);
});

test('renderPlan truncates overlong lines to the terminal width', () => {
  const plan = { ...PLAN_FIXTURE, plan: ['x'.repeat(300)] };
  const out = renderPlan(plan, { colors: false, ascii: false, columns: 40 });
  for (const line of out.split('\n')) assert.equal(line.length <= 40, true);
});

test('renderPlan clips styled lines without leaving ANSI codes open', () => {
  const plan = { ...PLAN_FIXTURE, files: [{ path: 'p/'.repeat(40) + 'x.js', change: '~', note: 'long path' }] };
  const out = renderPlan(plan, { colors: true, ascii: false, columns: 60 });
  const esc = String.fromCharCode(27);
  for (const line of out.split('\n')) {
    const opens = (line.match(/\x1b\[(36|33|32|31|2)m/g) ?? []).length;
    const closes = (line.match(/\x1b\[(39|22)m/g) ?? []).length;
    assert.equal(opens, closes, `unbalanced ANSI in: ${JSON.stringify(line)}`);
  }
});

test('renderPlan tolerates unknown change markers and missing notes', () => {
  const plan = {
    ...PLAN_FIXTURE,
    files: [{ path: 'a.js', change: 'X' }, { path: 'b.js', change: '+', note: 'ok' }],
  };
  const out = renderPlan(plan, { colors: false, ascii: false, columns: 80 });
  assert.match(out, /X {2}a\.js/);
  assert.doesNotMatch(out, /undefined/);
});

test('formatToolPreview write_file over an existing file shows an Edited diff', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-prev-'));
  const file = path.join(dir, 'a.txt');
  fs.writeFileSync(file, 'one\ntwo\n');
  const out = formatToolPreview('write_file', { path: file, content: 'one\nTWO\n' }, { colors: true });
  assert.match(out, /\[write_file\]/);
  assert.match(out, /Edited .*a\.txt.*\(.*\+1.* .*-1.*\)/); // header counts are individually colored
  fs.rmSync(dir, { recursive: true, force: true });
});

test('formatToolPreview write_file for a new path shows a Created diff', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-prev-'));
  const file = path.join(dir, 'new.txt');
  const out = formatToolPreview('write_file', { path: file, content: 'hello\n' }, { colors: true });
  assert.match(out, /Created .*new\.txt.*\(.*\+1.* .*-0.*\)/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('formatToolPreview edit_file shows a diff of the applied replacement', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-prev-'));
  const file = path.join(dir, 'b.txt');
  fs.writeFileSync(file, 'alpha\nbeta\ngamma\n');
  const out = formatToolPreview(
    'edit_file',
    { path: file, old_string: 'beta', new_string: 'BETA' },
    { colors: true }
  );
  assert.match(out, /\[edit_file\]/);
  assert.match(out, /Edited .*b\.txt.*\(.*\+1.* .*-1.*\)/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('formatToolPreview edit_file falls back to remove/insert blocks when old_string is absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-prev-'));
  const file = path.join(dir, 'c.txt');
  fs.writeFileSync(file, 'alpha\n');
  const out = formatToolPreview(
    'edit_file',
    { path: file, old_string: 'missing', new_string: 'x' },
    { colors: true }
  );
  assert.match(out, /remove/);
  assert.match(out, /insert/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('renderPlan never throws on absurdly small column widths', () => {
  for (const columns of [0, 1, 2, 5]) {
    assert.doesNotThrow(() => renderPlan(PLAN_FIXTURE, { colors: false, ascii: false, columns }));
  }
});

test('renderDoneSummary shows counts box, file list and next-step prompt', () => {
  const out = renderDoneSummary(
    [
      { path: 'products.json', change: '+' },
      { path: 'style.css', change: '+' },
      { path: 'index.html', change: '~' },
    ],
    { errors: 0, colors: false, ascii: false, columns: 80 }
  );
  assert.match(out, /AURORA DONE/);
  assert.match(out, /2 files created · 1 file edited · 0 errors/);
  assert.match(out, /\+ {2}products\.json/);
  assert.match(out, /~ {2}index\.html/);
  assert.match(out, /❯ What should Aurora do next\?/);
});

test('renderDoneSummary dedupes paths and keeps created over edited', () => {
  const out = renderDoneSummary(
    [
      { path: 'a.js', change: '+' },
      { path: 'a.js', change: '~' },
    ],
    { colors: false, ascii: false, columns: 80 }
  );
  assert.match(out, /1 file created · 0 errors/);
  assert.equal((out.match(/a\.js/g) ?? []).length, 1);
});

test('renderDoneSummary reports errors and never throws on empty input', () => {
  const out = renderDoneSummary([], { errors: 2, colors: false, ascii: false, columns: 80 });
  assert.match(out, /2 errors/);
  assert.doesNotMatch(out, /files created/);
});

test('renderDoneSummary replaces the generic prompt with actionable recovery steps', () => {
  const out = renderDoneSummary([], {
    errors: 1,
    nextSteps: ['Install PHP 8.3+.', 'Verify with: php -v', 'Retry: php artisan inertia:install vue'],
    colors: false,
    ascii: false,
    columns: 80,
  });

  assert.match(out, /Fix required:/);
  assert.match(out, /1\. Install PHP 8\.3\+\./);
  assert.match(out, /3\. Retry: php artisan inertia:install vue/);
  assert.doesNotMatch(out, /What should Aurora do next/);
});

test('renderDoneSummary shows aligned one-line notes for each file', () => {
  const out = renderDoneSummary(
    [
      { path: 'index.html', change: '~', note: 'product links, cart link fixed' },
      { path: 'product.html', change: '~', note: 'Tailwind design, styled detail layout' },
    ],
    { colors: false, ascii: false, columns: 100 }
  );
  assert.match(out, /~ {2}index\.html {3}.*product links, cart link fixed/);
  assert.match(out, /~ {2}product\.html {1}.*Tailwind design/);
});
