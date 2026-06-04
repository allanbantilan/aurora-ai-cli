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

export function promptLabel(cwd = process.cwd()) {
  return `${cyan(path.basename(cwd))} > `;
}

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const ASCII_FRAMES = ['-', '\\', '|', '/'];

/** Animated one-line spinner. Falls back to a static line on non-TTY stdout. */
export function createSpinner() {
  if (!colorEnabled) {
    let shown = false;
    return {
      start(text) {
        if (!shown) {
          console.log(text);
          shown = true;
        }
      },
      update(text) {
        console.log(text);
      },
      stop() {
        shown = false;
      },
    };
  }

  // legacy conhost often lacks braille glyphs; Windows Terminal/VS Code set env markers
  const frames =
    process.platform === 'win32' && !process.env.WT_SESSION && !process.env.TERM_PROGRAM
      ? ASCII_FRAMES
      : FRAMES;

  let timer = null;
  let text = '';
  let i = 0;
  const draw = () =>
    process.stdout.write(`\r${ESC}[2K${cyan(frames[i++ % frames.length])} ${dim(text)}`);

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

    // Detach readline's own keypress handling for the duration of the menu.
    rl.pause();
    const previous = process.stdin.listeners('keypress');
    previous.forEach((l) => process.stdin.removeListener('keypress', l));
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();

    const cleanup = () => {
      process.stdin.removeListener('keypress', onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      previous.forEach((l) => process.stdin.on('keypress', l));
      rl.resume();
    };

    const onKey = (str, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        console.log('\n(interrupted — exiting)');
        process.exit(0);
      }
      const next = menuReduce(state, key);
      if (next === state) return;
      state = next;
      if (state.done) {
        cleanup();
        resolve(options[state.escaped ? escIndex : state.index].value);
      } else {
        render(true);
      }
    };

    process.stdin.on('keypress', onKey);
    render(false);
  });
}
