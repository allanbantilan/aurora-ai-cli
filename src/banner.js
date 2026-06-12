import { colorEnabled, shortModelName, formatModelStatus, providerDisplayName } from './ui.js';

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
const BCY = c('1;96');   // bold bright cyan
const BWH = c('1;97');   // bold bright white

const QW = 40; // crown art visual width

function crownArt() {
  return [
    `${CY}      ❄${WH}       *       ${CY}❄${WH}       *      ${CY}❄${R}`,
    '',
    `${BWH}        *                       *${R}`,
    `${BWH}        |\\          ${CY}✦${BWH}          /|${R}`,
    `${BWH}        | \\         |         / |${R}`,
    `${BWH}        |  \\   /\\   |   /\\   /  |${R}`,
    `${BWH}        |   \\ /  \\  |  /  \\ /   |${R}`,
    `${BWH}        |    V    \\ | /    V    |${R}`,
    `${BWH}        |  ${CY}◆${BWH}       \\|/       ${CY}◆${BWH}  |${R}`,
    `${BWH}        |___________${CY}◆${BWH}___________|${R}`,
    `${WH}        |${DIM}░▒▓█████████████████▓▒░${R}${WH}|${R}`,
    `${WH}        |_______________________|${R}`,
    '',
    `${CY}     ❄      ${DIM}~ a u r o r a ~${R}      ${CY}❄${R}`,
  ].map((line) => vpad(line, QW));
}

const PROVIDER_DISPLAY = {
  openrouter: { name: 'OpenRouter', free: true },
  google: { name: 'Google', free: true },
  groq: { name: 'Groq', free: true },
  mistral: { name: 'Mistral', free: true },
  anthropic: { name: 'Claude', free: false },
  openai: { name: 'OpenAI', free: false },
};

function infoPanel({ chain, status, health, models = [], apiKeys = {} }) {
  const nameW = Math.max(12, ...chain.map((id) => shortModelName(id).length));
  const row = (label, id, provider) => {
    const providerLabel = provider ? ` (${providerDisplayName(provider)})` : '';
    return `  ${DIM}${label.padEnd(9)}${R} ${WH}${shortModelName(id).padEnd(nameW)}${R}${DIM}${providerLabel}${R}  ${formatModelStatus(health.get(id))}`;
  };

  const inner = [];
  inner.push(`  ${BCY}✦  A U R O R A${R}`);
  inner.push('');
  if (chain.length) {
    const modelProviders = new Map(models.map((m) => [m.id, m.provider]));
    inner.push(row('model', chain[0], modelProviders.get(chain[0])));
    chain.slice(1).forEach((id, i) => inner.push(row(i === 0 ? 'fallback' : '', id, modelProviders.get(id))));
    if (chain.length === 1) inner.push(`  ${DIM}fallback  none${R}`);
  } else {
    inner.push(`  ${DIM}model     —${R}`);
  }
  // Show configured providers
  const configured = Object.entries(apiKeys).filter(([, key]) => key).map(([id]) => id);
  if (configured.length) {
    const providerLabels = configured.map((id) => {
      const info = PROVIDER_DISPLAY[id];
      if (!info) return id;
      const tier = info.free ? `${CY}` : `${WH}`;
      return `${tier}${info.name}${R}`;
    });
    inner.push(`  ${DIM}providers ${R} ${providerLabels.join(' · ')}`);
  }
  inner.push(`  ${DIM}status   ${R} ${WH}${status}${R}`);
  inner.push('');
  inner.push(`  ${CY}❄${R}  ${DIM}type a request, or${R} ${WH}/help${R} ${DIM}for commands${R}`);
  inner.push(`     ${WH}/permission${R}  ${DIM}change mode${R}`);
  inner.push(`     ${WH}/plan${R}        ${DIM}plan feature${R}`);
  inner.push(`     ${WH}/provider${R}   ${DIM}manage providers${R}`);

  const pw = Math.max(40, ...inner.map(vlen)) + 2;
  const top = `${DIM}┌${'─'.repeat(pw)}┐${R}`;
  const bot = `${DIM}└${'─'.repeat(pw)}┘${R}`;
  const brd = `${DIM}│${R}`;

  return [top, ...inner.map((s) => `${brd}${vpad(s, pw)}${brd}`), bot];
}

export function printBanner({ chain = [], status = 'online', health = new Map(), models = [], apiKeys = {} } = {}) {
  const crown = crownArt();
  const panel = infoPanel({ chain, status, health, models, apiKeys });

  // vertically center the panel beside the crown
  const offset = Math.max(0, Math.floor((crown.length - panel.length) / 2));
  const n = Math.max(crown.length, panel.length + offset);

  const lines = [];
  for (let i = 0; i < n; i++) {
    const q = crown[i] ?? ' '.repeat(QW);
    const p = i >= offset ? panel[i - offset] ?? '' : '';
    lines.push((q + '   ' + p).trimEnd());
  }

  process.stdout.write('\n' + lines.join('\n') + '\n');
}
