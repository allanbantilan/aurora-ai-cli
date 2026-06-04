import fs from 'node:fs';
import path from 'node:path';
import picomatch from 'picomatch';

const IGNORED = new Set(['node_modules', '.git']);

/** Return posix-style relative paths of files under root matching the glob. */
export function collectFiles(root, pattern = '**/*') {
  const isMatch = picomatch(pattern);
  const results = [];
  walk(root, '', results, isMatch);
  return results;
}

function walk(root, rel, results, isMatch) {
  const entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED.has(entry.name)) continue;
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(root, relPath, results, isMatch);
    else if (isMatch(relPath)) results.push(relPath);
  }
}
