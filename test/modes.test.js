import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MODE, modeLabel, normalizeMode } from '../src/modes.js';

test('permission is the default mode', () => {
  assert.equal(DEFAULT_MODE, 'permission');
  assert.equal(normalizeMode(), 'permission');
  assert.equal(normalizeMode('unknown'), 'permission');
});

test('mode labels are user-facing', () => {
  assert.equal(modeLabel('permission'), 'Default');
  assert.equal(modeLabel('auto'), 'Auto');
  assert.equal(modeLabel('plan'), 'Plan');
  assert.equal(modeLabel('unknown'), 'Default');
});
