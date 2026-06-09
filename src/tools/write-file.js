import fs from 'node:fs';
import path from 'node:path';
import { resolveSafe } from '../paths.js';

const LARAVEL_PATH_RE = /^(?:resources\/views\/.*\.blade\.php|routes\/(?:web|api|console|channels)\.php)$/i;

export const definition = {
  type: 'function',
  function: {
    name: 'write_file',
    description: 'Create or fully overwrite a file. Use when: writing complete new content or intentionally replacing the whole file. Prefer this tool over shell redirection or heredocs. Example: create src/config.js.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string', description: 'File path relative to the working directory. Example: "src/config.js".' },
        content: { type: 'string', description: 'Full file content to write. Example: "export const enabled = true;\\n".' },
      },
      required: ['path', 'content'],
    },
  },
};

function isVerifiedLaravelProject(cwd) {
  if (!fs.existsSync(path.join(cwd, 'artisan'))) return false;
  try {
    const composer = JSON.parse(fs.readFileSync(path.join(cwd, 'composer.json'), 'utf8'));
    return Boolean(composer?.require?.['laravel/framework']);
  } catch {
    return false;
  }
}

export function execute({ path: relPath, content }, cwd = process.cwd()) {
  const file = resolveSafe(relPath, cwd);
  const normalizedPath = relPath.replaceAll('\\', '/');
  if (!fs.existsSync(file) && LARAVEL_PATH_RE.test(normalizedPath) && !isVerifiedLaravelProject(cwd)) {
    throw new Error(
      `Laravel is not confirmed in this project. Install or scaffold Laravel before creating ${normalizedPath}.`
    );
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return `Wrote ${relPath} (${content.length} chars)`;
}
