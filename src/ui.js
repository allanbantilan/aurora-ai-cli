import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import readline from 'node:readline';
import { previewTool } from './tools/index.js';
import { formatDiff } from './diff.js';

export const colorEnabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
export const interactiveEnabled = Boolean(process.stdin.isTTY && process.stdout.isTTY);

const ESC = String.fromCharCode(27); // the ANSI escape control character

/** Always-on ANSI styling (used internally where the caller controls enablement). */
const esc = (open, close) => (s) => `${ESC}[${open}m${s}${ESC}[${close}m`;
/** Global styling that turns itself off when stdout is not a color terminal. */
const wrap = (open, close) => (colorEnabled ? esc(open, close) : (s) => s);

export const cyan = wrap(36, 39);
export const yellow = wrap(33, 39);
export const magenta = wrap(35, 39);
export const red = wrap(31, 39);
export const dim = wrap(2, 22);

// exported for CodeHighlighter and selectMenu, which manage their own enablement
export const forceDim = esc(2, 22);
export const forceYellow = esc(33, 39);
export const forceCyan = esc(36, 39);
export const forceGreen = esc(32, 39);

export function promptLabel(cwd = process.cwd()) {
  return `${cyan(path.basename(cwd))} > `;
}

// legacy conhost often lacks Unicode glyphs; Windows Terminal/VS Code set env markers
export const legacyConhost =
  process.platform === 'win32' && !process.env.WT_SESSION && !process.env.TERM_PROGRAM;

/**
 * Pure ctx-meter formatter. pct is a 0–100 number (may exceed bounds; clamped)
 * or null/undefined/NaN when no usage data exists yet.
 * Returns { text, level } where level is 'dim' | 'yellow' | 'red'.
 */
export function formatCtx(pct) {
  if (typeof pct !== 'number' || !Number.isFinite(pct)) return { text: 'ctx: --', level: 'dim' };
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  return {
    text: `ctx: ${clamped}% used`,
    level: clamped >= 90 ? 'red' : clamped >= 70 ? 'yellow' : 'dim',
  };
}

/** user@host, tolerating the rare envs where userInfo() throws (no passwd entry). */
function userHost() {
  try {
    return `${os.userInfo().username}@${os.hostname()}`;
  } catch {
    return os.hostname();
  }
}

/** Dim one-line status: user@host:cwd · model (+N fallbacks) · ctx meter. */
export function statusLine(cwd, chain, ctx = {}) {
  const sep = legacyConhost ? ' | ' : ' · ';
  const extra = chain.length > 1 ? ` (+${chain.length - 1} fallback${chain.length > 2 ? 's' : ''})` : '';
  const model = chain[0] ? shortModelName(chain[0]) : 'no model';
  const { text, level } = formatCtx(ctx.pct);
  const meter = level === 'red' ? red(text) : level === 'yellow' ? yellow(text) : text;
  return dim(`${userHost()}:${cwd}${sep}${model}${extra}${sep}${meter}`);
}

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const ASCII_FRAMES = ['-', '\\', '|', '/'];

/** Text may be a string or a function re-evaluated on every render (for time-driven content). */
const renderText = (t) => (typeof t === 'function' ? t() : t);

/** Animated one-line spinner. Falls back to a static line on non-TTY stdout. */
export function createSpinner() {
  if (!colorEnabled) {
    let shown = false;
    return {
      start(text) {
        if (!shown) {
          console.log(renderText(text));
          shown = true;
        }
      },
      update(text) {
        console.log(renderText(text));
      },
      stop() {
        shown = false;
      },
    };
  }

  const frames = legacyConhost ? ASCII_FRAMES : FRAMES;

  let timer = null;
  let text = '';
  let i = 0;
  const draw = () =>
    process.stdout.write(`\r${ESC}[2K${cyan(frames[i++ % frames.length])} ${dim(renderText(text))}`);

  return {
    start(t) {
      text = t;
      if (!timer) {
        timer = setInterval(draw, 80);
        timer.unref(); // never hold the process open
      }
      draw();
    },
    update(t) {
      text = t;
      draw();
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
        process.stdout.write(`\r${ESC}[2K`);
      }
    },
  };
}

/**
 * Streams text and styles ``` fenced code blocks distinctly from prose.
 * Buffers the current incomplete line so fences split across stream chunks
 * are detected; emits only complete lines (flush() returns the tail).
 */
