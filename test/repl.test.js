import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEchoSuppressor, claimsUnappliedChanges, completeCommand, commandList, promoteModel } from '../src/repl.js';

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

test('claimsUnappliedChanges fires on claims even without a code block', () => {
  // real phantom-edit summaries usually have no code fence at all
  assert.equal(claimsUnappliedChanges('I fixed the typo in the README.', []), true);
});

test('claimsUnappliedChanges catches subject-less summary claims (real transcript)', () => {
  for (const text of [
    'Replaced the original page with a modern, Tailwind‑CSS based landing page.',
    'Added a responsive navigation bar with a brand name and placeholder links, plus a simple footer.',
    'Created a new file **about.html** with a matching modern Tailwind layout.',
  ]) {
    assert.equal(claimsUnappliedChanges(text, ['read_file']), true, text);
  }
});

test('claimsUnappliedChanges ignores mid-sentence past-tense verbs', () => {
  assert.equal(claimsUnappliedChanges('The navbar added in v2 uses flexbox.', []), false);
  assert.equal(claimsUnappliedChanges('You should keep the code added by the plugin.', []), false);
});

test('claimsUnappliedChanges matches "I have updated" and "I updated" variants', () => {
  const code = '\n```css\n.a{}\n```';
  assert.equal(claimsUnappliedChanges(`I have updated the styles.${code}`, []), true);
  assert.equal(claimsUnappliedChanges(`I updated the styles.${code}`, []), true);
});

test('claimsUnappliedChanges treats run_command as write-capable', () => {
  const text = "I've added the file:\n```js\nx\n```";
  assert.equal(claimsUnappliedChanges(text, ['run_command']), false);
});

test('claimsUnappliedChanges matches extended claim verbs', () => {
  const code = '\n```js\nx\n```';
  for (const v of ['modified', 'removed', 'implemented', 'replaced']) {
    assert.equal(claimsUnappliedChanges(`I ${v} the helper.${code}`, []), true, v);
  }
});

test('completeCommand completes a unique prefix', () => {
  assert.deepEqual(completeCommand('/mo'), [['/model'], '/mo']);
});

test('completeCommand lists all commands for bare slash', () => {
  const [hits] = completeCommand('/');
  assert.deepEqual(hits, ['/model', '/clear', '/help', '/exit']);
});

test('completeCommand returns no hits for non-command input', () => {
  assert.deepEqual(completeCommand('hello'), [[], 'hello']);
  assert.deepEqual(completeCommand('/nope'), [[], '/nope']);
});

test('commandList includes every command with a description', () => {
  const text = commandList();
  for (const c of ['/model', '/clear', '/help', '/exit']) assert.match(text, new RegExp(c.replace('/', '\\/')));
});

test('promoteModel puts the fallback first and drops the failed model', () => {
  assert.deepEqual(promoteModel(['a', 'b', 'c'], 'a', 'b'), ['b', 'c']);
});

test('promoteModel keeps unrelated models in order', () => {
  assert.deepEqual(promoteModel(['a', 'b', 'c', 'd'], 'b', 'c'), ['c', 'a', 'd']);
});

