import OpenAI from 'openai';

const BASE_URL = 'https://openrouter.ai/api/v1';

export function createClient(apiKey) {
  // maxRetries: 0 — withRetry below is the only retry layer; the SDK's silent
  // internal retries would otherwise multiply the wait with no user feedback.
  return new OpenAI({ apiKey, baseURL: BASE_URL, maxRetries: 0 });
}

/** Keep models that are free (prompt + completion price 0) and support native tool calling. */
export function filterFreeToolModels(models) {
  return models
    .filter(
      (m) =>
        m.pricing?.prompt === '0' &&
        m.pricing?.completion === '0' &&
        (m.supported_parameters || []).includes('tools')
    )
    .map((m) => ({ id: m.id, name: m.name, context: m.context_length }));
}

export async function fetchFreeToolModels() {
  const res = await fetch(`${BASE_URL}/models`);
  if (!res.ok) throw new Error(`Model list fetch failed: HTTP ${res.status}`);
  const { data } = await res.json();
  return filterFreeToolModels(data);
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
