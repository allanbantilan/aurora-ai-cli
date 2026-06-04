import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTurn } from '../src/agent.js';

// ---- test doubles ----

function chunk(delta) {
  return { choices: [{ delta }] };
}

function toolCallChunks(id, name, argsJson) {
  // split arguments across two chunks to exercise delta accumulation
  const half = Math.ceil(argsJson.length / 2);
  return [
    chunk({ tool_calls: [{ index: 0, id, function: { name, arguments: argsJson.slice(0, half) } }] }),
    chunk({ tool_calls: [{ index: 0, function: { arguments: argsJson.slice(half) } }] }),
  ];
}

/** Fake OpenAI client: each call to create() returns the next scripted stream. */
function fakeClient(scripts) {
  let call = 0;
  return {
    chat: {
      completions: {
        create: async () => {
          const chunks = scripts[call++];
          return {
            async *[Symbol.asyncIterator]() {
              for (const c of chunks) yield c;
            },
          };
        },
      },
    },
  };
}

const allowAll = { check: async () => ({ allowed: true }) };
const denyAll = { check: async () => ({ allowed: false }) };

function fakeTools(executeImpl) {
  return { definitions: [], executeTool: executeImpl };
}

// ---- tests ----

test('plain text response ends the turn', async () => {
  const client = fakeClient([[chunk({ content: 'hello ' }), chunk({ content: 'world' })]]);
  const messages = [{ role: 'user', content: 'hi' }];
  let streamed = '';
  await runTurn({
    client,
    models: ['m'],
    messages,
    tools: fakeTools(async () => 'unused'),
    permissions: allowAll,
    onText: (t) => (streamed += t),
  });
  assert.equal(streamed, 'hello world');
  assert.equal(messages.at(-1).role, 'assistant');
  assert.equal(messages.at(-1).content, 'hello world');
});

test('tool call is executed and result fed back', async () => {
  const client = fakeClient([
    toolCallChunks('c1', 'read_file', '{"path":"a.txt"}'),
    [chunk({ content: 'done' })],
  ]);
  const messages = [{ role: 'user', content: 'read a.txt' }];
  const executed = [];
  await runTurn({
    client,
    models: ['m'],
    messages,
    tools: fakeTools(async (name, args) => {
      executed.push([name, args]);
      return 'file content';
    }),
    permissions: allowAll,
  });
  assert.deepEqual(executed, [['read_file', { path: 'a.txt' }]]);
  const toolMsg = messages.find((m) => m.role === 'tool');
  assert.equal(toolMsg.tool_call_id, 'c1');
  assert.equal(toolMsg.content, 'file content');
  assert.equal(messages.at(-1).content, 'done');
});

test('denied tool call sends denial back to the model', async () => {
  const client = fakeClient([
    toolCallChunks('c1', 'run_command', '{"command":"rm -rf /"}'),
    [chunk({ content: 'understood' })],
  ]);
  const messages = [{ role: 'user', content: 'wipe it' }];
  let executed = false;
  await runTurn({
    client,
    models: ['m'],
    messages,
    tools: fakeTools(async () => {
      executed = true;
      return 'x';
    }),
    permissions: denyAll,
  });
  assert.equal(executed, false);
  assert.match(messages.find((m) => m.role === 'tool').content, /denied/i);
});

test('malformed tool arguments become an error result, not a crash', async () => {
  const client = fakeClient([
    [chunk({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'read_file', arguments: '{not json' } }] })],
    [chunk({ content: 'sorry' })],
  ]);
  const messages = [{ role: 'user', content: 'go' }];
  await runTurn({
    client,
    models: ['m'],
    messages,
    tools: fakeTools(async () => 'unused'),
    permissions: allowAll,
  });
  assert.match(messages.find((m) => m.role === 'tool').content, /invalid JSON/i);
});

