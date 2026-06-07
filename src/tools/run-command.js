import { exec, execFile } from 'node:child_process';

const COMMAND_TIMEOUT_MS = 10 * 60_000;

export const definition = {
  type: 'function',
  function: {
    name: 'run_command',
    description: 'Run a shell command in the working directory. Reports live output progress. 10 minute timeout.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to run' },
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

export async function execute({ command }, cwd = process.cwd(), { onProgress, timeoutMs = COMMAND_TIMEOUT_MS } = {}) {
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
      const reason = timedOut ? `timed out after ${Math.round(timeoutMs / 1000)} seconds` : `exit code ${err.code}`;
      resolve(`Command failed (${reason})${detail ? `:\n${detail}` : ''}`);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      onProgress?.('Command timed out; terminating process tree...');
      terminateProcessTree(child);
    }, timeoutMs);

    const report = (chunk) => onProgress?.(String(chunk));
    child.stdout?.on('data', report);
    child.stderr?.on('data', report);
  });
}
