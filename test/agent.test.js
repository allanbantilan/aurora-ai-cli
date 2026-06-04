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

const allowAll = { check: async () => true };
const denyAll = { check: async () => false };

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
    model: 'm',
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
    model: 'm',
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
    model: 'm',
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
    model: 'm',
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
      model: 'm',
      messages,
      tools: fakeTools(async () => 'match'),
      permissions: allowAll,
    }),
    /15 tool iterations/
  );
});
