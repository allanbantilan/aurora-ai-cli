import fs from 'node:fs';
import path from 'node:path';

/** Resolve a path and throw if it escapes the working directory. */
export function resolveSafe(relPath, cwd = process.cwd()) {
  const resolved = path.resolve(cwd, relPath);
  const rel = path.relative(cwd, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes working directory: ${relPath}`);
  }
  if (!fs.existsSync(cwd)) return resolved;
  const realRoot = fs.realpathSync.native(cwd);
  let existing = resolved;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  const realExisting = fs.realpathSync.native(existing);
  const realRel = path.relative(realRoot, realExisting);
  if (realRel.startsWith('..') || path.isAbsolute(realRel)) {
    throw new Error(`Path escapes working directory: ${relPath}`);
  }
  return resolved;
}
