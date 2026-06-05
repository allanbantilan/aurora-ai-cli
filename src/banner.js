import { colorEnabled } from './ui.js';

/** Visual length: strip ANSI escape codes before measuring. */
function vlen(s) {
  return s.replace(/\x1b\[[^m]*m/g, '').length;
}

/** Right-pad string to visual width w. */
function vpad(s, w) {
  const n = w - vlen(s);
  return n > 0 ? s + ' '.repeat(n) : s;
}

const c = (code) => colorEnabled ? `\x1b[${code}m` : '';
const R   = c('0');
const CY  = c('96');       // bright cyan
const WH  = c('97');       // bright white
const DIM = c('2');        // dim
const GR  = c('92');       // bright green
const RED = c('91');       // bright red
const BCY = c('1;96');     // bold bright cyan

const QW = 68;   // queen panel visual width
const PW = 47;   // info panel inner width (between │ chars)

function queenArt() {
  return [
    `          ${WH}*    ${CY}❄${WH}    *        *    ${CY}❄${WH}    *${R}`,
    `         ${WH}/|\\  /|\\  /|\\      /|\\  /|\\  /|\\${R}`,
    `        ${WH}/ | \\/ | \\/ | \\    / | \\/ | \\/ | \\${R}`,
    `   ${CY}❄  ${WH}*|  ${CY}❄    ${WH}\\${CY}❄${WH}  /  \\  ${CY}❄${WH}  /  ${CY}❄${WH}    |*  ${CY}❄${R}`,
    `        ${WH}\\____________________________/${R}`,
    `               ${WH}\\                /${R}`,
    `            ${WH}(   \\______________/   )${R}`,
    `           ${WH}/   ________________   \\${R}`,
    `          ${WH}| / ${CY}◈${WH}              ${CY}◈${WH}  \\ |${R}`,
    `          ${WH}| |      __________     | |${R}`,
    `          ${WH}| |     /          \\    | |${R}`,
    `          ${WH}| |    (  ${CY}›${WH}      ${CY}‹${WH}  )   | |${R}`,
    `          ${WH}| |     \\__________/    | |${R}`,
    `          ${WH}|  \\                   /  |${R}`,
    `          ${WH}|   \\________________/    |${R}`,
    `        ${DIM}░░${R}${WH}▒▒|                    |▒▒${DIM}░░${R}`,
    `       ${DIM}░${R}${WH}▒▓███|____________________|███▓▒${DIM}░${R}`,
    `      ${DIM}░${R}${WH}▒▓████ \\                  / ████▓▒${DIM}░${R}`,
    `     ${DIM}░${R}${WH}▒▓█████  \\________________/  █████▓▒${DIM}░${R}`,
    `    ${DIM}░░${R}${WH}▒▓██████${CY}░░░░░░░░░░░░░░░░${WH}██████▓▒${DIM}░░${R}`,
  ].map(line => vpad(line, QW));
}

function infoPanel({ model, fallbacks, status }) {
  const shortModel = model.split('/').pop().replace(/:free$/, '') || model;
  const fallStr    = fallbacks > 0 ? `+${fallbacks}` : 'none';
  const dot        = status === 'online' ? `${GR}●${R}` : `${RED}●${R}`;

  const BRD = `${DIM}│${R}`;
  const top = `${DIM}┌${'─'.repeat(PW)}┐${R}`;
  const bot = `${DIM}└${'─'.repeat(PW)}┘${R}`;
  const row = (s) => `${BRD}${vpad(s, PW)}${BRD}`;

  return [
    '',
    '',
    '',
    top,
    row(`  ${BCY}✦  A U R O R A${R}`),
    row(''),
    row(`  ${DIM}model    ${R}: ${WH}${shortModel}${R}`),
    row(`  ${DIM}fallbacks${R}: ${WH}${fallStr}${R}`),
    row(`  ${DIM}status   ${R}: ${WH}${status} ${dot}`),
    row(`  ${DIM}session  ${R}: ${CY}00:00:00${R}`),
    row(''),
    row(`  ${DIM}❄  cold . precise . alive  ❄${R}`),
    bot,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
  ];
}

export function printBanner({ model = '—', fallbacks = 0, status = 'online' } = {}) {
  const queen = queenArt();
  const panel = infoPanel({ model, fallbacks, status });
  const n = Math.max(queen.length, panel.length);

  const lines = [];
  for (let i = 0; i < n; i++) {
    const q = queen[i] ?? ' '.repeat(QW);
    const p = panel[i] ?? '';
    lines.push(`${q}  ${p}`);
  }

  process.stdout.write('\n' + lines.join('\n') + '\n\n');
}
