import { exec } from 'node:child_process';

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

export async function execute({ command }, cwd = process.cwd(), { onProgress } = {}) {
  return new Promise((resolve) => {
    const child = exec(command, {
      cwd,
      env: { ...process.env, COMPOSER_NO_INTERACTION: '1' },
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: 8 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      const detail = [stdout, stderr].filter(Boolean).join('\n--- stderr ---\n').trim();
      if (!err) return resolve(detail || '(no output)');
      const reason = err.killed ? 'timed out after 10 minutes' : `exit code ${err.code}`;
      resolve(`Command failed (${reason})${detail ? `:\n${detail}` : ''}`);
    });

    const report = (chunk) => onProgress?.(String(chunk));
    child.stdout?.on('data', report);
    child.stderr?.on('data', report);
  });
}
