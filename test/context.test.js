import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldCompact, compactMessages } from '../src/context.js';

test('compacts at seventy percent context usage', () => {
  assert.equal(shouldCompact(7000, 10000), true);
  assert.equal(shouldCompact(6999, 10000), false);
});

test('compaction preserves system prompt and recent task while summarizing older history', () => {
  const messages = [
    { role: 'system', content: 'rules' },
    { role: 'user', content: 'old request' },
    { role: 'assistant', content: 'old answer' },
    { role: 'tool', content: 'Command failed: root cause' },
    { role: 'user', content: 'current request' },
    { role: 'assistant', content: 'working' },
  ];
  const compacted = compactMessages(messages, { keepRecent: 2 });
  assert.equal(compacted[0].content, 'rules');
  assert.match(compacted[1].content, /old request/);
  assert.match(compacted[1].content, /Command failed: root cause/);
  assert.deepEqual(compacted.slice(-2), messages.slice(-2));
});

test('never starts the recent window on an orphaned tool result', () => {
  // keepRecent=2 would slice [tool, assistant] — the tool result's parent
  // assistant (with tool_calls) would be summarized away, orphaning it.
  const messages = [
    { role: 'system', content: 'rules' },
    { role: 'user', content: 'old request' },
    { role: 'assistant', content: 'older answer' },
    { role: 'user', content: 'do the thing' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: 'file body' },
    { role: 'assistant', content: 'done' },
  ];
  const compacted = compactMessages(messages, { keepRecent: 2 });
  // recent window pulled back to include the assistant tool_calls parent
  const firstAfterSummary = compacted[2];
  assert.equal(firstAfterSummary.role, 'assistant');
  assert.ok(Array.isArray(firstAfterSummary.tool_calls));
  // the tool result still immediately follows its parent
  const toolIdx = compacted.findIndex((m) => m.role === 'tool');
  assert.equal(compacted[toolIdx - 1].role, 'assistant');
  assert.ok(Array.isArray(compacted[toolIdx - 1].tool_calls));
});

test('returns the original messages when walk-back leaves nothing to summarize', () => {
  const messages = [
    { role: 'system', content: 'rules' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'x', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: 'r' },
    { role: 'tool', tool_call_id: 'c1', content: 'r2' },
  ];
  // keepRecent small enough to trigger, but the only older message is the parent we must keep
  assert.deepEqual(compactMessages(messages, { keepRecent: 1 }), messages);
});
