import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEchoSuppressor, claimsUnappliedChanges } from '../src/repl.js';

test('createEchoSuppressor drops an exact first-line echo of the user input', () => {
  let out = '';
  const write = createEchoSuppressor('hello', (chunk) => {
    out += chunk;
  });

  write('hello\nHello! ');
  write('How can I help?');
  write.flush();

  assert.equal(out, 'Hello! How can I help?');
});

test('createEchoSuppressor preserves normal streamed output', () => {
  let out = '';
  const write = createEchoSuppressor('hello', (chunk) => {
    out += chunk;
  });

  write('Hello! ');
  write('How can I help?');
  write.flush();

  assert.equal(out, 'Hello! How can I help?');
});

test('claimsUnappliedChanges fires on claim language + code block + no write tools', () => {
  const text = "I've added the navbar:\n```html\n<nav>...</nav>\n```\nDone!";
  assert.equal(claimsUnappliedChanges(text, ['read_file']), true);
});

test('claimsUnappliedChanges stays quiet when a write tool ran', () => {
  const text = "I've added the navbar:\n```html\n<nav>...</nav>\n```";
  assert.equal(claimsUnappliedChanges(text, ['read_file', 'edit_file']), false);
  assert.equal(claimsUnappliedChanges(text, ['write_file']), false);
});

test('claimsUnappliedChanges ignores explanations without claim language', () => {
  const text = 'Here is how the function works:\n```js\nfn();\n```';
  assert.equal(claimsUnappliedChanges(text, []), false);
});

test('claimsUnappliedChanges ignores claims without a code block', () => {
  assert.equal(claimsUnappliedChanges('I fixed the typo in the README.', []), false);
});

test('claimsUnappliedChanges matches "I have updated" and "I updated" variants', () => {
  const code = '\n```css\n.a{}\n```';
  assert.equal(claimsUnappliedChanges(`I have updated the styles.${code}`, []), true);
  assert.equal(claimsUnappliedChanges(`I updated the styles.${code}`, []), true);
});
