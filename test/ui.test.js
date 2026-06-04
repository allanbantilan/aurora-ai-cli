import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { promptLabel, createSpinner } from '../src/ui.js';
import { CodeHighlighter } from '../src/ui.js';

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