export class CodeHighlighter {
  constructor({ enabled = colorEnabled } = {}) {
    this.enabled = enabled;
    this.buffer = '';
    this.inFence = false;
    this.prevBlank = true; // tracks whether the last emitted line was blank
  }

  highlight(chunk) {
    if (!this.enabled) return chunk;
    this.buffer += chunk;
    let out = '';
    let nl;
    while ((nl = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      out += this.#renderLine(line) + '\n';
    }
    return out;
  }

  /** Return any buffered tail (call once at end of stream). */
  flush() {
    if (!this.enabled) return '';
    const rest = this.buffer;
    this.buffer = '';
    return rest ? this.#renderLine(rest) : '';
  }

  #renderLine(line) {
    if (line.trimStart().startsWith('```')) {
      if (!this.inFence) {
        this.inFence = true;
        const lang = line.trim().slice(3).trim();
        // pad with a blank line so code blocks don't butt up against prose
        const pad = this.prevBlank ? '' : '\n';
        this.prevBlank = false;
        return pad + forceDim(`╭── ${lang ? `${lang} ` : ''}${'─'.repeat(6)}`);
      }
      this.inFence = false;
      this.prevBlank = true; // the appended newline leaves a blank line after the block
      return forceDim(`╰${'─'.repeat(9)}`) + '\n';
    }
    if (!this.inFence) this.prevBlank = line.trim() === '';
    return this.inFence ? forceDim('│ ') + forceYellow(line) : line;
  }
}

const PREVIEW_MAX_CHARS = 8_000;
const clipPreview = (t) =>
  t.length > PREVIEW_MAX_CHARS ? `${t.slice(0, PREVIEW_MAX_CHARS)}\n...[truncated]` : t;

/** Best-effort 1-based line number where `snippet` starts inside the file at `filePath`. */
function startLineOf(filePath, snippet) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const i = text.indexOf(snippet);
    return i < 0 ? 1 : text.slice(0, i).split('\n').length;
  } catch {
    return 1;
  }
}

