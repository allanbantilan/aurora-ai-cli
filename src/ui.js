import path from 'node:path';
import readline from 'node:readline';

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

/** Dim one-line status: full cwd · active model (+N fallbacks). */
export function statusLine(cwd, chain) {
  const extra = chain.length > 1 ? ` (+${chain.length - 1} fallback${chain.length > 2 ? 's' : ''})` : '';
  return dim(`${cwd} ${legacyConhost ? '|' : '·'} ${chain[0] ?? 'no model'}${extra}`);
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
        return forceDim(`╭── ${lang ? `${lang} ` : ''}${'─'.repeat(6)}`);
      }
      this.inFence = false;
      return forceDim(`╰${'─'.repeat(9)}`);
    }
    return this.inFence ? forceDim('│ ') + forceYellow(line) : line;
  }
}

/** Pure keypress → state transition for selectMenu (unit-testable). */
export function menuReduce(state, key = {}) {
  const { index, count } = state;
  if (key.name === 'up') return { ...state, index: (index - 1 + count) % count };
  if (key.name === 'down') return { ...state, index: (index + 1) % count };
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
  stdin.on('keypress', onKey);
  return () => {
    stdin.removeListener('keypress', onKey);
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
        resolve(options[state.escaped ? escIndex : state.index].value);
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
