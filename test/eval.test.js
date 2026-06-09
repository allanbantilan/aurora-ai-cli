import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEvalFixtures, runEvalFixture } from '../scripts/eval.js';

test('offline eval fixtures run deterministically with real tools', async () => {
  const fixtures = loadEvalFixtures(path.join(process.cwd(), 'test', 'evals'));
  const fixture = fixtures.find(({ name }) => name === 'create-and-verify-file');

  assert.ok(fixture);
  const result = await runEvalFixture(fixture);

  assert.equal(result.passed, true, result.failures.join('\n'));
  assert.deepEqual(result.tools, ['write_file', 'read_file']);
  assert.match(result.finalText, /done/i);
});
