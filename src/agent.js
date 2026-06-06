import { withRetry } from './client.js';

const MAX_ITERATIONS = 15;

/**
 * Run one user turn: stream completions, execute tool calls, loop until the
 * model answers with plain text. Mutates `messages` in place.
 * `models` is an ordered fallback chain; on availability errors (429/5xx)
 * before any content has streamed, the next model is tried and
 * onModelSwitch(failed, next) fires. Other errors propagate immediately.
 * A stream with no delta for stallMs is aborted and treated like an availability error.
 * onUsage(usage) fires after each completion that reports a usage object
 * ({prompt_tokens, ...}) on the final stream chunk; silent otherwise.
 * onToolEnd(name, args, result) fires after each tool call resolves
 * (including permission denials and error results).
 */
export async function runTurn({
  client,
  models,
  messages,
  tools,
  permissions,
  onText,
  onReasoning,
  onToolStart,
  onToolEnd,
  onRetry,
  onModelSwitch,
  onUsage,
  retryDelayMs = 2000,
  stallMs = 30_000,
}) {
  let activeIndex = 0;

  const complete = async () => {
    for (;;) {
      let streamedAnything = false;
      const tappedOnText = (t) => {
        streamedAnything = true;
        onText?.(t);
      };
      try {
        return await streamCompletion(
          client, models[activeIndex], messages, tools.definitions,
          tappedOnText, onReasoning, onRetry, retryDelayMs, stallMs
        );
      } catch (err) {
        const availability = err.status === 429 || err.status >= 500 || err.stalled;
        const canFallback = availability && !streamedAnything && activeIndex < models.length - 1;
        if (!canFallback) throw err;
        const failed = models[activeIndex];
        activeIndex += 1;
        onModelSwitch?.(failed, models[activeIndex]);
      }
    }
  };

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const { content, toolCalls, usage } = await complete();
    if (usage) onUsage?.(usage);

    const assistantMsg = { role: 'assistant', content: content || null };
    if (toolCalls.length) assistantMsg.tool_calls = toolCalls;
    messages.push(assistantMsg);

    if (!toolCalls.length) return;

    for (const call of toolCalls) {
      const name = call.function.name;
      let result;
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        result = 'Error: invalid JSON in tool arguments';
      }
      if (result === undefined) {
        onToolStart?.(name, args);
        const { allowed, feedback } = await permissions.check(name, args);
        result = allowed
          ? await tools.executeTool(name, args)
          : `User denied this action.${feedback ? ` Instruction: ${feedback}` : ''}`;
      }
      onToolEnd?.(name, args, result);
      messages.push({ role: 'tool', tool_call_id: call.id, content: result });
    }
  }
  throw new Error(`Stopped after ${MAX_ITERATIONS} tool iterations. Ask the user how to proceed.`);
}

/** Race one stream read against the inter-delta stall timer. */
function nextWithStall(it, stallMs, model) {
  let timer;
  // swallow the race-loser's eventual rejection (e.g. abort error after a
  // stall) so it can never surface as an unhandled rejection
  const read = it.next();
  read.catch(() => {});
  return Promise.race([
    read,
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(Object.assign(new Error(`${model}: no response for ${Math.round(stallMs / 1000)}s`), { stalled: true }));
      }, stallMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Stream one completion, accumulating text and tool-call deltas. */
async function streamCompletion(client, model, messages, definitions, onText, onReasoning, onRetry, retryDelayMs = 2000, stallMs = 30_000) {
  const stream = await withRetry(
    () => client.chat.completions.create({ model, messages, tools: definitions, stream: true, stream_options: { include_usage: true } }),
    2,
    retryDelayMs,
    onRetry
  );

  let content = '';
  let usage = null;
  const toolCalls = [];
  const it = stream[Symbol.asyncIterator]();
  for (;;) {
    let part;
    try {
      part = await nextWithStall(it, stallMs, model);
    } catch (err) {
      if (err.stalled) stream.controller?.abort?.(); // best-effort: free the hung connection
      throw err;
    }
    if (part.done) break;
    if (part.value.usage) usage = part.value.usage;
    const delta = part.value.choices?.[0]?.delta;
    if (!delta) continue;
    if (delta.reasoning) onReasoning?.(delta.reasoning);
    if (delta.content) {
      content += delta.content;
      onText?.(delta.content);
    }
    for (const tc of delta.tool_calls || []) {
      if (!toolCalls[tc.index]) {
        toolCalls[tc.index] = { id: '', type: 'function', function: { name: '', arguments: '' } };
      }
      const cur = toolCalls[tc.index];
      if (tc.id) cur.id = tc.id;
      if (tc.function?.name) cur.function.name += tc.function.name;
      if (tc.function?.arguments) cur.function.arguments += tc.function.arguments;
    }
  }
  return { content, toolCalls: toolCalls.filter(Boolean), usage };
}
