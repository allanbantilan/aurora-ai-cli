const COMMANDS = new Set(['chat', 'help', 'models', 'providers', 'doctor', 'run']);
const NO_ARG_COMMANDS = new Set(['chat', 'models', 'providers', 'doctor']);

export function parseCliArgs(argv = []) {
  const args = [...argv];
  const flags = {};

  if (!args.length) return { command: 'chat', flags, task: '' };
  if (args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
    return { command: 'help', flags, task: '' };
  }

  let command = 'chat';
  if (COMMANDS.has(args[0])) {
    command = args.shift();
  } else if (args[0].startsWith('-')) {
    command = 'run';
  } else {
    return { command: 'error', flags: {}, task: '', error: `Unknown command: ${args[0]}` };
  }

  if (command === 'help') return { command, flags, task: '' };
  if (NO_ARG_COMMANDS.has(command) && args.length) {
    return { command: 'error', flags: {}, task: '', error: `Unexpected argument for ${command}: ${args[0]}` };
  }

  const taskParts = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--yes' || arg === '-y') {
      flags.yes = true;
      continue;
    }
    if (arg === '--model') {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) {
        return { command: 'error', flags: {}, task: '', error: '--model requires a value' };
      }
      flags.model = value;
      i += 1;
      continue;
    }
    if (arg.startsWith('-')) {
      return { command: 'error', flags: {}, task: '', error: `Unknown flag: ${arg}` };
    }
    taskParts.push(arg);
  }

  return { command, flags, task: taskParts.join(' ').trim() };
}

export function formatCliHelp() {
  return [
    'Aurora - CLI coding agent with tool use and provider fallback',
    '',
    'Usage:',
    '  aurora                         Start interactive chat',
    '  aurora chat                    Start interactive chat',
    '  aurora help | --help           Show this help',
    '  aurora models                  List available tool-capable models',
    '  aurora providers               Show provider configuration',
    '  aurora doctor                  Check local setup and provider health',
    '  aurora run [options] "task"    Run one task and exit',
    '  aurora --model <id> --yes "task"',
    '',
    'Options for run:',
    '  --model <id>   Use a specific model id',
    '  --yes, -y      Allow file changes and shell commands',
  ].join('\n');
}
