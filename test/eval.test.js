import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadEvalFixtures, runEvalFixture } from '../scripts/eval.js';

test('offline eval fixtures run deterministically with real tools', async () => {
  const fixtures = loadEvalFixtures(path.join(process.cwd(), 'test', 'evals'));
  const results = await Promise.all(fixtures.map((fixture) => runEvalFixture(fixture)));

  assert.equal(results.length, 5);
  for (const result of results) assert.equal(result.passed, true, `${result.name}: ${result.failures.join('\n')}`);
  assert.deepEqual(results.find(({ name }) => name === 'create-and-verify-file').tools, ['write_file', 'read_file']);
  assert.deepEqual(results.find(({ name }) => name === 'eloquent-soft-delete-scope').skills, ['eloquent']);
});

test('verification expectation fails when the check occurs before modification', async () => {
  const result = await runEvalFixture({
    name: 'bad-verification-order',
    prompt: 'Create hello.txt and verify it.',
    responses: [
      { tool: 'read_file', args: { path: 'hello.txt' } },
      { tool: 'write_file', args: { path: 'hello.txt', content: 'hello\n' } },
      { content: 'Done.' },
    ],
    expect: {
      verification: { after: 'write_file', tool: 'read_file' },
    },
  });

  assert.equal(result.passed, false);
  assert.match(result.failures.join('\n'), /verification/i);
});
