import { exec, execFile } from 'node:child_process';

const COMMAND_TIMEOUT_MS = 10 * 60_000;
const SERVER_BOOT_MS = 12_000;

// Long-running dev servers never exit on their own, so block-running them would
// hang the turn until the full timeout. Detect them, boot briefly to surface
// startup errors, then stop and report success instead of a timeout failure.
const SERVER_COMMAND =
  /\b(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start|serve)|vite|next\s+dev|nuxt\s+dev|astro\s+dev|php\s+artisan\s+serve|nodemon|http-server|serve)\b/i;

export function isServerCommand(command) {
  if (/\bbuild\b/i.test(command)) return false; // "vite build" / "npm run build" exit normally
  return SERVER_COMMAND.test(String(command));
}

export const definition = {
  type: 'function',
  function: {
    name: 'run_command',
    description: 'Run a shell command in the working directory with live progress and timeout. Use when: executing builds, tests, framework CLIs, or literal user commands. Prefer this tool for commands, but prefer dedicated file tools for reading, searching, or editing. Example: npm test.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        command: { type: 'string', description: 'The shell command to run. Example: "npm test".' },
      },
      required: ['command'],
    },
  },
};

function terminateProcessTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => child.kill());
    return;
  }

  child.kill('SIGTERM');
  setTimeout(() => child.kill('SIGKILL'), 1000).unref();
}

export async function execute({ command }, cwd = process.cwd(), { onProgress, timeoutMs } = {}) {
  const server = isServerCommand(command);
  const limit = timeoutMs ?? (server ? SERVER_BOOT_MS : COMMAND_TIMEOUT_MS);
  return new Promise((resolve) => {
    let timedOut = false;
    const child = exec(command, {
      cwd,
      env: { ...process.env, COMPOSER_NO_INTERACTION: '1' },
      maxBuffer: 8 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      clearTimeout(timer);
      const detail = [stdout, stderr].filter(Boolean).join('\n--- stderr ---\n').trim();
      if (!err) return resolve(detail || '(no output)');
      // A server that's still up at its boot deadline started fine — report
      // success rather than a timeout failure, and steer verification to a build.
      if (timedOut && server) {
        return resolve(
          `Dev server booted (stopped after a ${Math.round(limit / 1000)}s boot check; it would otherwise run forever).` +
            `${detail ? `\nStartup output:\n${detail}` : ''}` +
            `\nDo not block on dev servers — verify the app with the build command (e.g. npm run build), and let the user run the server themselves.`
        );
      }
      const reason = timedOut ? `timed out after ${Math.round(limit / 1000)} seconds` : `exit code ${err.code}`;
      resolve(`Command failed (${reason})${detail ? `:\n${detail}` : ''}`);
    });

    // Close the child's stdin so interactive prompts (npm/npx confirmations,
    // artisan questions) see EOF and resolve instead of hanging on a pipe that
    // is never connected to the user — which blocked the turn until timeout.
    child.stdin?.end();

    const timer = setTimeout(() => {
      timedOut = true;
      onProgress?.(server ? 'Dev server boot check complete; stopping it...' : 'Command timed out; terminating process tree...');
      terminateProcessTree(child);
    }, limit);

    const report = (chunk) => onProgress?.(String(chunk));
    child.stdout?.on('data', report);
    child.stderr?.on('data', report);
  });
}
