import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffLines, formatDiff } from '../src/diff.js';

test('diffLines: identical texts produce no hunks and zero counts', () => {
  const d = diffLines('a\nb\nc\n', 'a\nb\nc\n');
  assert.equal(d.added, 0);
  assert.equal(d.removed, 0);
  assert.deepEqual(d.hunks, []);
});

test('diffLines: single replaced line yields one hunk with del then add', () => {
  const d = diffLines('one\ntwo\nthree\n', 'one\nTWO\nthree\n');
  assert.equal(d.added, 1);
  assert.equal(d.removed, 1);
  assert.equal(d.hunks.length, 1);
  const types = d.hunks[0].map((op) => op.type);
  assert.deepEqual(types, ['ctx', 'del', 'add', 'ctx']);
});

test('diffLines: ops carry correct old/new line numbers', () => {
  const d = diffLines('one\ntwo\nthree\n', 'one\nTWO\nthree\n');
  const [ctx1, del, add, ctx2] = d.hunks[0];
  assert.equal(ctx1.oldNum, 1);
  assert.equal(ctx1.newNum, 1);
  assert.equal(del.oldNum, 2);
  assert.equal(add.newNum, 2);
  assert.equal(ctx2.oldNum, 3);
  assert.equal(ctx2.newNum, 3);
});

test('diffLines: pure insert into empty text', () => {
  const d = diffLines('', 'a\nb\n');
  assert.equal(d.added, 2);
  assert.equal(d.removed, 0);
  assert.deepEqual(d.hunks[0].map((op) => op.type), ['add', 'add']);
});

test('diffLines: pure delete to empty text', () => {
  const d = diffLines('a\nb\n', '');
  assert.equal(d.added, 0);
  assert.equal(d.removed, 2);
  assert.deepEqual(d.hunks[0].map((op) => op.type), ['del', 'del']);
});

test('diffLines: distant changes split into separate hunks with 2 context lines', () => {
  const oldText = ['x0', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'x1'].join('\n');
  const newText = ['X0', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'X1'].join('\n');
  const d = diffLines(oldText, newText);
  assert.equal(d.hunks.length, 2);
  // first hunk: change at line 1 + 2 lines of trailing context
  assert.deepEqual(d.hunks[0].map((op) => op.type), ['del', 'add', 'ctx', 'ctx']);
  // second hunk: 2 leading context lines + change at the last line
  assert.deepEqual(d.hunks[1].map((op) => op.type), ['ctx', 'ctx', 'del', 'add']);
});

test('diffLines: nearby changes merge into one hunk', () => {
  const oldText = ['a', 'b', 'c', 'd', 'e'].join('\n');
  const newText = ['A', 'b', 'c', 'd', 'E'].join('\n');
  const d = diffLines(oldText, newText);
  assert.equal(d.hunks.length, 1);
});

test('diffLines: CRLF input is normalized for comparison', () => {
  const d = diffLines('a\r\nb\r\n', 'a\nb\n');
  assert.equal(d.added, 0);
  assert.equal(d.removed, 0);
});

test('diffLines: counts are accurate for mixed change', () => {
  const d = diffLines('keep\nold1\nold2\nkeep2\n', 'keep\nnew1\nkeep2\nadded\n');
  assert.equal(d.removed, 2);
  assert.equal(d.added, 2);
});

const ESC = String.fromCharCode(27);

test('formatDiff: header is a single line with counts, followed by a blank line', () => {
  const out = formatDiff('src/a.js', 'one\ntwo\nthree\n', 'one\nTWO\nthree\n', { colors: false });
  const lines = out.split('\n');
  assert.equal(lines[0], 'Edited src/a.js (+1 -1)');
  assert.equal(lines[1], '');
  assert.doesNotMatch(lines.at(-1), /\(\+1 -1\)/); // no trailing counts line
});

