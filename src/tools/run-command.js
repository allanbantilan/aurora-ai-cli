import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export const definition = {
  type: 'function',
  function: {
    name: 'run_command',
    description: 'Run a shell command in the working directory. 60 second timeout.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to run' },
      },
      required: ['command'],
    },
  },
};

export async function execute({ command }, cwd = process.cwd()) {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    });
    const out = [stdout, stderr].filter(Boolean).join('\n--- stderr ---\n').trim();
    return out || '(no output)';
  } catch (err) {
    const detail = [err.stdout, err.stderr].filter(Boolean).join('\n').trim();
    const reason = err.killed ? 'timed out' : `exit code ${err.code}`;
    return `Command failed (${reason})${detail ? `:\n${detail}` : ''}`;
  }
}
