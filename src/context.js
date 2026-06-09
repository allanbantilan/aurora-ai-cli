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
  const recent = messages.slice(-keepRecent);
  const olderStart = system ? 1 : 0;
  const older = messages.slice(olderStart, -keepRecent);
  const summary = {
    role: 'system',
    content: `Conversation history compacted locally. Preserve these facts and continue the active task:\n${summarize(older)}`,
  };
  return [...(system ? [system] : []), summary, ...recent];
}
