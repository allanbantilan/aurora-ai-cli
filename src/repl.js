import readline from 'node:readline/promises';
import { runTurn } from './agent.js';
import * as tools from './tools/index.js';
import { createPermissions } from './permissions.js';
import { systemPrompt } from './prompt.js';

export async function startRepl({ client, models, initialModel, saveModel }) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  let model = initialModel;
  if (!model) {
    model = await pickModel(rl, models, null);
    saveModel(model);
  }

  let messages = [{ role: 'system', content: systemPrompt(process.cwd()) }];

  const permissions = createPermissions(async (preview) => {
    console.log(`\n[permission required]\n${preview}`);
    return rl.question('Allow? (y)es once / (a)lways this session / (n)o > ');
  });

  console.log(`\njonathan-ai — model: ${model}\nType a request, or /help for commands.`);

  while (true) {
    const input = (await rl.question('\nyou > ')).trim();
    if (!input) continue;

    if (input === '/exit') break;
    if (input === '/help') {
      console.log('/model  switch model\n/clear  reset conversation\n/help   this help\n/exit   quit');
      continue;
    }
    if (input === '/clear') {
      messages = [messages[0]];
      console.log('(conversation cleared)');
      continue;
    }
    if (input === '/model') {
      model = await pickModel(rl, models, model);
      saveModel(model);
      console.log(`(model: ${model})`);
      continue;
    }
    if (input.startsWith('/')) {
      console.log(`Unknown command: ${input} — try /help`);
      continue;
    }

    messages.push({ role: 'user', content: input });
    try {
      await runTurn({
        client,
        model,
        messages,
        tools,
        permissions,
        onText: (t) => process.stdout.write(t),
        onToolStart: (name, args) => console.log(`\n[tool] ${name} ${JSON.stringify(args).slice(0, 160)}`),
      });
      console.log();
    } catch (err) {
      const hint = err.status === 429 || err.status >= 500 ? ' — try /model to switch models' : '';
      console.error(`\n[error] ${err.message}${hint}`);
    }
  }

  rl.close();
}

async function pickModel(rl, models, current) {
  console.log('\nFree tool-capable models on OpenRouter:');
  models.forEach((m, i) => {
    const ctx = m.context ? `  (${Math.round(m.context / 1000)}k ctx)` : '';
    const mark = m.id === current ? '  *current*' : '';
    console.log(`${String(i + 1).padStart(3)}. ${m.id}${ctx}${mark}`);
  });
  const answer = (await rl.question('Model number > ')).trim();
  const idx = Number(answer) - 1;
  if (Number.isInteger(idx) && idx >= 0 && idx < models.length) return models[idx].id;
  if (current) {
    console.log('Keeping current model.');
    return current;
  }
  console.log('Invalid choice, using the first model.');
  return models[0].id;
}
