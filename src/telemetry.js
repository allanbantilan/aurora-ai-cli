export function recordModelEvent(state, model, event = {}) {
  const item = state[model] ?? {
    successes: 0,
    availabilityFailures: 0,
    malformedToolCalls: 0,
    latencyTotalMs: 0,
    latencySamples: 0,
  };
  if (event.success) item.successes += 1;
  if (event.availabilityFailure) item.availabilityFailures += 1;
  if (event.malformedToolCall) item.malformedToolCalls += 1;
  if (Number.isFinite(event.latencyMs)) {
    item.latencyTotalMs += event.latencyMs;
    item.latencySamples += 1;
  }
  state[model] = item;
  return item;
}

export function telemetryScore(item = {}) {
  const latency = item.latencySamples ? item.latencyTotalMs / item.latencySamples : 0;
  return (item.successes ?? 0) * 10 - (item.availabilityFailures ?? 0) * 8 -
    (item.malformedToolCalls ?? 0) * 5 - latency / 10_000;
}
