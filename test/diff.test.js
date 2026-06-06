import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffLines } from '../src/diff.js';

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

test('diffLines: distant changes split into separate hunks with 3 context lines', () => {
  const oldText = ['x0', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'x1'].join('\n');
  const newText = ['X0', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'X1'].join('\n');
  const d = diffLines(oldText, newText);
  assert.equal(d.hunks.length, 2);
  // first hunk: change at line 1 + 3 lines of trailing context
  assert.deepEqual(d.hunks[0].map((op) => op.type), ['del', 'add', 'ctx', 'ctx', 'ctx']);
  // second hunk: 3 leading context lines + change at the last line
  assert.deepEqual(d.hunks[1].map((op) => op.type), ['ctx', 'ctx', 'ctx', 'del', 'add']);
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
