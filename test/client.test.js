import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterFreeToolModels, withRetry } from '../src/client.js';

const fixture = [
  {
    id: 'free/tools-model',
    name: 'Free Tools',
    context_length: 32000,
    pricing: { prompt: '0', completion: '0' },
    supported_parameters: ['tools', 'temperature'],
  },
  {
    id: 'free/no-tools-model',
    name: 'Free No Tools',
    context_length: 8000,
    pricing: { prompt: '0', completion: '0' },
    supported_parameters: ['temperature'],
  },
  {
    id: 'paid/tools-model',
    name: 'Paid Tools',
    context_length: 200000,
    pricing: { prompt: '0.000003', completion: '0.000015' },
    supported_parameters: ['tools'],
  },
  {
    id: 'weird/missing-fields',
    name: 'Weird',
  },
];

test('keeps only free models with tool support', () => {
  const out = filterFreeToolModels(fixture);
  assert.deepEqual(out, [{ id: 'free/tools-model', name: 'Free Tools', context: 32000 }]);
});

test('withRetry retries 429 then succeeds', async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    if (calls < 2) throw Object.assign(new Error('rate limited'), { status: 429 });
    return 'ok';
  }, 2, 0);
  assert.equal(result, 'ok');
  assert.equal(calls, 2);
});

test('withRetry gives up after max retries', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => {
      calls++;
      throw Object.assign(new Error('rate limited'), { status: 429 });
    }, 2, 0),
    /rate limited/
  );
  assert.equal(calls, 3);
});

test('withRetry does not retry non-429 errors', async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => {
      calls++;
      throw Object.assign(new Error('server error'), { status: 500 });
    }, 2, 0),
    /server error/
  );
  assert.equal(calls, 1);
});
