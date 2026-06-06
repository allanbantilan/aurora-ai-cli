import readline from 'node:readline/promises';
import { printBanner } from './banner.js';
import { runTurn } from './agent.js';
import * as tools from './tools/index.js';
import { createPermissions } from './permissions.js';
import { systemPrompt } from './prompt.js';
import { fetchModelStatus } from './client.js';
import { modeLabel } from './modes.js';
import {
  createSpinner,
  CodeHighlighter,
  selectMenu,
  slashMenu,
  multiSelectMenu,
  formatModelStatus,
  formatToolPreview,
  shortModelName,
  modelCategory,
  interactiveEnabled,
  legacyConhost,
  cyan,
  yellow,
  magenta,
  red,
  dim,
} from './ui.js';

const COMMANDS = [
  ['/model', 'select models (order = fallback priority)'],
  ['/permission', 'select Default or Auto mode'],
  ['/plan', 'plan a feature without implementing it'],
  ['/clear', 'reset conversation'],
  ['/help', 'show this help'],
  ['/exit', 'quit'],
];

export const AUTO_WARNING = 'Enable Auto mode? All file changes and shell commands will run without approval.';
export const PLAN_PROMPT = 'What feature should Aurora plan? > ';
export const PLAN_IMPLEMENT_PROMPT = 'Proceed with implementation?';
const PLAN_PROTOCOL_RE = /\n?<!-- AURORA_PLAN_PROTOCOL\s*\n([\s\S]*?)\s*-->\s*$/;

export function buildInputPrompt(cwd) {
  return `${dim(cwd)} ${cyan('❯')} `;
}

export function modeOptions() {
  return [
    { label: 'Default — ask for approval before file changes and shell commands', value: 'permission' },
    { label: 'Auto — run all file changes and shell commands without approval', value: 'auto' },
    { label: 'Cancel — keep the current mode', value: null, isEscape: true },
  ];
}

export function shouldConfirmAuto(selectedMode, autoConfirmed) {
  return selectedMode === 'auto' && !autoConfirmed;
}

export function autoConfirmationOptions() {
  return [
    { label: 'Cancel — keep the current mode', value: 'cancel', isEscape: true },
    { label: 'Enable Auto mode for this session', value: 'enable' },
  ];
}

export function applyModeSelection({ selectedMode, mode = 'permission', messages, cwd, input = '' }) {
  if (!selectedMode) return { mode, input, messages };
  return {
    mode: selectedMode,
    input,
    messages: [{ role: 'system', content: systemPrompt(cwd, selectedMode) }, ...messages.slice(1)],
  };
}

export function beginPlanTurn({ mode, messages, cwd, feature }) {
  return {
    previousMode: mode,
    mode: 'plan',
    input: `Plan this feature without implementing it: ${feature}`,
    messages: [{ role: 'system', content: systemPrompt(cwd, 'plan') }, ...messages.slice(1)],
  };
}

export function endPlanTurn({ previousMode, messages, cwd }) {
  return {
    mode: previousMode,
    messages: [{ role: 'system', content: systemPrompt(cwd, previousMode) }, ...messages.slice(1)],
  };
}

export function planActivityText(startedAt, now = Date.now()) {
  return `planning... (${Math.round((now - startedAt) / 1000)}s)`;
}

export function planCompletionOptions() {
  return [
    { label: 'Proceed with implementation (Recommended)', value: 'proceed' },
    { label: 'Return to prompt', value: 'return', isEscape: true },
  ];
}

export function completePlanTurn({ choice, previousMode, messages, cwd }) {
  const restored = endPlanTurn({ previousMode, messages, cwd });
  return {
    ...restored,
    input: choice === 'proceed' ? 'Implement the approved plan above.' : '',
  };
}

export function parsePlanResponse(response) {
  const match = response.match(PLAN_PROTOCOL_RE);
  const text = (match ? response.slice(0, match.index) : response).trimEnd();
  if (!match) return { text, status: 'complete', questions: [] };

  try {
    const protocol = JSON.parse(match[1]);
    const questions = Array.isArray(protocol.questions)
      ? protocol.questions
          .filter(
            (question) =>
              typeof question?.prompt === 'string' &&
              Array.isArray(question.choices) &&
              question.choices.length >= 2 &&
              question.choices.length <= 3 &&
              question.choices.every((choice) => typeof choice === 'string')
          )
          .map(({ prompt, choices }) => ({ prompt, choices }))
      : [];
    if (protocol.status === 'needs_input' && questions.length) {
      return { text, status: 'needs_input', questions };
    }
  } catch {
    // Malformed protocol is treated as a completed response.
  }
  return { text, status: 'complete', questions: [] };
}

