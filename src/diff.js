/**
 * Pure line-diff utilities (no I/O). diffLines computes an LCS-based line
 * diff; formatDiff renders it as a git-style red/green block.
 */

const CONTEXT = 2; // context lines per side around each change chunk
const MAX_LCS_CELLS = 4_000_000; // beyond this the O(n*m) table is too big

/** Split into lines, normalizing CRLF and dropping the trailing empty line a final \n produces. */
function toLines(text) {
  if (text == null || text === '') return [];
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Standard LCS dynamic program → ordered ops: {type: 'ctx'|'del'|'add', text}. */
function lcsOps(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      ops.push({ type: 'ctx', text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', text: a[i] });
      i += 1;
    } else {
      ops.push({ type: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < m) ops.push({ type: 'del', text: a[i++] });
  while (j < n) ops.push({ type: 'add', text: b[j++] });
  return ops;
}

/** Group changed ops into hunks, each padded with up to CONTEXT ctx lines per side. */
function buildHunks(ops) {
  const changed = ops.map((op, i) => (op.type === 'ctx' ? -1 : i)).filter((i) => i >= 0);
  if (!changed.length) return [];
  const hunks = [];
  let start = changed[0];
  let end = changed[0];
  for (const i of changed.slice(1)) {
    // hunks whose context regions would touch or overlap merge into one
    if (i - end <= CONTEXT * 2) {
      end = i;
      continue;
    }
    hunks.push(ops.slice(Math.max(0, start - CONTEXT), Math.min(ops.length, end + CONTEXT + 1)));
    start = i;
    end = i;
  }
  hunks.push(ops.slice(Math.max(0, start - CONTEXT), Math.min(ops.length, end + CONTEXT + 1)));
  return hunks;
}

/**
 * LCS line diff. Returns { ops, hunks, added, removed }. Each op is
 * {type: 'ctx'|'del'|'add', text, oldNum?, newNum?} (1-based line numbers;
 * 'add' has only newNum, 'del' only oldNum, 'ctx' both). Oversized inputs
 * degrade to a full-file replace instead of an O(n*m) table.
 */
export function diffLines(oldText, newText) {
  const a = toLines(oldText);
  const b = toLines(newText);
  const ops =
    (a.length + 1) * (b.length + 1) > MAX_LCS_CELLS
      ? [...a.map((text) => ({ type: 'del', text })), ...b.map((text) => ({ type: 'add', text }))]
      : lcsOps(a, b);
  let oldNum = 0;
  let newNum = 0;
  for (const op of ops) {
    if (op.type !== 'add') op.oldNum = ++oldNum;
    if (op.type !== 'del') op.newNum = ++newNum;
  }
  return {
    ops,
    hunks: buildHunks(ops),
    added: ops.filter((op) => op.type === 'add').length,
    removed: ops.filter((op) => op.type === 'del').length,
  };
}

const CREATED_PREVIEW_LINES = 15; // created/deleted files preview this many lines
const MAX_RENDERED_LINES = 200; // edited diffs are capped at this many body lines

const ESC = String.fromCharCode(27);
const ANSI_RE = /\x1b\[[0-9;]*m|\x1b/g; // SGR sequences, then any stray ESC

/** File content can legally contain ANSI codes (logs, build output); strip them so they can't pierce the row styling. */
const sanitize = (text) => text.replace(ANSI_RE, '');

const wrapAnsi = (open, close) => (s) => `${ESC}[${open}m${s}${ESC}[${close}m`;
const identity = (s) => s;

function styles(colors) {
  if (!colors) {
    return { redBg: identity, greenBg: identity, redFg: identity, greenFg: identity, dim: identity, white: identity };
  }
  return {
    // muted truecolor row tints (Codex-style) — the bright 41/42 palette is unreadable
    redBg: wrapAnsi('48;2;63;29;29', 49),
    greenBg: wrapAnsi('48;2;27;58;36', 49),
    redFg: wrapAnsi('38;2;248;81;73', 39),
    greenFg: wrapAnsi('38;2;86;211;100', 39),
    dim: wrapAnsi(2, 22),
    white: wrapAnsi(37, 39),
  };
}

const SEPARATOR = '· · · · ·'; // dimmed gap marker between change chunks

/** One rendered diff row: padded line number, marker, text — the whole row is tinted per op type. */
function renderOp(op, width, st) {
  const num = String(op.type === 'add' ? op.newNum : op.oldNum).padStart(width);
  const text = sanitize(op.text);
  if (op.type === 'add') return st.greenBg(`${st.greenFg(`${num} +`)} ${text}`);
  if (op.type === 'del') return st.redBg(`${st.redFg(`${num} -`)} ${text}`);
  return st.dim(`${num}   ${text}`);
}

/** Line numbers sit in a fixed 4-char right-aligned column (wider only past line 9999). */
function numberWidth(ops) {
  let max = 1;
  for (const op of ops) max = Math.max(max, op.oldNum ?? 0, op.newNum ?? 0);
  return Math.max(4, String(max).length);
}

/**
 * Git-style diff block: "Edited path (+N -M)" header (white filename, green
 * +N, red -N), tinted change rows with dim 2-line context, "· · · · ·"
 * between chunks. Created/deleted files preview the first
 * CREATED_PREVIEW_LINES lines; edited diffs are capped at MAX_RENDERED_LINES.
 */
export function formatDiff(filePath, oldText, newText, { colors = true } = {}) {
  const st = styles(colors);
  const oldEmpty = oldText == null || oldText === '';
  const newEmpty = newText == null || newText === '';
  const { ops, hunks, added, removed } = diffLines(oldText ?? '', newText ?? '');
  const verb = oldEmpty && !newEmpty ? 'Created' : !oldEmpty && newEmpty ? 'Deleted' : 'Edited';
  const header = `${verb} ${st.white(filePath)} (${st.greenFg(`+${added}`)} ${st.redFg(`-${removed}`)})`;
  if (!hunks.length) return header;

  const width = numberWidth(ops);
  const rows = [];
  if (verb === 'Created' || verb === 'Deleted') {
    for (const op of ops.slice(0, CREATED_PREVIEW_LINES)) rows.push(renderOp(op, width, st));
    if (ops.length > CREATED_PREVIEW_LINES) rows.push('', st.dim(SEPARATOR));
  } else {
    let rendered = 0;
    let truncated = 0;
    hunks.forEach((hunk, h) => {
      for (const op of hunk) {
        if (rendered >= MAX_RENDERED_LINES) {
          truncated += 1;
          continue;
        }
        rows.push(renderOp(op, width, st));
        rendered += 1;
      }
      if (h < hunks.length - 1 && rendered < MAX_RENDERED_LINES) rows.push('', st.dim(SEPARATOR), '');
    });
    if (truncated) rows.push(st.dim(`… ${truncated} more lines`));
  }
  return [header, '', ...rows].join('\n');
}
