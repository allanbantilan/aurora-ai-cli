import { colorEnabled, shortModelName } from './ui.js';

/** Visual length: strip ANSI escape codes before measuring. */
function vlen(s) {
  return s.replace(/\x1b\[[^m]*m/g, '').length;
}

/** Right-pad string to visual width w. */
function vpad(s, w) {
  const n = w - vlen(s);
  return n > 0 ? s + ' '.repeat(n) : s;
}

const c = (code) => (colorEnabled ? `\x1b[${code}m` : '');
const R   = c('0');
const CY  = c('96');     // bright cyan
const WH  = c('97');     // bright white
const DIM = c('2');      // dim
const GR  = c('92');     // bright green
const RED = c('91');     // bright red
const BCY = c('1;96');   // bold bright cyan
const BWH = c('1;97');   // bold bright white

const QW = 46; // queen panel visual width

function queenArt() {
  return [
    `${CY}        ❄${WH}      *      ${CY}❄${WH}      *      ${CY}❄${R}`,
    `${BWH}            /\\     /\\     /\\${R}`,
    `${BWH}           /  \\   /  \\   /  \\${R}`,
    `${BWH}          / ${CY}❄${BWH}  \\ / ${CY}❄${BWH}  \\ / ${CY}❄${BWH}  \\${R}`,
    `${BWH}         |::::::::::::::::::::|${R}`,
    `${WH}          \\                  /${R}`,
    `${WH}           |   ${CY}<>${WH}      ${CY}<>${WH}   |${R}`,
    `${WH}           |                |${R}`,
    `${WH}            \\      ${CY}──${WH}      /${R}`,
    `${WH}             \\______________/${R}`,
    `${WH}             /      ||      \\${R}`,
    `${WH}           /   ${DIM}░${R}${WH}    ||    ${DIM}░${R}${WH}   \\${R}`,
    `${WH}          /   ${DIM}▒░${R}${WH}    ||    ${DIM}░▒${R}${WH}   \\${R}`,
    `${WH}         /   ${DIM}▓▒░${R}${WH} ${CY}❄${WH}  ||  ${CY}❄${WH} ${DIM}░▒▓${R}${WH}   \\${R}`,
    `${WH}        /   ${DIM}█▓▒░${R}${WH}____||____${DIM}░▒▓█${R}${WH}   \\${R}`,
    `${WH}       /__${DIM}░▒▓████████████████▓▒░${R}${WH}__\\${R}`,
    `${CY}      ❄        ${DIM}~ a u r o r a ~${R}${CY}        ❄${R}`,
  ].map((line) => vpad(line, QW));
}

function infoPanel({ chain, status }) {
  const head = chain[0] ? shortModelName(chain[0]) : '—';
  const falls = chain.slice(1).map(shortModelName);
  const dot = status === 'online' ? `${GR}●${R}` : `${RED}●${R}`;

  const inner = [];
  inner.push(`  ${BCY}✦  A U R O R A${R}`);
  inner.push('');
  inner.push(`  ${DIM}model    ${R} ${WH}${head}${R} ${dot}`);
  if (falls.length) {
    inner.push(`  ${DIM}fallback ${R} ${WH}${falls[0]}${R}`);
    for (const f of falls.slice(1)) inner.push(`  ${DIM}         ${R} ${WH}${f}${R}`);
  } else {
    inner.push(`  ${DIM}fallback ${R} ${DIM}none${R}`);
  }
  inner.push(`  ${DIM}status   ${R} ${WH}${status}${R}`);
  inner.push('');
  inner.push(`  ${CY}❄${R}  ${DIM}type a request, or${R} ${WH}/help${R} ${DIM}for commands${R}`);

  const pw = Math.max(40, ...inner.map(vlen)) + 2;
  const top = `${DIM}┌${'─'.repeat(pw)}┐${R}`;
  const bot = `${DIM}└${'─'.repeat(pw)}┘${R}`;
  const brd = `${DIM}│${R}`;

  return [top, ...inner.map((s) => `${brd}${vpad(s, pw)}${brd}`), bot];
}

export function printBanner({ chain = [], status = 'online' } = {}) {
  const queen = queenArt();
  const panel = infoPanel({ chain, status });

  // vertically center the panel beside the queen
  const offset = Math.max(0, Math.floor((queen.length - panel.length) / 2));
  const n = Math.max(queen.length, panel.length + offset);

  const lines = [];
  for (let i = 0; i < n; i++) {
    const q = queen[i] ?? ' '.repeat(QW);
    const p = i >= offset ? panel[i - offset] ?? '' : '';
    lines.push((q + '   ' + p).trimEnd());
  }

  process.stdout.write('\n' + lines.join('\n') + '\n');
}