/** File content or null when unreadable — previews degrade gracefully. */
function readFileOrNull(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Styled permission preview: file changes render as bordered, line-numbered
 * code blocks so they stand apart from prose. Falls back to the plain
 * previewTool text when colors are off (non-TTY / NO_COLOR).
 */
export function formatToolPreview(name, args, { colors = colorEnabled } = {}) {
  if (!colors) return previewTool(name, args);

  const block = (label, body, startLine = 1) => {
    const lines = clipPreview(String(body ?? '')).split('\n');
    const width = String(startLine + lines.length - 1).length;
    return [
      forceDim(`╭── ${label} ${'─'.repeat(6)}`),
      ...lines.map((l, i) => forceDim(`│ ${String(startLine + i).padStart(width)} `) + forceYellow(l)),
      forceDim(`╰${'─'.repeat(9)}`),
    ].join('\n');
  };

  switch (name) {
    case 'write_file': {
      const before = readFileOrNull(args.path) ?? '';
      return `${forceCyan('[write_file]')} ${args.path}\n${formatDiff(args.path, before, String(args.content ?? ''), { colors: true })}`;
    }
    case 'edit_file': {
      const before = readFileOrNull(args.path);
      const oldString = args.old_string ?? '';
      if (before !== null && oldString && before.split(oldString).length - 1 === 1) {
        const after = before.replace(oldString, () => args.new_string ?? '');
        return `${forceCyan('[edit_file]')} ${args.path}\n${formatDiff(args.path, before, after, { colors: true })}`;
      }
      // fallback: file unreadable or old_string not unique — keep the legacy blocks
      const line = startLineOf(args.path, oldString);
      return (
        `${forceCyan('[edit_file]')} ${args.path}\n` +
        `${block('remove', args.old_string, line)}\n${block('insert', args.new_string, line)}`
      );
    }
    case 'run_command':
      return `${forceCyan('[run_command]')} ${forceYellow(String(args.command ?? ''))}`;
    default:
      return previewTool(name, args);
  }
}

/** Pure keypress → state transition for selectMenu (unit-testable). */
export function menuReduce(state, key = {}) {
  const { index, count } = state;
  if (key.name === 'up' || (key.name === 'tab' && key.shift)) return { ...state, index: (index - 1 + count) % count };
  if (key.name === 'down' || key.name === 'tab') return { ...state, index: (index + 1) % count };
  if (key.name === 'return') return { ...state, done: true };
  if (key.name === 'escape') return { ...state, done: true, escaped: true };
  if (/^[1-9]$/.test(key.sequence ?? '') && Number(key.sequence) <= count) {
    return { ...state, index: Number(key.sequence) - 1, done: true };
  }
  return state;
}

/**
 * Take over the readline interface's input stream in raw keypress mode.
 * Detaches readline's keypress listeners (terminal-mode readline consumes
 * input via 'keypress'; the stream's 'data' listener is the shared
 * emitKeypressEvents bridge and must stay attached).
 * Returns a release() that restores everything.
 */
function withRawKeys(rl, onKey) {
  const stdin = rl.input ?? process.stdin;
  rl.pause();
  const prevKeypress = stdin.listeners('keypress');
  prevKeypress.forEach((l) => stdin.removeListener('keypress', l));
  readline.emitKeypressEvents(stdin);
  const wasRaw = stdin.isRaw === true;
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();
  process.stdout.write(`${ESC}[?25l`); // hide the cursor — it parks confusingly below the menu
  // AURORA_DEBUG_KEYS=1 logs every keypress as the menu receives it (diagnostics)
  const handler = process.env.AURORA_DEBUG_KEYS
    ? (str, key) => {
        process.stdout.write(`[key] name=${String(key?.name)} seq=${JSON.stringify(key?.sequence)}\n`);
        onKey(str, key);
      }
    : onKey;
  stdin.on('keypress', handler);
  return () => {
    stdin.removeListener('keypress', handler);
    process.stdout.write(`${ESC}[?25h`);
    // restore the PREVIOUS raw-mode state — terminal-mode readline keeps the
    // tty raw; dropping to cooked here makes the console re-echo every later
    // input line (doubled input on Windows)
    if (stdin.isTTY) stdin.setRawMode(wasRaw);
    prevKeypress.forEach((l) => stdin.on('keypress', l));
    rl.resume();
  };
}

/**
 * Arrow-key selection menu. options: [{label, value, isEscape?}].
 * Esc resolves to the option flagged isEscape (or the first option).
 * Temporarily detaches the shared readline interface's keypress listeners so
 * arrows/enter don't trigger history navigation or line events.
 */
export function selectMenu(rl, title, options) {
  return new Promise((resolve) => {
    const escIndex = Math.max(options.findIndex((o) => o.isEscape), 0);
    let state = { index: 0, count: options.length, done: false, escaped: false };

    const render = (redraw) => {
      if (redraw) process.stdout.write(`${ESC}[${options.length + 1}A`);
      process.stdout.write(`${ESC}[0J${title}\n`);
      options.forEach((o, i) => {
        const row = `${i === state.index ? '❯' : ' '} ${i + 1}. ${o.label}`;
        console.log(i === state.index ? forceCyan(row) : row);
      });
    };

    const release = withRawKeys(rl, (str, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        release();
        console.log('\n(interrupted — exiting)');
        process.exit(0);
      }
      const next = menuReduce(state, key);
      if (next === state) return;
      state = next;
      if (state.done) {
        release();
        // erase the menu block — the caller prints a one-line record instead
        process.stdout.write(`${ESC}[${options.length + 1}A${ESC}[0J`);
        resolve(options[state.escaped ? escIndex : state.index].value);
      } else {
        render(true);
      }
    });
    render(false);
  });
}

/** Commands matching the typed filter (prefix match on the command name). */
export function slashMatches(all, filter) {
  return all.filter(([cmd]) => cmd.startsWith(filter));
}

/**
 * Pure keypress → state transition for the searchable slash-command menu.
 * state: { all: [[cmd, desc]], filter: '/...', index, done, cancelled, picked }.
 * Printable keys extend the filter (live search); backspace shrinks it —
 * backspacing past "/" cancels back to the normal prompt.
 */
