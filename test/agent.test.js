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

test('onToolEnd fires with name, args and result after execution', async () => {
  const calls = [];
  const client = fakeClient([
    toolCallChunks('c1', 'write_file', '{"path":"a.txt","content":"hi"}'),
    [chunk({ content: 'done' })],
  ]);
  await runTurn({
    client,
    models: ['m'],
    messages: [{ role: 'user', content: 'write it' }],
    tools: fakeTools(async () => 'Wrote a.txt (2 chars)'),
    permissions: allowAll,
    onToolEnd: (name, args, result) => calls.push({ name, args, result }),
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'write_file');
  assert.deepEqual(calls[0].args, { path: 'a.txt', content: 'hi' });
  assert.equal(calls[0].result, 'Wrote a.txt (2 chars)');
});

test('schema-invalid tool arguments become an error before permission checks', async () => {
  const client = fakeClient([
    toolCallChunks('c1', 'read_file', '{"path":42}'),
    [chunk({ content: 'corrected' })],
  ]);
  let checked = false;
  let executed = false;
  const definitions = [{
    type: 'function',
    function: {
      name: 'read_file',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  }];
  const messages = [{ role: 'user', content: 'read it' }];
  await runTurn({
    client,
    models: ['m'],
    messages,
    tools: { definitions, executeTool: async () => { executed = true; } },
    permissions: { check: async () => { checked = true; return { allowed: true }; } },
  });
  assert.equal(checked, false);
  assert.equal(executed, false);
  assert.match(messages.find((m) => m.role === 'tool').content, /must be a string/);
});

test('tool progress is forwarded while a tool executes', async () => {
  const progress = [];
  const client = fakeClient([
    toolCallChunks('c1', 'run_command', '{"command":"composer install"}'),
    [chunk({ content: 'done' })],
  ]);
  await runTurn({
    client,
    models: ['m'],
    messages: [{ role: 'user', content: 'install' }],
    tools: fakeTools(async (_name, _args, options) => {
      options.onProgress('Downloading packages');
      return 'installed';
    }),
    permissions: allowAll,
    onToolProgress: (name, text) => progress.push([name, text]),
  });

  assert.deepEqual(progress, [['run_command', 'Downloading packages']]);
});

test('onToolApproved fires after permission resolves and before execution', async () => {
  const events = [];
  const client = fakeClient([
    toolCallChunks('c1', 'run_command', '{"command":"composer install"}'),
    [chunk({ content: 'done' })],
  ]);
  await runTurn({
    client,
    models: ['m'],
    messages: [{ role: 'user', content: 'install' }],
    tools: fakeTools(async () => {
      events.push('execute');
      return 'installed';
    }),
    permissions: {
      check: async () => {
        events.push('approved');
        return { allowed: true };
      },
    },
    onToolStart: () => events.push('start'),
    onToolApproved: () => events.push('resume-ui'),
  });

  assert.deepEqual(events, ['start', 'approved', 'resume-ui', 'execute']);
});

test('onToolEnd fires with the denial message when permission is refused', async () => {
  const calls = [];
  const client = fakeClient([
    toolCallChunks('c1', 'write_file', '{"path":"a.txt","content":"hi"}'),
    [chunk({ content: 'ok' })],
  ]);
  await runTurn({
    client,
    models: ['m'],
    messages: [{ role: 'user', content: 'write it' }],
    tools: fakeTools(async () => 'never called'),
    permissions: denyAll,
    onToolEnd: (name, args, result) => calls.push(result),
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^User denied/);
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
  await runTurn({
    client,
    models: ['a/m', 'b/m'],
    messages: [{ role: 'user', content: 'hi' }],
    tools: fakeTools(async () => 'unused'),
    permissions: allowAll,
    retryDelayMs: 0,
    onModelSwitch: () => { switched = true; },
  });
  assert.equal(switched, true);
});

function hangingStream(firstChunks) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of firstChunks) yield c;
      await new Promise(() => {}); // hang forever
    },
  };
}

test('reasoning deltas fire onReasoning and do not end up in content', async () => {
  const client = fakeClient([[chunk({ reasoning: 'hmm, ' }), chunk({ reasoning: 'let me think' }), chunk({ content: 'answer' })]]);
  const messages = [{ role: 'user', content: 'hi' }];
  let reasoning = '';
  await runTurn({
    client,
    models: ['m'],
    messages,
    tools: fakeTools(async () => 'unused'),
    permissions: allowAll,
    onReasoning: (t) => (reasoning += t),
  });
  assert.equal(reasoning, 'hmm, let me think');
  assert.equal(messages.at(-1).content, 'answer');
});

