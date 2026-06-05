import readline from 'node:readline/promises';
import { runTurn } from './agent.js';
import * as tools from './tools/index.js';
import { createPermissions } from './permissions.js';
import { systemPrompt } from './prompt.js';
import { fetchModelStatus } from './client.js';
import {
  statusLine,
  createSpinner,
  CodeHighlighter,
  selectMenu,
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
  ['/clear', 'reset conversation'],
  ['/help', 'show this help'],
  ['/exit', 'quit'],
];

/** readline completer: Tab after "/" completes among the slash commands. */
export function completeCommand(line) {
  if (!line.startsWith('/')) return [[], line];
  const hits = COMMANDS.map(([c]) => c).filter((c) => c.startsWith(line));
  return [hits, line];
}

export function commandList() {
  return COMMANDS.map(([c, d]) => `${c.padEnd(7)} ${d}`).join('\n');
}

/** Read terminal row count from stdout, with a Windows-compatible fallback. */
export function sbRows(stdout = process.stdout) {
  return stdout.rows || stdout.getWindowSize?.()[1] || undefined;
}

export async function startRepl({ client, models, initialChain, saveModels }) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, completer: completeCommand });

  // Scroll-region pinning is not supported on Windows legacy conhost; sb is a
  // no-op stub kept so callers compile without changes.
  const sb = { draw() {}, init() {}, reset() {} };

  // readline intercepts Ctrl+C and emits SIGINT on the interface; without this
  // listener the process can never be interrupted (it just pauses stdin).
  rl.on('SIGINT', () => {
    sb.reset();
    console.log('\n(interrupted — exiting)');
    rl.close();
    process.exit(0);
  });

  // Ctrl+D / piped stdin ending closes the interface; exit instead of
  // crashing on the next rl.question (ERR_USE_AFTER_CLOSE).
  rl.on('close', () => { sb.reset(); process.exit(0); });

  const spinner = createSpinner();

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

  let messages = [{ role: 'system', content: systemPrompt(process.cwd()) }];

  let lastPromptTokens = null;
  /** % of the active model's context window used, or null when unknown. */
  const ctxPct = () => {
    const ctxLen = models.find((m) => m.id === chain[0])?.context;
    return lastPromptTokens !== null && ctxLen ? (lastPromptTokens / ctxLen) * 100 : null;
  };

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
  });

  let toolsExecuted = [];
  const trackedPermissions = {
    check: async (name, args) => {
      const result = await permissions.check(name, args);
      if (result.allowed) toolsExecuted.push(name);
      return result;
    },
  };

  const chainLabel = () =>
    `${chain[0]}${chain.length > 1 ? ` (+${chain.length - 1} fallback${chain.length > 2 ? 's' : ''})` : ''}`;

  console.log(`\naurora — model: ${chainLabel()}\nType a request, or /help for commands.`);

  const rule = () => dim((legacyConhost ? '-' : '─').repeat(process.stdout.columns || 80));

  while (true) {
    console.log(`\n${rule()}`);
    const input = (await rl.question(`${cyan('❯')} `)).trim();
    console.log(rule());
    if (!input) continue;

    if (input === '/exit') break;
    if (input === '/' || input === '/help') {
      console.log(commandList());
      continue;
    }
    if (input === '/clear') {
      messages = [messages[0]];
      lastPromptTokens = null;
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
    if (input.startsWith('/')) {
      console.log(`Unknown command: ${input} — try /help`);
      continue;
    }

    messages.push({ role: 'user', content: input });
    const highlighter = new CodeHighlighter();
    const writeModelText = createEchoSuppressor(input, (t) => {
      process.stdout.write(highlighter.highlight(t));
    });
    let reasoningStarted = 0;
    let assistantText = '';
    let aiPrefixPrinted = false;
    toolsExecuted = [];
    spinner.start('thinking...');
    try {
      await runTurn({
        client,
        models: [...chain],
        messages,
        tools,
        permissions: trackedPermissions,
        onText: (t) => {
          assistantText += t;
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
          spinner.start('thinking...');
        },
        onRetry: (attempt, retries, delayMs) =>
          spinner.update(`rate-limited, retrying in ${delayMs / 1000}s (${attempt}/${retries})...`),
        onUsage: (u) => {
          if (typeof u?.prompt_tokens === 'number') lastPromptTokens = u.prompt_tokens;
        },
        onModelSwitch: (from, to) => {
          spinner.stop();
          console.log(yellow(`⚠ ${shortModelName(from)} unavailable — switched to ${shortModelName(to)}`));
          spinner.start('thinking...');
          chain = promoteModel(chain, from, to);
          saveModels(chain);
        },
      });
      writeModelText.flush();
      process.stdout.write(highlighter.flush());
      console.log();
      console.log(`\n  ${statusLine(process.cwd(), chain, { pct: ctxPct() })}`);
      if (claimsUnappliedChanges(assistantText, toolsExecuted)) {
        console.log(yellow('⚠ the model described changes but did not modify any files — ask it to apply them using its tools'));
      }
    } catch (err) {
      const hint = err.status === 429 || err.status >= 500 ? ' — all models in your chain failed; try /model' : '';
      console.error(`\n${red(`[error] ${err.message}`)}${hint}`);
    } finally {
      spinner.stop();
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