export function slashMenuReduce(state, key = {}, str = '') {
  const visible = slashMatches(state.all, state.filter);
  const count = visible.length;
  const cur = Math.min(state.index, Math.max(0, count - 1));
  if (key.name === 'escape') return { ...state, done: true, cancelled: true };
  if (key.name === 'return') {
    if (!count) return { ...state, done: true, cancelled: true };
    return { ...state, done: true, picked: visible[cur][0] };
  }
  if (key.name === 'up' || (key.name === 'tab' && key.shift)) {
    return count ? { ...state, index: (cur - 1 + count) % count } : state;
  }
  if (key.name === 'down' || key.name === 'tab') {
    return count ? { ...state, index: (cur + 1) % count } : state;
  }
  if (key.name === 'backspace') {
    if (state.filter.length <= 1) return { ...state, done: true, cancelled: true };
    return { ...state, filter: state.filter.slice(0, -1), index: 0 };
  }
  if (str && str.length === 1 && str >= ' ' && str !== '\x7f' && !key.ctrl && !key.meta) {
    return { ...state, filter: state.filter + str, index: 0 };
  }
  return state;
}

/**
 * Live searchable slash-command menu (Claude-Code style): shows all commands,
 * narrows as the user types, ↑↓/Tab to move, Enter selects, Esc/backspace-past-/
 * cancels. commands: [[cmd, desc]]. Resolves the picked command or null.
 */
export function slashMenu(rl, commands) {
  return new Promise((resolve) => {
    let state = { all: commands, filter: '/', index: 0, done: false, cancelled: false, picked: null };
    let lastLines = 0;
    const commandWidth = Math.max(...commands.map(([cmd]) => cmd.length)) + 1;

    const render = (redraw) => {
      if (redraw) process.stdout.write(`${ESC}[${lastLines}A`);
      const visible = slashMatches(state.all, state.filter);
      const cur = Math.min(state.index, Math.max(0, visible.length - 1));
      let out = `${ESC}[0J${forceCyan('❯')} ${state.filter}\n`;
      let lines = 1;
      visible.forEach(([cmd, desc], i) => {
        const row = `${i === cur ? '❯' : ' '} ${cmd.padEnd(commandWidth)} ${forceDim(desc)}`;
        out += `${i === cur ? forceCyan(row) : row}\n`;
        lines += 1;
      });
      if (!visible.length) {
        out += `${forceDim('  no matching command')}\n`;
        lines += 1;
      }
      out += `${forceDim('↑↓/tab move · enter select · esc cancel')}\n`;
      lines += 1;
      lastLines = lines;
      process.stdout.write(out);
    };

    const release = withRawKeys(rl, (str, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        release();
        console.log('\n(interrupted — exiting)');
        process.exit(0);
      }
      const next = slashMenuReduce(state, key, str);
      if (next === state) return;
      state = next;
      if (state.done) {
        release();
        process.stdout.write(`${ESC}[${lastLines}A${ESC}[0J`);
        resolve(state.cancelled ? null : state.picked);
      } else {
        render(true);
      }
    });
    render(false);
  });
}

/** Pure keypress → state transition for multiSelectMenu. checked is an ORDERED array of indices. */
export function multiMenuReduce(state, key = {}) {
  const { index, count, checked } = state;
  if (key.name === 'up') return { ...state, index: (index - 1 + count) % count };
  if (key.name === 'down') return { ...state, index: (index + 1) % count };
  if (key.name === 'space') return { ...state, checked: toggleChecked(checked, index) };
  if (/^[1-9]$/.test(key.sequence ?? '') && Number(key.sequence) <= count) {
    return { ...state, checked: toggleChecked(checked, Number(key.sequence) - 1) };
  }
  if (key.name === 'return') return checked.length ? { ...state, done: true } : state;
  if (key.name === 'escape') return { ...state, done: true, cancelled: true };
  return state;
}

function toggleChecked(checked, i) {
  return checked.includes(i) ? checked.filter((c) => c !== i) : [...checked, i];
}

/** Short display name for a model id: drop author prefix and :free suffix. */
export function shortModelName(id) {
  return String(id).split('/').pop().replace(':free', '');
}

/** Advisory UI grouping only — affects picker layout, never behavior. */
export function modelCategory(id) {
  return /coder|codestral|deepseek|devstral|code/i.test(id) ? 'Coding' : 'General';
}

