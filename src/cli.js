const COMMANDS = new Set(['chat', 'help', 'models', 'providers', 'doctor', 'run']);
const NO_ARG_COMMANDS = new Set(['chat', 'models', 'providers', 'doctor']);
const PROVIDER_NAMES = {
  openrouter: 'OpenRouter',
  google: 'Google AI Studio',
  groq: 'Groq',
  mistral: 'Mistral',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
};
const PAID_PROVIDERS = new Set(['anthropic', 'openai']);
const PROVIDER_URLS = {
  openrouter: 'https://openrouter.ai/keys',
  google: 'https://aistudio.google.com/apikey',
  groq: 'https://console.groq.com/keys',
  mistral: 'https://console.mistral.ai/api-keys',
  anthropic: 'https://console.anthropic.com/',
  openai: 'https://platform.openai.com/api-keys',
};

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

export function providerName(id) {
  return PROVIDER_NAMES[id] || id;
}

export function providerTier(id) {
  return PAID_PROVIDERS.has(id) ? 'paid' : 'free';
}

export function providerStatusRows(providers, apiKeys = {}) {
  return providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    status: apiKeys[provider.id] ? 'configured' : 'not configured',
  }));
}

export function formatProviderRows(rows) {
  return rows
    .map((row) => {
      const status = row.status === 'fetch failed' ? `fetch failed: ${row.error}` : row.status;
      return `${row.name.padEnd(20)} ${status.padEnd(24)} ${providerTier(row.id)}`;
    })
    .join('\n');
}

export function formatModelRows(models) {
  const lines = ['Available tool-capable models:'];
  models.forEach((model, index) => {
    const provider = model.provider || 'openrouter';
    lines.push(`${String(index + 1).padStart(3)}. ${model.id} (${providerName(provider)}, ${providerTier(provider)})`);
  });
  return lines.join('\n');
}

export function providerSetupUrl(id) {
  return PROVIDER_URLS[id] || '';
}

export function formatDoctorReport({ nodeOk, providers = [], models = [] }) {
  const lines = ['Aurora doctor', '', `Node.js: ${nodeOk ? 'ok' : 'requires Node 20+'}`, '', 'Providers:'];
  for (const provider of providers) {
    const setup = provider.status === 'not configured' ? ` (${providerSetupUrl(provider.id)})` : '';
    const status = provider.status === 'fetch failed' ? `fetch failed: ${provider.error}` : provider.status;
    lines.push(`  ${provider.name}: ${status}${setup}`);
  }
  lines.push('', `Models: ${models.length ? `${models.length} usable` : 'none usable'}`);
  return lines.join('\n');
}
