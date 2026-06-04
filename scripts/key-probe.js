#!/usr/bin/env node
// Diagnostic probe: reproduces aurora's exact permission-menu setup and logs
// raw-mode state plus every keypress the menu receives. Run it in the same
// terminal where the arrows fail, press Up/Down a few times, then Enter.
import readline from 'node:readline/promises';
import { selectMenu } from '../src/ui.js';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.on('SIGINT', () => process.exit(0));

console.log(
  `before menu: isTTY=${process.stdin.isTTY} isRaw=${process.stdin.isRaw} ` +
    `WT_SESSION=${Boolean(process.env.WT_SESSION)} TERM_PROGRAM=${process.env.TERM_PROGRAM ?? ''}`
);

// side-channel key log (intentionally noisy — it will interleave with the menu)
process.stdin.on('keypress', (str, key) => {
  process.stdout.write(`  [key] name=${key?.name} seq=${JSON.stringify(key?.sequence)}\n`);
});

const v = await selectMenu(rl, 'Probe menu — press Down, Down, Up, then Enter:', [
  { label: 'first', value: 'first' },
  { label: 'second', value: 'second' },
  { label: 'third', value: 'third' },
]);

console.log(`resolved=${v} (Down,Down,Up,Enter should resolve "second")`);
console.log(`after menu: isRaw=${process.stdin.isRaw}`);
rl.close();