/** Render a {uptime, ok}|null health record as a colored status label. */
export function formatModelStatus(health) {
  if (!health) return dim('○ no data');
  if (!health.ok) return red('● down');
  if (typeof health.uptime !== 'number') return dim('○ no data');
  const pct = `${Math.round(health.uptime)}% up`;
  if (health.uptime >= 90) return `${forceGreen('●')} ${pct}`;
  if (health.uptime >= 50) return `${yellow('●')} ${pct}`;
  return `${red('●')} ${pct}`;
}

/**
 * Checkbox menu: Space/digits toggle, Enter confirms (>=1 required), Esc cancels.
 * options: [{label, value, statusText?, section?}]; preChecked: ordered indices.
 * Resolves the checked VALUES in check order, or null when cancelled.
 */
export function multiSelectMenu(rl, title, options, preChecked = []) {
  return new Promise((resolve) => {
    let state = {
      index: 0,
      count: options.length,
      checked: preChecked.filter((i) => i >= 0 && i < options.length),
      done: false,
      cancelled: false,
    };
    let lastLines = 0;

    const render = (redraw) => {
      if (redraw) process.stdout.write(`${ESC}[${lastLines}A`);
      let out = `${ESC}[0J${title}\n`;
      let lines = 1;
      let section;
      options.forEach((o, i) => {
        if (o.section && o.section !== section) {
          section = o.section;
          out += `${forceDim(`─ ${section} ─`)}\n`;
          lines += 1;
        }
        const box = state.checked.includes(i) ? '◉' : '○';
        const row = `${i === state.index ? '❯' : ' '} ${box} ${i + 1}. ${o.label}  ${o.statusText ?? ''}`;
        out += `${i === state.index ? forceCyan(row) : row}\n`;
        lines += 1;
      });
      const order = state.checked.map((i) => shortModelName(options[i].value)).join(' → ');
      out += `${forceDim(`${state.checked.length} selected${order ? ` — fallback order: ${order}` : ''}`)}\n`;
      out += `${forceDim('↑↓ move · space select · enter save · esc cancel')}\n`;
      lines += 2;
      lastLines = lines;
      process.stdout.write(out);
    };

    const erase = () => process.stdout.write(`${ESC}[${lastLines}A${ESC}[0J`);

    const release = withRawKeys(rl, (str, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        release();
        console.log('\n(interrupted — exiting)');
        process.exit(0);
      }
      const next = multiMenuReduce(state, key);
      if (next === state) return;
      state = next;
      if (state.done) {
        release();
        erase();
        resolve(state.cancelled ? null : state.checked.map((i) => options[i].value));
      } else {
        render(true);
      }
    });
    render(false);
  });
}

const PLAN_ICONS = { context: '📁', plan: '📋', files: '📄', risks: '⚠ ' };
const PLAN_ICONS_ASCII = { context: '[ctx]', plan: '[plan]', files: '[files]', risks: '[!] ' };

/**
 * Rich plan renderer: boxed AURORA PLAN title, icon sections with tree lines.
 * Pure string builder — takes the parsed-plan object from parsePlanResponse.
 * Questions are never rendered here — the REPL asks them interactively.
 * update=true renders the refreshed-plan view ("↻ Plan updated" + Plan/Files
 * only) instead of repeating the full box. ascii swaps emoji/box-drawing for
 * conhost-safe characters; colors=false yields plain text (NO_COLOR / non-TTY).
 */
