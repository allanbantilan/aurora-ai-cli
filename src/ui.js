import path from 'node:path';

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
