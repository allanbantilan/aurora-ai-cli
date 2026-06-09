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
