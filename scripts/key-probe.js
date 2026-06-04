#!/usr/bin/env node
// Diagnostic probe v3: runs the REAL selectMenu with in-menu key logging
// (AURORA_DEBUG_KEYS). Press Down, Down, Up, then Enter.
process.env.AURORA_DEBUG_KEYS = '1';

const readline = await import('node:readline/promises');
const { selectMenu } = await import('../src/ui.js');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('SIGINT', () => process.exit(0));

console.log(`isTTY=${process.stdin.isTTY} isRaw=${process.stdin.isRaw} WT_SESSION=${Boolean(process.env.WT_SESSION)}`);

const v = await selectMenu(rl, 'Probe menu — press Down, Down, Up, then Enter:', [
  { label: 'first', value: 'first' },
  { label: 'second', value: 'second' },
  { label: 'third', value: 'third' },
]);

console.log(`resolved=${v} (expected "second")`);
rl.close();
