const COMPACT_AT = 0.7;

export function shouldCompact(promptTokens, contextLimit, threshold = COMPACT_AT) {
  return Number.isFinite(promptTokens) && Number.isFinite(contextLimit) && contextLimit > 0 &&
    promptTokens / contextLimit >= threshold;
}

function summarize(messages) {
  return messages
    .map((message) => {
      const content = typeof message.content === 'string' ? message.content.trim() : '';
      return content ? `${message.role}: ${content.slice(0, 500)}` : '';
    })
    .filter(Boolean)
    .join('\n')
    .slice(0, 6_000);
}

export function compactMessages(messages, { keepRecent = 8 } = {}) {
  if (messages.length <= keepRecent + 2) return messages;
  const system = messages[0]?.role === 'system' ? messages[0] : null;
  const olderStart = system ? 1 : 0;

  // The recent window must not begin on a `tool` message: the API requires every
  // tool result to follow its parent assistant `tool_calls` message, and that
  // parent would otherwise be summarized away — producing an orphaned tool result
  // that 400s the next request. Walk the boundary back to include the parent.
  let recentStart = Math.max(olderStart, messages.length - keepRecent);
  while (recentStart > olderStart && messages[recentStart].role === 'tool') {
    recentStart -= 1;
  }

  const recent = messages.slice(recentStart);
  const older = messages.slice(olderStart, recentStart);
  if (!older.length) return messages; // nothing left to summarize after the walk-back

  const summary = {
    role: 'system',
    content: `Conversation history compacted locally. Preserve these facts and continue the active task:\n${summarize(older)}`,
  };
  return [...(system ? [system] : []), summary, ...recent];
}
