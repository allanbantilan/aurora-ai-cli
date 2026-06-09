import OpenAI from 'openai';
import { telemetryScore } from './telemetry.js';

const BASE_URL = 'https://openrouter.ai/api/v1';

export const PREFERRED_TOOL_MODEL_PATTERNS = [
  /qwen.*coder/i,
  /devstral/i,
  /codestral/i,
  /deepseek.*coder/i,
];

export function createClient(apiKey) {
  // maxRetries: 0 — withRetry below is the only retry layer; the SDK's silent
  // internal retries would otherwise multiply the wait with no user feedback.
  return new OpenAI({ apiKey, baseURL: BASE_URL, maxRetries: 0 });
}

/** Keep models that are free (prompt + completion price 0) and support native tool calling. */
export function filterFreeToolModels(models, telemetry = {}) {
  return models
    .filter(
      (m) =>
        m.pricing?.prompt === '0' &&
        m.pricing?.completion === '0' &&
        (m.supported_parameters || []).includes('tools')
    )
    .map((m, index) => ({ id: m.id, name: m.name, context: m.context_length, index }))
    .sort((a, b) =>
      preferredModelRank(a.id) - preferredModelRank(b.id) ||
      telemetryScore(telemetry[b.id]) - telemetryScore(telemetry[a.id]) ||
      a.index - b.index
    )
    .map(({ index: _index, ...model }) => model);
}

function preferredModelRank(id) {
  const rank = PREFERRED_TOOL_MODEL_PATTERNS.findIndex((pattern) => pattern.test(id));
  return rank < 0 ? PREFERRED_TOOL_MODEL_PATTERNS.length : rank;
}

export async function fetchFreeToolModels(telemetry = {}) {
  const res = await fetch(`${BASE_URL}/models`);
  if (!res.ok) throw new Error(`Model list fetch failed: HTTP ${res.status}`);
  const { data } = await res.json();
  return filterFreeToolModels(data, telemetry);
}

const STATUS_TIMEOUT_MS = 5000;

/**
 * Fetch per-model endpoint health in parallel.
 * Returns Map<id, {uptime: number|null, ok: boolean} | null> — null = no data.
 */
export async function fetchModelStatus(ids, fetchFn = fetch) {
  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const res = await fetchFn(`${BASE_URL}/models/${id}/endpoints`, {
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { data } = await res.json();
      const live = (data?.endpoints ?? []).filter((e) => e.status >= 0);
      const uptimes = live
        .map((e) => e.uptime_last_30m)
        .filter((u) => typeof u === 'number');
      return { uptime: uptimes.length ? Math.max(...uptimes) : null, ok: live.length > 0 };
    })
  );
  return new Map(ids.map((id, i) => [id, results[i].status === 'fulfilled' ? results[i].value : null]));
}

/** Retry fn on HTTP 429 with linear backoff. onRetry(attempt, retries, delayMs) is called before each wait. */
export async function withRetry(fn, retries = 2, baseDelayMs = 2000, onRetry) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err.status === 429 && attempt < retries) {
        const delayMs = baseDelayMs * (attempt + 1);
        onRetry?.(attempt + 1, retries, delayMs);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
}