test('iteration cap stops a looping model', async () => {
  // 16 scripted tool-call responses; cap is 15
  const scripts = Array.from({ length: 16 }, (_, i) => toolCallChunks(`c${i}`, 'grep', '{"pattern":"x"}'));
  const client = fakeClient(scripts);
  const messages = [{ role: 'user', content: 'loop' }];
  await assert.rejects(
    runTurn({
      client,
      models: ['m'],
      messages,
      tools: fakeTools(async () => 'match'),
      permissions: allowAll,
    }),
    /15 tool iterations/
  );
});

test('denial feedback is included in the tool result', async () => {
  const client = fakeClient([
    toolCallChunks('c1', 'run_command', '{"command":"rm -rf /"}'),
    [chunk({ content: 'will do' })],
  ]);
  const messages = [{ role: 'user', content: 'wipe it' }];
  await runTurn({
    client,
    models: ['m'],
    messages,
    tools: fakeTools(async () => 'unused'),
    permissions: { check: async () => ({ allowed: false, feedback: 'move it to backup/ instead' }) },
  });
  const toolMsg = messages.find((m) => m.role === 'tool');
  assert.match(toolMsg.content, /denied/i);
  assert.match(toolMsg.content, /move it to backup\/ instead/);
});

/** client whose create() dispatches on the requested model */
function modelClient(handlers) {
  return {
    chat: {
      completions: {
        create: async ({ model }) => handlers[model](),
      },
    },
  };
}

function textStream(text) {
  return {
    async *[Symbol.asyncIterator]() {
      yield chunk({ content: text });
    },
  };
}

test('falls back to the next model on 429 and reports the switch', async () => {
  const switches = [];
  const client = modelClient({
    'a/flaky': () => { throw Object.assign(new Error('rate limited'), { status: 429 }); },
    'b/solid': () => textStream('answer'),
  });
  const messages = [{ role: 'user', content: 'hi' }];
  await runTurn({
    client,
    models: ['a/flaky', 'b/solid'],
    messages,
    tools: fakeTools(async () => 'unused'),
    permissions: allowAll,
    retryDelayMs: 0,
    onModelSwitch: (from, to) => switches.push([from, to]),
  });
  assert.deepEqual(switches, [['a/flaky', 'b/solid']]);
  assert.equal(messages.at(-1).content, 'answer');
});

test('throws when every model in the chain is exhausted', async () => {
  const client = modelClient({
    'a/m': () => { throw Object.assign(new Error('rate limited'), { status: 429 }); },
    'b/m': () => { throw Object.assign(new Error('bad gateway'), { status: 502 }); },
  });
  await assert.rejects(
    runTurn({
      client,
      models: ['a/m', 'b/m'],
      messages: [{ role: 'user', content: 'hi' }],
      tools: fakeTools(async () => 'unused'),
      permissions: allowAll,
      retryDelayMs: 0,
    }),
    /bad gateway/ // the LAST availability error propagates
  );
});

test('does not fall back on non-availability errors', async () => {
  let switched = false;
  const client = modelClient({
    'a/m': () => { throw Object.assign(new Error('bad request'), { status: 400 }); },
    'b/m': () => textStream('never'),
  });
  await assert.rejects(
    runTurn({
      client,
      models: ['a/m', 'b/m'],
      messages: [{ role: 'user', content: 'hi' }],
      tools: fakeTools(async () => 'unused'),
      permissions: allowAll,
      retryDelayMs: 0,
      onModelSwitch: () => { switched = true; },
    }),
    /bad request/
  );
  assert.equal(switched, false);
});

test('does not fall back after partial content has streamed', async () => {
  const client = modelClient({
    'a/m': () => ({
      async *[Symbol.asyncIterator]() {
        yield chunk({ content: 'partial' });
        throw Object.assign(new Error('connection reset'), { status: 502 });
      },
    }),
    'b/m': () => textStream('never'),
  });
  let switched = false;
  await assert.rejects(
    runTurn({
      client,
      models: ['a/m', 'b/m'],
      messages: [{ role: 'user', content: 'hi' }],
      tools: fakeTools(async () => 'unused'),
      permissions: allowAll,
      retryDelayMs: 0,
      onModelSwitch: () => { switched = true; },
    }),
    /connection reset/
  );
  assert.equal(switched, false); // re-streaming would duplicate visible output
});
