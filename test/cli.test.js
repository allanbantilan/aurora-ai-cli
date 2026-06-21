import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCliArgs,
  formatCliHelp,
  formatProviderRows,
  formatModelRows,
  providerStatusRows,
  providerTier,
  formatDoctorReport,
} from '../src/cli.js';

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

test('providerTier distinguishes free and paid providers', () => {
  assert.equal(providerTier('openrouter'), 'free');
  assert.equal(providerTier('google'), 'free');
  assert.equal(providerTier('groq'), 'free');
  assert.equal(providerTier('mistral'), 'free');
  assert.equal(providerTier('anthropic'), 'paid');
  assert.equal(providerTier('openai'), 'paid');
});

test('formatProviderRows distinguishes configured and failed states', () => {
  const rows = formatProviderRows([
    { id: 'openrouter', name: 'OpenRouter', status: 'usable' },
    { id: 'groq', name: 'Groq', status: 'fetch failed', error: 'HTTP 401' },
    { id: 'openai', name: 'OpenAI', status: 'not configured' },
  ]);
  assert.match(rows, /OpenRouter\s+usable\s+free/);
  assert.match(rows, /Groq\s+fetch failed: HTTP 401\s+free/);
  assert.match(rows, /OpenAI\s+not configured\s+paid/);
});

test('formatModelRows uses available model heading and tier labels', () => {
  const out = formatModelRows([
    { id: 'qwen3-coder', provider: 'openrouter' },
    { id: 'claude-sonnet-4-20250514', provider: 'anthropic' },
  ]);
  assert.match(out, /Available tool-capable models:/);
  assert.doesNotMatch(out, /Free tool-capable models/);
  assert.match(out, /qwen3-coder \(OpenRouter, free\)/);
  assert.match(out, /claude-sonnet-4-20250514 \(Anthropic, paid\)/);
});

test('providerStatusRows derives configured status from loaded apiKeys', () => {
  const rows = providerStatusRows(
    [
      { id: 'openrouter', name: 'OpenRouter' },
      { id: 'google', name: 'Google AI Studio' },
      { id: 'openai', name: 'OpenAI' },
    ],
    {
      openrouter: 'sk-env-key',
      google: '',
      openai: 'sk-credential-store-key',
    }
  );

  assert.deepEqual(rows, [
    { id: 'openrouter', name: 'OpenRouter', status: 'configured' },
    { id: 'google', name: 'Google AI Studio', status: 'not configured' },
    { id: 'openai', name: 'OpenAI', status: 'configured' },
  ]);
});

test('formatDoctorReport gives actionable setup output', () => {
  const out = formatDoctorReport({
    nodeOk: true,
    providers: [{ id: 'openrouter', name: 'OpenRouter', status: 'not configured' }],
    models: [],
  });
  assert.match(out, /Node.js/);
  assert.match(out, /OpenRouter/);
  assert.match(out, /https:\/\/openrouter.ai\/keys/);
});
