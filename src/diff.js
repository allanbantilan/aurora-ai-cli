/**
 * Pure line-diff utilities (no I/O). diffLines computes an LCS-based line
 * diff; formatDiff (Task 2) renders it as a git-style red/green block.
 */

const CONTEXT = 3; // context lines per side, like `git diff -U3`
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
