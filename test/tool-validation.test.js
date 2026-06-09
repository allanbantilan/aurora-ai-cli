import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateToolArguments } from '../src/tool-validation.js';

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    path: { type: 'string' },
    count: { type: 'integer' },
    mode: { type: 'string', enum: ['a', 'b'] },
  },
  required: ['path'],
};

test('accepts valid tool arguments with optional fields', () => {
  assert.deepEqual(validateToolArguments(schema, { path: 'a', count: 2, mode: 'a' }), []);
});

test('rejects missing, wrong-type, invalid-enum, and unexpected tool arguments', () => {
  assert.deepEqual(validateToolArguments(schema, { count: '2', mode: 'x', extra: true }), [
    'missing required property "path"',
    'property "count" must be an integer',
    'property "mode" must be one of: a, b',
    'unexpected property "extra"',
  ]);
});
