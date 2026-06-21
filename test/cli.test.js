import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCliArgs, formatCliHelp } from '../src/cli.js';

test('parseCliArgs defaults to chat', () => {
  assert.deepEqual(parseCliArgs([]), { command: 'chat', flags: {}, task: '' });
});

test('parseCliArgs recognizes help without credentials', () => {
  assert.deepEqual(parseCliArgs(['--help']), { command: 'help', flags: {}, task: '' });
  assert.deepEqual(parseCliArgs(['-h']), { command: 'help', flags: {}, task: '' });
  assert.deepEqual(parseCliArgs(['help']), { command: 'help', flags: {}, task: '' });
});

test('parseCliArgs recognizes explicit commands', () => {
  assert.deepEqual(parseCliArgs(['chat']), { command: 'chat', flags: {}, task: '' });
  assert.deepEqual(parseCliArgs(['models']), { command: 'models', flags: {}, task: '' });
  assert.deepEqual(parseCliArgs(['providers']), { command: 'providers', flags: {}, task: '' });
  assert.deepEqual(parseCliArgs(['doctor']), { command: 'doctor', flags: {}, task: '' });
});

test('parseCliArgs recognizes one-shot run forms', () => {
  assert.deepEqual(parseCliArgs(['run', '--model', 'm1', '--yes', 'hello']), {
    command: 'run',
    flags: { model: 'm1', yes: true },
    task: 'hello',
  });
  assert.deepEqual(parseCliArgs(['--model', 'm1', '--yes', 'hello', 'world']), {
    command: 'run',
    flags: { model: 'm1', yes: true },
    task: 'hello world',
  });
});

test('parseCliArgs reports unknown flags and commands', () => {
  assert.deepEqual(parseCliArgs(['--wat']), { command: 'error', flags: {}, task: '', error: 'Unknown flag: --wat' });
  assert.deepEqual(parseCliArgs(['wat']), { command: 'error', flags: {}, task: '', error: 'Unknown command: wat' });
});

test('formatCliHelp documents public commands', () => {
  const help = formatCliHelp();
  for (const text of ['aurora', 'aurora chat', 'aurora models', 'aurora providers', 'aurora doctor', 'aurora run', '--model', '--yes']) {
    assert.match(help, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
