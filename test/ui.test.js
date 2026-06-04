import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { promptLabel, createSpinner } from '../src/ui.js';

test('promptLabel shows the cwd folder name', () => {
  const label = promptLabel(path.join('C:', 'projects', 'my-app'));
  // colors are disabled under non-TTY test runs, so the label is plain text
  assert.equal(label.includes('my-app'), true);
  assert.equal(label.endsWith(' > '), true);
});

test('spinner is safe to start/update/stop without a TTY', () => {
  const s = createSpinner();
  s.start('thinking...');
  s.update('still thinking...');
  s.stop();
  s.stop(); // idempotent
});
