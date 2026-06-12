import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterFreeToolModels, withRetry, fetchModelStatus } from '../src/client.js';

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
  assert.deepEqual(out, [{ id: 'free/tools-model', name: 'Free Tools', context: 32000, provider: 'openrouter' }]);
});

test('ranks preferred tool-trained coder models first and retains stable fallbacks', () => {
  const model = (id) => ({
    id,
    name: id,
    context_length: 32000,
    pricing: { prompt: '0', completion: '0' },
    supported_parameters: ['tools'],
  });
  const out = filterFreeToolModels([
    model('general/first'),
    model('coder/deepseek-coder-v2'),
    model('general/second'),
    model('coder/qwen3-coder'),
    model('coder/devstral-small'),
    model('coder/qwen2.5-coder'),
  ]);

  assert.deepEqual(out.map(({ id }) => id), [
    'coder/qwen3-coder',
    'coder/qwen2.5-coder',
    'coder/devstral-small',
    'coder/deepseek-coder-v2',
    'general/first',
    'general/second',
  ]);
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

test('createClient disables SDK-internal retries', async () => {
  const { createClient } = await import('../src/client.js');
  assert.equal(createClient('test-key').maxRetries, 0);
});

test('withRetry reports each retry via onRetry callback', async () => {
  const reported = [];
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    if (calls < 3) throw Object.assign(new Error('rate limited'), { status: 429 });
    return 'ok';
  }, 2, 0, (attempt, retries, delayMs) => reported.push([attempt, retries, delayMs]));
  assert.equal(result, 'ok');
  assert.deepEqual(reported, [[1, 2, 0], [2, 2, 0]]);
});

function stubFetch(routes) {
  // routes: url-substring -> () => Response-like | throws
  return async (url) => {
    for (const [needle, handler] of Object.entries(routes)) {
      if (url.includes(needle)) return handler();
    }
    throw new Error(`no route for ${url}`);
  };
}

const ok = (endpoints) => ({ ok: true, json: async () => ({ data: { endpoints } }) });

test('fetchModelStatus picks max uptime among live endpoints', async () => {
  const fetchFn = stubFetch({
    'a/model-a': () => ok([
      { status: 0, uptime_last_30m: 91.2 },
      { status: -1, uptime_last_30m: 99.9 }, // not live: ignored
      { status: 0, uptime_last_30m: 75.0 },
    ]),
  });
  const map = await fetchModelStatus(['a/model-a'], fetchFn);
  assert.deepEqual(map.get('a/model-a'), { uptime: 91.2, ok: true });
});

test('fetchModelStatus reports ok=false when no live endpoints', async () => {
  const fetchFn = stubFetch({
    'b/model-b': () => ok([{ status: -3, uptime_last_30m: 50 }]),
    'c/model-c': () => ok([]),
  });
  const map = await fetchModelStatus(['b/model-b', 'c/model-c'], fetchFn);
  assert.deepEqual(map.get('b/model-b'), { uptime: null, ok: false });
  assert.deepEqual(map.get('c/model-c'), { uptime: null, ok: false });
});

test('fetchModelStatus maps failures to null without rejecting', async () => {
  const fetchFn = stubFetch({
    'd/model-d': () => { throw new Error('boom'); },
    'e/model-e': () => ({ ok: false, status: 500 }),
    'f/model-f': () => ok([{ status: 0, uptime_last_30m: null }]),
  });
  const map = await fetchModelStatus(['d/model-d', 'e/model-e', 'f/model-f'], fetchFn);
  assert.equal(map.get('d/model-d'), null);
  assert.equal(map.get('e/model-e'), null);
  assert.deepEqual(map.get('f/model-f'), { uptime: null, ok: true }); // live but no uptime data
});
