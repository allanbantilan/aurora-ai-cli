import readline from 'node:readline/promises';
import { runTurn } from './agent.js';
import * as tools from './tools/index.js';
import { createPermissions } from './permissions.js';
import { systemPrompt } from './prompt.js';
import {
  promptLabel,
  createSpinner,
  CodeHighlighter,
  selectMenu,
  interactiveEnabled,
  yellow,
  magenta,
  red,
  dim,
} from './ui.js';

export async function startRepl({ client, models, initialModel, saveModel }) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // readline intercepts Ctrl+C and emits SIGINT on the interface; without this
  // listener the process can never be interrupted (it just pauses stdin).
  rl.on('SIGINT', () => {
    console.log('\n(interrupted — exiting)');
    rl.close();
    process.exit(0);
  });

  // Ctrl+D / piped stdin ending closes the interface; exit instead of
  // crashing on the next rl.question (ERR_USE_AFTER_CLOSE).
  rl.on('close', () => process.exit(0));

  let model = initialModel;
  if (!model) {
    model = await pickModel(rl, models, null);
    saveModel(model);
  }

  let messages = [{ role: 'system', content: systemPrompt(process.cwd()) }];
  const spinner = createSpinner();

  const permissions = createPermissions(async (preview) => {
    spinner.stop();
    console.log(`\n${yellow('[permission required]')}\n${preview}\n`);

    if (!interactiveEnabled) {
      const a = (await rl.question('Allow? (y)es once / (a)lways this session / (n)o > '))
        .trim()
        .toLowerCase();
      return { choice: a === 'y' ? 'yes' : a === 'a' ? 'always' : 'no' };
    }

    const value = await selectMenu(rl, 'Allow?', [
      { label: 'Yes, once', value: 'yes' },
      { label: 'Yes, for the rest of the session', value: 'always' },
      { label: 'No', value: 'no', isEscape: true },
      { label: 'No — tell the AI what to do instead', value: 'feedback' },
    ]);
    if (value === 'feedback') {
      const feedback = (await rl.question('Tell the AI what to do instead > ')).trim();
      return { choice: 'no', ...(feedback ? { feedback } : {}) };
    }
    return { choice: value };
  });

  console.log(`\njonathan-ai — model: ${model}\nType a request, or /help for commands.`);

  while (true) {
    const input = (await rl.question(`\n${promptLabel()}`)).trim();
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
    const highlighter = new CodeHighlighter();
    spinner.start('thinking...');
    try {
      await runTurn({
        client,
        model,
        messages,
        tools,
        permissions,
        onText: (t) => {
          spinner.stop();
          process.stdout.write(highlighter.highlight(t));
        },
        onToolStart: (name, args) => {
          spinner.stop();
          console.log(`\n${magenta(`[tool] ${name}`)} ${dim(JSON.stringify(args).slice(0, 160))}`);
          spinner.start('thinking...');
        },
        onRetry: (attempt, retries, delayMs) =>
          spinner.update(`rate-limited, retrying in ${delayMs / 1000}s (${attempt}/${retries})...`),
      });
      process.stdout.write(highlighter.flush());
      console.log();
    } catch (err) {
      const hint = err.status === 429 || err.status >= 500 ? ' — try /model to switch models' : '';
      console.error(`\n${red(`[error] ${err.message}`)}${hint}`);
    } finally {
      spinner.stop();
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
