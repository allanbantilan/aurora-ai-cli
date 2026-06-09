import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordModelEvent, telemetryScore } from '../src/telemetry.js';

test('telemetry records successes, failures, malformed calls, and average latency', () => {
  const state = {};
  recordModelEvent(state, 'm', { success: true, latencyMs: 100 });
  recordModelEvent(state, 'm', { success: true, latencyMs: 300 });
  recordModelEvent(state, 'm', { availabilityFailure: true, malformedToolCall: true });
  assert.deepEqual(state.m, { successes: 2, availabilityFailures: 1, malformedToolCalls: 1, latencyTotalMs: 400, latencySamples: 2 });
  assert.ok(telemetryScore(state.m) > telemetryScore({ successes: 0, availabilityFailures: 3, malformedToolCalls: 2 }));
});