export function renderPlan(
  plan,
  { colors = colorEnabled, ascii = legacyConhost, columns = process.stdout.columns || 80, update = false } = {}
) {
  const c = colors
    ? { cyan: forceCyan, dim: forceDim, green: forceGreen, yellow: forceYellow, red: (s) => `${ESC}[31m${s}${ESC}[39m` }
    : { cyan: (s) => s, dim: (s) => s, green: (s) => s, yellow: (s) => s, red: (s) => s };
  const icons = ascii ? PLAN_ICONS_ASCII : PLAN_ICONS;
  const [h, v, tl, tr, bl, br] = ascii ? ['-', '|', '+', '+', '+', '+'] : ['─', '│', '╭', '╮', '╰', '╯'];
  const [tee, ell] = ascii ? ['|-', '`-'] : ['├─', '└─'];
  const bullet = ascii ? '*' : '·';
  const ANSI_RE = /\x1b\[[0-9;]*m/g;
  // measure VISIBLE width; overlong lines are clipped as plain text so no escape code is ever cut open
  const clip = (s) => {
    if (s.replace(ANSI_RE, '').length <= columns) return s;
    return `${s.replace(ANSI_RE, '').slice(0, columns - 1)}…`;
  };
  const out = [];

  if (update) {
    // refreshed plan after answered questions: no header box, no repeated sections
    out.push(`${ascii ? '~' : '↻'} Plan updated ${c.dim(h)} ${plan.plan?.length ?? 0} steps`);
  } else {
    // title box
    const label = ' AURORA PLAN ';
    const inner = Math.max(label.length + 1, Math.min(columns - 2, Math.max((plan.title?.length ?? 0) + 4, 44)));
    out.push(c.dim(`${tl}${h}${label}${h.repeat(Math.max(0, inner - label.length - 1))}${tr}`));
    if (plan.title) out.push(clip(`${c.dim(v)}  ${plan.title}`));
    out.push(c.dim(`${bl}${h.repeat(Math.max(0, inner))}${br}`));
  }

  const section = (icon, name, lines) => {
    if (!lines.length) return;
    out.push('', `${icon} ${name}`);
    out.push(...lines.map(clip));
  };

  if (!update) {
    section(
      icons.context,
      'Context',
      (plan.context ?? []).map((line, i, all) => `   ${c.dim(i === all.length - 1 ? ell : tee)} ${line}`)
    );
  }
  section(icons.plan, 'Plan', (plan.plan ?? []).map((step, i) => `   ${i + 1}. ${step}`));
  const changeColor = { '+': c.green, '~': c.yellow, '-': c.red };
  const pathWidth = Math.max(0, ...(plan.files ?? []).map((f) => f.path.length));
  section(
    icons.files,
    'Files',
    (plan.files ?? []).map(
      (f) => `   ${(changeColor[f.change] ?? c.dim)(f.change)}  ${c.cyan(f.path.padEnd(pathWidth))}  ${f.note ?? ''}`
    )
  );
  if (!update) section(icons.risks, 'Risks', (plan.risks ?? []).map((r) => `   ${c.dim(bullet)} ${r}`));

  out.push('', c.dim(h.repeat(Math.min(columns, 52))));
  return out.join('\n');
}

/**
 * End-of-turn summary box: "╭─ AURORA DONE ─╮" with created/edited/error
 * counts, the touched files, and a next-step prompt line. files entries are
 * {path, change: '+'|'~'}; the same path reported twice keeps '+' if it was
 * ever created this turn. Pure string builder.
 */
export function renderDoneSummary(
  files,
  { errors = 0, colors = colorEnabled, ascii = legacyConhost, columns = process.stdout.columns || 80 } = {}
) {
  const c = colors
    ? { cyan: forceCyan, dim: forceDim, green: forceGreen, yellow: forceYellow }
    : { cyan: (s) => s, dim: (s) => s, green: (s) => s, yellow: (s) => s };
  const [h, v, tl, tr, bl, br] = ascii ? ['-', '|', '+', '+', '+', '+'] : ['─', '│', '╭', '╮', '╰', '╯'];

  const byPath = new Map();
  for (const f of files ?? []) {
    const prev = byPath.get(f.path);
    byPath.set(f.path, prev === '+' ? '+' : f.change);
  }
  const list = [...byPath.entries()];
  const created = list.filter(([, ch]) => ch === '+').length;
  const edited = list.length - created;
  const parts = [];
  if (created) parts.push(`${created} file${created === 1 ? '' : 's'} created`);
  if (edited) parts.push(`${edited} file${edited === 1 ? '' : 's'} edited`);
  parts.push(`${errors} error${errors === 1 ? '' : 's'}`);
  const summary = parts.join(' · ');

  const label = ' AURORA DONE ';
  const inner = Math.max(label.length + 1, Math.min(columns - 2, Math.max(summary.length + 4, 44)));
  const out = [
    c.dim(`${tl}${h}${label}${h.repeat(Math.max(0, inner - label.length - 1))}${tr}`),
    `${c.dim(v)}  ${summary}`,
    c.dim(`${bl}${h.repeat(Math.max(0, inner))}${br}`),
  ];
  for (const [p, ch] of list) out.push(`   ${(ch === '+' ? c.green : c.yellow)(ch)}  ${c.cyan(p)}`);
  out.push('', `${c.cyan('❯')} What should Aurora do next?`);
  return out.join('\n');
}