export function planChoiceOptions(choices) {
  return [
    ...choices.map((choice, index) => ({
      label: index === 0
        ? `${choice.replace(/\s*\(recommended\)\s*$/i, '')} (Recommended)`
        : choice.replace(/\s*\(recommended\)\s*$/i, ''),
      value: index,
    })),
    { label: 'Type a custom answer', value: 'custom' },
  ];
}

export function formatPlanAnswers(answers) {
  return [
    'Answers to planning questions:',
    ...answers.flatMap(({ prompt, answer }, index) => [`${index + 1}. ${prompt}`, `   ${answer}`]),
  ].join('\n');
}

/** readline completer: Tab after "/" completes among the slash commands. */
export function completeCommand(line) {
  if (!line.startsWith('/')) return [[], line];
  const hits = COMMANDS.map(([c]) => c).filter((c) => c.startsWith(line));
  return [hits, line];
}

export function commandList() {
  const width = Math.max(...COMMANDS.map(([c]) => c.length)) + 1;
  return COMMANDS.map(([c, d]) => `${c.padEnd(width)} ${d}`).join('\n');
}

export async function startRepl({ client, models, initialChain, saveModels }) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, completer: completeCommand });
  let mode = 'permission';
  let autoConfirmed = false;

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

  const spinner = createSpinner();

  async function pickPermissionMode(currentMode) {
    const selected = await selectMenu(rl, 'Select permission mode:', modeOptions());
    if (!selected) return currentMode;
    if (shouldConfirmAuto(selected, autoConfirmed)) {
      const answer = await selectMenu(rl, AUTO_WARNING, autoConfirmationOptions());
      if (answer !== 'enable') return currentMode;
      autoConfirmed = true;
    }
    return selected;
  }

  /** Multi-select picker with live status. Returns the (possibly unchanged) chain. */
  async function pickModels(currentChain) {
    let status = new Map();
    if (interactiveEnabled) {
      spinner.start('checking model status...');
      status = await fetchModelStatus(models.map((m) => m.id)).catch(() => new Map());
      spinner.stop();
    }

    const sorted = [...models].sort((a, b) => {
      const ca = modelCategory(a.id);
      const cb = modelCategory(b.id);
      return ca === cb ? 0 : ca === 'Coding' ? -1 : 1;
    });

    const options = sorted.map((m) => ({
      label: m.id,
      value: m.id,
      section: modelCategory(m.id),
      statusText: formatModelStatus(status.get(m.id)),
    }));

    if (!interactiveEnabled) {
      console.log('\nFree tool-capable models on OpenRouter:');
      options.forEach((o, i) => console.log(`${String(i + 1).padStart(3)}. ${o.label}  ${o.statusText}`));
      const answer = (await rl.question('Models in priority order (e.g. "1 3 2") > ')).trim();
      const idxs = [
        ...new Set(
          answer
            .split(/\s+/)
            .map((n) => Number(n) - 1)
            .filter((i) => Number.isInteger(i) && i >= 0 && i < options.length)
        ),
      ];
      if (idxs.length) return idxs.map((i) => options[i].value);
      return currentChain.length ? currentChain : [options[0].value];
    }

    const preChecked = currentChain
      .map((id) => sorted.findIndex((m) => m.id === id))
      .filter((i) => i >= 0);
    const values = await multiSelectMenu(rl, 'Select models (fallback order = check order):', options, preChecked);
    if (values === null) console.log(dim('cancelled'));
    return values ?? (currentChain.length ? currentChain : [options[0].value]);
  }

  let chain = initialChain;
  if (!chain.length) {
    chain = await pickModels([]);
    saveModels(chain);
  }

  let messages = [{ role: 'system', content: systemPrompt(process.cwd(), mode) }];

  const permissions = createPermissions(async (toolName, args) => {
    spinner.stop();
    console.log(`\n${yellow('[permission required]')}\n${formatToolPreview(toolName, args)}\n`);

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
    // the menu erases itself; leave a one-line record of the decision
    if (value === 'feedback') {
      console.log(dim('✗ denied'));
      const feedback = (await rl.question('Tell the AI what to do instead > ')).trim();
      return { choice: 'no', ...(feedback ? { feedback } : {}) };
    }
    console.log(
      dim(value === 'yes' ? '✓ allowed once' : value === 'always' ? '✓ allowed for this session' : '✗ denied')
    );
    return { choice: value };
  }, () => mode);

  let toolsExecuted = [];
  const trackedPermissions = {
    check: async (name, args) => {
      const result = await permissions.check(name, args);
      if (result.allowed) toolsExecuted.push(name);
      return result;
    },
  };

  let bannerHealth = new Map();
  if (interactiveEnabled && chain.length) {
    spinner.start('checking model status...');
    bannerHealth = await fetchModelStatus(chain).catch(() => new Map());
    spinner.stop();
  }
  printBanner({ chain, status: 'online', health: bannerHealth });

  const ch = legacyConhost ? '-' : '─';
  const rule = () => dim(ch.repeat(process.stdout.columns || 80));
  const prompt = () => buildInputPrompt(process.cwd());

  /**
   * Read one line of input. In interactive mode, typing "/" as the first
   * character aborts the pending question and opens the live searchable
   * command menu (Claude-Code style); picking a command returns it as if typed.
   */
  const readInput = async () => {
    for (;;) {
      if (!interactiveEnabled) return (await rl.question(prompt())).trim();
      const ac = new AbortController();
      const watch = () => {
        if (rl.line === '/' && rl.cursor === 1) ac.abort();
      };
      process.stdin.on('keypress', watch);
      try {
        return (await rl.question(prompt(), { signal: ac.signal })).trim();
      } catch (err) {
        if (err.name !== 'AbortError') throw err;
        rl.line = '';
        rl.cursor = 0;
        process.stdout.write('\x1B[1A\r\x1B[2K');
        // user typed "/": hand the keyboard to the search menu
        const picked = await slashMenu(rl, COMMANDS);
        if (picked) {
          console.log(`${prompt()}${picked}`); // leave a record as if the user typed it
          return picked;
        }
        // cancelled — fall through and re-prompt
      } finally {
        process.stdin.removeListener('keypress', watch);
      }
    }
  };

  const askPlanQuestions = async (questions) => {
    const answers = [];
    for (const [index, question] of questions.entries()) {
      const selected = await selectMenu(
        rl,
        `Question ${index + 1} of ${questions.length}: ${question.prompt}`,
        planChoiceOptions(question.choices)
      );
      let answer = question.choices[selected];
      if (selected === 'custom') {
        do {
          answer = (await rl.question('Custom answer > ')).trim();
        } while (!answer);
      }
      console.log(dim(`✓ ${question.prompt} ${answer}`));
      answers.push({ prompt: question.prompt, answer });
    }
    return answers;
  };

  while (true) {
    console.log(`\n${rule()}`);
    let input = await readInput();
    let previousModeAfterTurn = null;
    console.log(rule());
    if (!input) continue;

    if (input === '/exit') break;
    if (input === '/' || input === '/help') {
      console.log(commandList());
      continue;
    }
    if (input === '/clear') {
      messages = [messages[0]];
      console.log('(conversation cleared)');
      continue;
    }
    if (input === '/model') {
      const next = await pickModels(chain);
      if (next !== chain) {
        chain = next;
        saveModels(chain);
      }
      console.log(dim(`model chain: ${chain.map(shortModelName).join(' → ')}`));
      continue;
    }
    if (input === '/permission') {
      const selectedMode = await pickPermissionMode(mode);
      const switched = applyModeSelection({ selectedMode, mode, messages, cwd: process.cwd() });
      const changed = switched.mode !== mode;
      mode = switched.mode;
      messages = switched.messages;
      console.log(changed ? yellow(`mode: ${modeLabel(mode)}`) : dim(`mode unchanged: ${modeLabel(mode)}`));
      continue;
    }
    if (input === '/plan') {
      const feature = (await rl.question(PLAN_PROMPT)).trim();
      if (!feature) {
        console.log(dim('plan cancelled'));
        continue;
      }
      const planning = beginPlanTurn({ mode, messages, cwd: process.cwd(), feature });
      previousModeAfterTurn = planning.previousMode;
      mode = planning.mode;
      messages = planning.messages;
      input = planning.input;
    }
    if (input.startsWith('/')) {
      console.log(`Unknown command: ${input} — try /help`);
      continue;
    }

    let planningSession = previousModeAfterTurn !== null;
    try {
      while (input) {
        messages.push({ role: 'user', content: input });
        const highlighter = new CodeHighlighter();
        const writeModelText = createEchoSuppressor(input, (t) => {
          process.stdout.write(highlighter.highlight(t));
        });
        let reasoningStarted = 0;
        let assistantText = '';
        let aiPrefixPrinted = false;
        toolsExecuted = [];
        const planActivityStarted = Date.now();
        spinner.start(planningSession ? () => planActivityText(planActivityStarted) : 'thinking...');
        await runTurn({
          client,
          models: [...chain],
          messages,
          tools,
          permissions: trackedPermissions,
          onText: (t) => {
            assistantText += t;
            if (planningSession) return;
            spinner.stop();
            if (!aiPrefixPrinted) {
              aiPrefixPrinted = true;
              process.stdout.write(`\n${magenta('◆')}  `);
            }
            writeModelText(t);
          },
          onReasoning: () => {
            if (reasoningStarted) return; // installed once per reasoning phase
            reasoningStarted = Date.now();
            // time-driven: the spinner re-renders this every frame, so the
            // elapsed counter keeps ticking even when reasoning deltas pause
            spinner.update(() => `reasoning... (${Math.round((Date.now() - reasoningStarted) / 1000)}s)`);
          },
          onToolStart: (name, args) => {
            reasoningStarted = 0;
            spinner.stop();
            console.log(`\n${magenta(`[tool] ${name}`)} ${dim(JSON.stringify(args).slice(0, 160))}`);
            spinner.start(planningSession ? () => planActivityText(planActivityStarted) : 'thinking...');
          },
          onRetry: (attempt, retries, delayMs) =>
            spinner.update(`rate-limited, retrying in ${delayMs / 1000}s (${attempt}/${retries})...`),
          onModelSwitch: (from, to) => {
            spinner.stop();
            console.log(yellow(`⚠ ${shortModelName(from)} unavailable — switched to ${shortModelName(to)}`));
            spinner.start(planningSession ? () => planActivityText(planActivityStarted) : 'thinking...');
            chain = promoteModel(chain, from, to);
            saveModels(chain);
          },
        });
        spinner.stop();

        if (!planningSession) {
          writeModelText.flush();
          process.stdout.write(highlighter.flush());
          console.log();
          if (claimsUnappliedChanges(assistantText, toolsExecuted)) {
            console.log(yellow('⚠ the model described changes but did not modify any files — ask it to apply them using its tools'));
          }
          break;
        }

        const plan = parsePlanResponse(assistantText);
        if (plan.text) {
          process.stdout.write(`\n${magenta('◆')}  ${highlighter.highlight(plan.text)}${highlighter.flush()}\n`);
        }
        if (plan.status === 'complete') {
          const choice = await selectMenu(rl, PLAN_IMPLEMENT_PROMPT, planCompletionOptions());
          const completed = completePlanTurn({
            choice,
            previousMode: previousModeAfterTurn,
            messages,
            cwd: process.cwd(),
          });
          mode = completed.mode;
          messages = completed.messages;
          input = completed.input;
          previousModeAfterTurn = null;
          planningSession = false;
          if (!input) break;
          continue;
        }
        input = formatPlanAnswers(await askPlanQuestions(plan.questions));
      }
    } catch (err) {
      const hint = err.status === 429 || err.status >= 500 ? ' — all models in your chain failed; try /model' : '';
      console.error(`\n${red(`[error] ${err.message}`)}${hint}`);
    } finally {
      spinner.stop();
      if (previousModeAfterTurn) {
        const restored = endPlanTurn({ previousMode: previousModeAfterTurn, messages, cwd: process.cwd() });
        mode = restored.mode;
        messages = restored.messages;
      }
    }
  }

  rl.close();
}

