import { runTurn } from './agent.js';
import { createPermissions } from './permissions.js';
import { systemPrompt } from './prompt.js';
import * as tools from './tools/index.js';

const ONE_SHOT_DENIAL = 'This command needs --yes for file changes or shell commands.';

export function createOneShotPermissions({ yes = false } = {}) {
  return createPermissions(
    async () => ({
      choice: 'no',
      feedback: ONE_SHOT_DENIAL,
    }),
    () => (yes ? 'auto' : 'permission')
  );
}

export function resolveRunModels({ requestedModel = '', savedChain = [], models = [] } = {}) {
  const byId = new Map(models.map((model) => [model.id, model]));

  if (requestedModel) {
    if (!byId.has(requestedModel)) throw new Error(`Unknown model: ${requestedModel}`);
    return [requestedModel];
  }

  const validSaved = savedChain.filter((id) => byId.has(id));
  const seed = validSaved.length ? validSaved : models.slice(0, 1).map((model) => model.id);
  if (!seed.length) throw new Error('No usable models are available.');

  const provider = byId.get(seed[0])?.provider || 'openrouter';
  return seed.filter((id) => (byId.get(id)?.provider || 'openrouter') === provider);
}

export async function runOneShot({
  client,
  models,
  task,
  yes = false,
  strictPrivacy = false,
  cwd = process.cwd(),
  write = (text) => process.stdout.write(text),
  onToolEnd,
} = {}) {
  if (!task || !task.trim()) throw new Error('Usage: aurora run [--model <id>] [--yes] "task"');

  const messages = [
    { role: 'system', content: systemPrompt(cwd, yes ? 'auto' : 'permission') },
    { role: 'user', content: task.trim() },
  ];
  let output = '';

  await runTurn({
    client,
    models,
    messages,
    tools,
    permissions: createOneShotPermissions({ yes }),
    strictPrivacy,
    onText: (text) => {
      output += text;
      write(text);
    },
    onToolEnd,
  });

  if (output && !output.endsWith('\n')) write('\n');
  return { output, messages };
}
