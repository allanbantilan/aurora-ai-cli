#!/usr/bin/env node
// Diagnostic probe v2: replicates the menus' exact raw-keypress takeover and
// prints every keypress event as the menu would receive it.
// Run it, press: Up, Down, Enter, then q to quit.
import readline from 'node:readline/promises';
import rlmod from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const stdin = process.stdin;

console.log(`isTTY=${stdin.isTTY} isRaw=${stdin.isRaw} WT_SESSION=${Boolean(process.env.WT_SESSION)}`);

// exact withRawKeys sequence from src/ui.js
rl.pause();
stdin.listeners('keypress').forEach((l) => stdin.removeListener('keypress', l));
rlmod.emitKeypressEvents(stdin);
if (stdin.isTTY) stdin.setRawMode(true);
stdin.resume();

console.log('press: Up, Down, Enter, Esc — then q to quit. Every key prints below:');
stdin.on('keypress', (str, key = {}) => {
  console.log(
    `[key] name=${String(key.name)} seq=${JSON.stringify(key.sequence)} ctrl=${Boolean(key.ctrl)} meta=${Boolean(key.meta)}`
  );
  if (key.sequence === 'q' || (key.ctrl && key.name === 'c')) process.exit(0);
});