const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'run_command']);
// Claim language: "I/we (have) added ..." anywhere, or a past-tense change verb
// at the start of the message/a sentence ("Replaced the original page with...",
// "Created a new file **about.html**..."), as real model summaries phrase it.
const CLAIM_VERBS =
  'added|updated|edited|created|fixed|changed|wrote|applied|modified|removed|deleted|renamed|replaced|implemented|refactored|moved';
const CLAIM_RE = new RegExp(
  `(?:\\b(?:I|we)(?:'ve| have)? |(?:^|[.!?]\\s+)\\**)(?:${CLAIM_VERBS})\\b`,
  'im'
);

/**
 * Fallback promotion: `to` becomes the active head, `from` leaves the chain
 * (restorable via /model). Decrements the displayed fallback count.
 */
export function promoteModel(chain, from, to) {
  return [to, ...chain.filter((id) => id !== from && id !== to)];
}

/**
 * True when the assistant's reply reads like it applied changes but no
 * write-capable tool ran this turn.
 */
export function claimsUnappliedChanges(text, toolNames) {
  if (toolNames.some((n) => WRITE_TOOLS.has(n))) return false;
  return CLAIM_RE.test(text);
}

export function createEchoSuppressor(input, write) {
  const echoedLine = `${input.trim()}\n`;
  let buffer = '';
  let decided = false;

  const emit = (chunk) => {
    if (chunk) write(chunk);
  };

  const suppress = (chunk) => {
    if (decided) {
      emit(chunk);
      return;
    }

    buffer += chunk;
    if (echoedLine.startsWith(buffer)) return;

    decided = true;
    if (buffer.startsWith(echoedLine)) emit(buffer.slice(echoedLine.length));
    else emit(buffer);
    buffer = '';
  };

  suppress.flush = () => {
    if (!decided && buffer) {
      emit(buffer);
      buffer = '';
      decided = true;
    }
  };

  return suppress;
}
