import path from 'node:path';

/** Resolve a path and throw if it escapes the working directory. */
export function resolveSafe(relPath, cwd = process.cwd()) {
  const resolved = path.resolve(cwd, relPath);
  const rel = path.relative(cwd, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes working directory: ${relPath}`);
  }
  return resolved;
}