test('stalled stream falls back to the next model', async () => {
  const switches = [];
  const client = modelClient({
    'a/stuck': () => hangingStream([chunk({ reasoning: 'thinking' })]),
    'b/solid': () => textStream('answer'),
  });
  const messages = [{ role: 'user', content: 'hi' }];
  await runTurn({
    client,
    models: ['a/stuck', 'b/solid'],
    messages,
    tools: fakeTools(async () => 'unused'),
    permissions: allowAll,
    retryDelayMs: 0,
    stallMs: 20,
    onModelSwitch: (from, to) => switches.push([from, to]),
  });
  assert.deepEqual(switches, [['a/stuck', 'b/solid']]);
  assert.equal(messages.at(-1).content, 'answer');
});

test('stall after visible content propagates instead of falling back', async () => {
  const client = modelClient({
    'a/stuck': () => hangingStream([chunk({ content: 'partial' })]),
    'b/solid': () => textStream('never'),
  });
  let switched = false;
  await assert.rejects(
    runTurn({
      client,
      models: ['a/stuck', 'b/solid'],
      messages: [{ role: 'user', content: 'hi' }],
      tools: fakeTools(async () => 'unused'),
      permissions: allowAll,
      retryDelayMs: 0,
      stallMs: 20,
      onModelSwitch: () => { switched = true; },
    }),
    /no response/
  );
  assert.equal(switched, false);
});

test('deltas arriving within the stall window keep the stream alive', async () => {
  const client = fakeClient([
    [
      chunk({ reasoning: 'a' }),
      chunk({ reasoning: 'b' }),
      chunk({ content: 'slow but steady' }),
    ],
  ]);
  const messages = [{ role: 'user', content: 'hi' }];
  await runTurn({
    client,
    models: ['m'],
    messages,
    tools: fakeTools(async () => 'unused'),
    permissions: allowAll,
    stallMs: 5000,
  });
  assert.equal(messages.at(-1).content, 'slow but steady');
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

test('usage on the final stream chunk fires onUsage', () => {
  // OpenRouter (with stream_options.include_usage) sends a last chunk with
  // empty choices and a usage object
  const usageChunk = { choices: [], usage: { prompt_tokens: 24000, completion_tokens: 12 } };
  const client = fakeClient([[chunk({ content: 'hi' }), usageChunk]]);
  const messages = [{ role: 'user', content: 'hello' }];
  const seen = [];
  return runTurn({
    client,
    models: ['m'],
    messages,
    tools: fakeTools(async () => 'unused'),
    permissions: allowAll,
    onUsage: (u) => seen.push(u),
  }).then(() => {
    assert.deepEqual(seen, [{ prompt_tokens: 24000, completion_tokens: 12 }]);
  });
});

test('onUsage fires per completion so the last call reflects the final context size', async () => {
  const usage = (n) => ({ choices: [], usage: { prompt_tokens: n } });
  const client = fakeClient([
    [...toolCallChunks('c1', 'read_file', '{"path":"a.txt"}'), usage(1000)],
    [chunk({ content: 'done' }), usage(2500)],
  ]);
  const messages = [{ role: 'user', content: 'go' }];
  const seen = [];
  await runTurn({
    client,
    models: ['m'],
    messages,
    tools: fakeTools(async () => 'content'),
    permissions: allowAll,
    onUsage: (u) => seen.push(u.prompt_tokens),
  });
  assert.deepEqual(seen, [1000, 2500]);
});

test('streams without usage data never fire onUsage', async () => {
  const client = fakeClient([[chunk({ content: 'hi' })]]);
  let fired = false;
  await runTurn({
    client,
    models: ['m'],
    messages: [{ role: 'user', content: 'x' }],
    tools: fakeTools(async () => 'unused'),
    permissions: allowAll,
    onUsage: () => { fired = true; },
  });
  assert.equal(fired, false);
});

test('completion requests opt in to usage reporting via stream_options', async () => {
  let captured;
  const client = {
    chat: {
      completions: {
        create: async (params) => {
          captured = params;
          return textStream('ok');
        },
      },
    },
  };
  await runTurn({
    client,
    models: ['m'],
    messages: [{ role: 'user', content: 'x' }],
    tools: fakeTools(async () => 'unused'),
    permissions: allowAll,
  });
  assert.deepEqual(captured.stream_options, { include_usage: true });
  assert.deepEqual(captured.provider, { require_parameters: false });
  assert.equal(captured.parallel_tool_calls, false);
});

test('strict privacy denies provider data collection', async () => {
  let captured;
  const client = { chat: { completions: { create: async (params) => { captured = params; return textStream('ok'); } } } };
  await runTurn({
    client,
    models: ['m'],
    messages: [{ role: 'user', content: 'x' }],
    tools: fakeTools(async () => 'unused'),
    permissions: allowAll,
    strictPrivacy: true,
  });
  assert.deepEqual(captured.provider, { require_parameters: false, data_collection: 'deny' });
});
