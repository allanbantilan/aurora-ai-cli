import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { promptSecret } from '../src/secret.js';

test('promptSecret returns the entered secret', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let text = '';
  output.on('data', (chunk) => {
    text += chunk.toString();
  });

  const answer = promptSecret('Secret: ', { input, output });
  input.write('sk-secret-value\r');

  assert.equal(await answer, 'sk-secret-value');
  assert.equal(text.includes('Secret: '), true);
});

test('promptSecret does not echo the entered secret', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  let text = '';
  output.on('data', (chunk) => {
    text += chunk.toString();
  });

  const answer = promptSecret('Secret: ', { input, output });
  input.write('sk-hidden-value\r');

  assert.equal(await answer, 'sk-hidden-value');
  assert.equal(text.includes('sk-hidden-value'), false);
});