test('formatDiff: colored header paints filename white, +N green and -N red', () => {
  const out = formatDiff('src/a.js', 'one\ntwo\n', 'one\nTWO\n', { colors: true });
  const header = out.split('\n')[0];
  assert.match(header, new RegExp(`^Edited ${ESC}\\[37msrc/a\\.js${ESC}\\[39m`));
  assert.match(header, new RegExp(`\\(${ESC}\\[38;2;86;211;100m\\+1${ESC}\\[39m ${ESC}\\[38;2;248;81;73m-1${ESC}\\[39m\\)$`));
});

test('formatDiff: rows use a fixed 4-char gutter with - and + markers', () => {
  const out = formatDiff('a.js', 'one\ntwo\nthree\n', 'one\nTWO\nthree\n', { colors: false });
  assert.match(out, /^ {3}2 - two$/m);
  assert.match(out, /^ {3}2 \+ TWO$/m);
  assert.match(out, /^ {3}1 {3}one$/m); // context line: number, no marker, no styling
});

test('formatDiff: multiple hunks are separated by a spaced ellipsis with blank lines around it', () => {
  const oldText = ['x0', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'x1'].join('\n');
  const newText = ['X0', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'X1'].join('\n');
  const out = formatDiff('a.js', oldText, newText, { colors: false });
  assert.match(out, /\n\n· · · · · {2}\(\+6 lines\)\n\n/); // 6 unchanged lines skipped between chunks
});

test('formatDiff: created file is all adds, truncated at 15 lines', () => {
  const content = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join('\n');
  const out = formatDiff('new.js', '', content, { colors: false });
  assert.match(out, /^Created new\.js \(\+20 -0\)/);
  assert.match(out, /15 \+ line15/);
  assert.doesNotMatch(out, /line16/);
  assert.match(out, /· · · · · {2}\(\+5 lines\)/);
});

test('formatDiff: short created file has no ellipsis', () => {
  const out = formatDiff('new.js', '', 'a\nb\n', { colors: false });
  assert.doesNotMatch(out, /· · · · ·/);
});

test('formatDiff: emptied file renders as deleted, all removes', () => {
  const out = formatDiff('old.js', 'a\nb\n', '', { colors: false });
  assert.match(out, /^Deleted old\.js \(\+0 -2\)/);
  assert.match(out, /1 - a/);
  assert.match(out, /2 - b/);
});

test('formatDiff: identical content prints header only', () => {
  const out = formatDiff('same.js', 'a\n', 'a\n', { colors: false });
  assert.equal(out, 'Edited same.js (+0 -0)');
});

test('formatDiff: colors=false output contains no ANSI escapes', () => {
  const out = formatDiff('a.js', 'one\ntwo\n', 'one\nTWO\n', { colors: false });
  assert.equal(out.includes(ESC), false);
});

test('formatDiff: colors=true tints whole removed rows dark red and added rows dark green', () => {
  const out = formatDiff('a.js', 'one\ntwo\n', 'one\nTWO\n', { colors: true });
  // Codex-style muted truecolor row backgrounds, closed with 49 on the same line
  assert.match(out, new RegExp(`${ESC}\\[48;2;63;29;29m.*2 -.* two${ESC}\\[49m`));
  assert.match(out, new RegExp(`${ESC}\\[48;2;27;58;36m.*2 \\+.* TWO${ESC}\\[49m`));
  assert.doesNotMatch(out, new RegExp(`${ESC}\\[4[12]m`)); // bright legacy palette is gone
});

test('formatDiff: huge edited diff is capped with a more-lines tail', () => {
  const oldText = Array.from({ length: 300 }, (_, i) => `old${i}`).join('\n');
  const newText = Array.from({ length: 300 }, (_, i) => `new${i}`).join('\n');
  const out = formatDiff('big.js', oldText, newText, { colors: false });
  const bodyLines = out.split('\n').length;
  assert.equal(bodyLines <= 205, true);
  assert.match(out, /· · · · · {2}\(\+\d+ lines\)/);
});

test('formatDiff: ANSI escapes embedded in file content are stripped from output', () => {
  const esc = String.fromCharCode(27);
  const out = formatDiff('log.txt', `plain\n`, `plain\n${esc}[0mcolored${esc}[31m\n`, { colors: false });
  assert.equal(out.includes(esc), false);
  assert.match(out, /\+ colored/);
});
