import readline from 'node:readline/promises';
import fs from 'node:fs';
import path from 'node:path';
import { printBanner } from './banner.js';
import { runTurn } from './agent.js';
import * as tools from './tools/index.js';
import { createPermissions } from './permissions.js';
import { systemPrompt } from './prompt.js';
import { AGENT_COMMANDS, routeAgentInput, isLandingPageScaffold } from './agents.js';
import { fetchModelStatus } from './client.js';
import { modeLabel } from './modes.js';
import { formatDiff } from './diff.js';
import { createMemoryStore, learnExplicitPreferences } from './memory.js';
import { loadInstructions, formatInstructionContext } from './instructions.js';
import { activateSkills, discoverSkills, formatSkillCatalog } from './skills.js';
import { compactMessages, shouldCompact } from './context.js';
import { recordModelEvent } from './telemetry.js';
import { createAgentPermissions, discoverCustomAgents, routeCustomAgentInput, runIsolatedAgentSafely } from './custom-agents.js';
import {
  createSpinner,
  CodeHighlighter,
  selectMenu,
  slashMenu,
  multiSelectMenu,
  formatModelStatus,
  shortModelName,
  modelCategory,
  providerDisplayName,
  interactiveEnabled,
  legacyConhost,
  cyan,
  yellow,
  magenta,
  red,
  dim,
  renderPlan,
  renderDoneSummary,
  colorEnabled,
  formatToolActivityGroup,
  isGroupableToolActivity,
} from './ui.js';

const COMMANDS = [
  ['/model', 'select models (order = fallback priority)'],
  ['/permission', 'select Default or Auto mode'],
  ['/plan', 'plan a feature without implementing it'],
  ['/skills', 'list Aurora-native skills'],
  ['/agents', 'list custom and built-in agents'],
  ['/memory', 'list memory or turn it on/off'],
  ['/remember', 'remember a project preference'],
  ['/forget', 'forget a project preference'],
  ['/clear', 'reset conversation'],
  ['/help', 'show this help'],
  ['/exit', 'quit'],
];

export const AUTO_WARNING = 'Enable Auto mode? All file changes and shell commands will run without approval.';
export const PLAN_PROMPT = 'What feature should Aurora plan? > ';
export const PLAN_IMPLEMENT_PROMPT = 'Proceed with implementation?';
const PLAN_PROTOCOL_RE = /\n?<!-- AURORA_PLAN_PROTOCOL\s*\n([\s\S]*?)\s*-->\s*$/;

export function createToolActivityGroup({
  interactive = interactiveEnabled,
  print = console.log,
  failed = (name, result) =>
    isCommandFailure(name, result) || /^(?:Error:|User denied)/i.test(String(result)),
} = {}) {
  let expanded = !interactive;
  let calls = [];

  return {
    record(name, args, result) {
      if (!isGroupableToolActivity(name) || failed(name, result)) return false;
      calls.push({ name, args });
      return true;
    },
    flush() {
      if (!calls.length) return false;
      print(formatToolActivityGroup(calls, { expanded, interactive }));
      calls = [];
      return true;
    },
    toggle() {
      expanded = !expanded;
      return expanded;
    },
    get expanded() {
      return expanded;
    },
  };
}

export function createToolActivityToggleHandler(group, print = console.log) {
  return (_str, key = {}) => {
    if (!key.ctrl || key.name !== 'o') return false;
    const expanded = group.toggle();
    print(dim(`tool activity ${expanded ? 'expanded' : 'compact'} for future groups`));
    return true;
  };
}

export function buildInputPrompt(cwd) {
  return `${dim(cwd)} ${cyan('❯')} `;
}

export function prepareAgentInput(input) {
  // A scaffold request is a creation verb + "laravel" + "project", tolerating
  // stack words in between ("a fresh Laravel + Vue 3 + Inertia + Tailwind
  // project"), OR a bare "fresh/new laravel ... project". The creation verb (and
  // the \s+ after it) keeps in-project feature requests like "add a controller
  // to the Laravel project" from matching.
  const scaffoldIntent =
    /\b(?:create|start|build|scaffold|generate|make|set\s*up|spin\s*up|bootstrap)\s+(?:an?\s+)?(?:fresh\s+|new\s+|brand[\s-]?new\s+)?laravel\b[^.!?\n]{0,80}?\bproject\b/i.test(input) ||
    /\b(?:fresh|new)\s+laravel\b[^.!?\n]{0,80}?\bproject\b/i.test(input);
  const routed = routeAgentInput(scaffoldIntent && !input.trimStart().startsWith('@') ? `@scaffold ${input}` : input);
  if (!routed.matched) return { input, announcement: '', error: '' };
  if (routed.error) return { input: '', announcement: '', error: routed.error };
  return { input: routed.input, announcement: routed.announcement, error: '' };
}

// A request to create a front-end project (Vue/React/site/portfolio/app, etc.)
// that is not already a Laravel scaffold — so its build can be verified.
export function isFrontendBuildTask(task) {
  const text = String(task);
  const creates = /\b(?:create|build|scaffold|generate|make|start|set\s*up|bootstrap)\b/i.test(text);
  const project = /\b(?:app|application|web\s*app|site|website|project|portfolio|spa|dashboard|landing\s*page)\b/i.test(text);
  return creates && project;
}

// Generic completeness gate for any Node project: once a package.json with a
// build script exists, the turn isn't done until deps are installed and the
// build has actually run. A no-op for non-Node projects (no package.json/build).
export function buildVerificationGaps(cwd, successfulCommands) {
  let scripts;
  try {
    scripts = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).scripts ?? {};
  } catch {
    return [];
  }
  if (!scripts.build) return [];
  const gaps = [];
  const ran = (re) => successfulCommands.some((command) => re.test(command));
  if (!fs.existsSync(path.join(cwd, 'node_modules')) && !ran(/\b(?:npm|pnpm|yarn|bun)\s+(?:install|i|ci|add)\b/i)) {
    gaps.push('Install dependencies (npm install).');
  }
  if (!ran(/\b(?:(?:npm|pnpm|bun)\s+run\s+build|yarn(?:\s+run)?\s+build|vite\s+build)\b/i)) {
    gaps.push('Run the build (npm run build) and fix any errors before finishing.');
  }
  return gaps;
}

export function completionSessionForTask(task, scaffoldSession = false) {
  const requestedFeature = scaffoldFeatureName(task);
  const laravelFeature = /\b(?:laravel|inertia|formrequest|artisan|pest|eloquent)\b/i.test(task);
  const featureName = scaffoldSession || laravelFeature ? requestedFeature : '';
  const buildCheck = !scaffoldSession && !laravelFeature && isFrontendBuildTask(task);
  return {
    active: scaffoldSession || Boolean(featureName) || buildCheck,
    featureName,
    landingPage: scaffoldSession && isLandingPageScaffold(task),
    buildCheck,
  };
}

export function maxIterationsForTurn({ scaffoldSession = false, featureSession = false } = {}) {
  return scaffoldSession || featureSession ? 60 : undefined;
}

export function inputMenuPrefix(line, cursor) {
  return cursor === 1 && (line === '/' || line === '@') ? line : '';
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

export function applyModeSelection({ selectedMode, mode = 'permission', messages, cwd, input = '', context = {} }) {
  if (!selectedMode) return { mode, input, messages };
  return {
    mode: selectedMode,
    input,
    messages: [{ role: 'system', content: systemPrompt(cwd, selectedMode, context) }, ...messages.slice(1)],
  };
}

export function beginPlanTurn({ mode, messages, cwd, feature, context = {} }) {
  return {
    previousMode: mode,
    mode: 'plan',
    input: `Plan this feature without implementing it: ${feature}`,
    messages: [{ role: 'system', content: systemPrompt(cwd, 'plan', context) }, ...messages.slice(1)],
  };
}

export function endPlanTurn({ previousMode, messages, cwd, context = {} }) {
  return {
    mode: previousMode,
    messages: [{ role: 'system', content: systemPrompt(cwd, previousMode, context) }, ...messages.slice(1)],
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

export function completePlanTurn({ choice, previousMode, messages, cwd, context = {} }) {
  const restored = endPlanTurn({ previousMode, messages, cwd, context });
  return {
    ...restored,
    input: choice === 'proceed' ? 'Implement the approved plan above.' : '',
  };
}

const EMPTY_PLAN_SECTIONS = Object.freeze({ title: '', context: [], plan: [], files: [], risks: [] });

/** Validate optional extended protocol fields; anything malformed is dropped, never thrown. */
function planSections(protocol) {
  const strings = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string') : []);
  const files = Array.isArray(protocol.files)
    ? protocol.files
        .filter((f) => f && typeof f === 'object' && typeof f.path === 'string' && ['+', '~', '-'].includes(f.change))
        .map(({ path, change, note }) => ({ path, change, note: typeof note === 'string' ? note : '' }))
    : [];
  return {
    title: typeof protocol.title === 'string' ? protocol.title : '',
    context: strings(protocol.context),
    plan: strings(protocol.plan),
    files,
    risks: strings(protocol.risks),
  };
}

export function parsePlanResponse(response) {
  const match = response.match(PLAN_PROTOCOL_RE);
  const text = (match ? response.slice(0, match.index) : response).trimEnd();
  if (!match) return { text, status: 'complete', questions: [], ...EMPTY_PLAN_SECTIONS };

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
    const sections = planSections(protocol);
    if (protocol.status === 'needs_input' && questions.length) {
      return { text, status: 'needs_input', questions, ...sections };
    }
    if (protocol.status === 'complete') {
      return { text, status: 'complete', questions: [], ...sections };
    }
  } catch {
    // Malformed protocol is treated as a completed response.
  }
  return { text, status: 'complete', questions: [], ...EMPTY_PLAN_SECTIONS };
}

export const PHANTOM_RETRY_PROMPT = 'Apply those changes now using your file tools.';

/**
 * Line filter for streamed model text: "✓ <file>: <note>" summary lines are
 * harvested via onNote(file, note) and dropped from the display — they are
 * rendered inside the AURORA DONE box instead. Everything else passes to
 * write() unchanged (line-buffered).
 */
export function createTickFilter(write, onNote) {
  const TICK_RE = /^\s*[✓√]\s+(\S+?):\s+(.+)$/;
  let buffer = '';
  const handle = (line, newline) => {
    const m = line.match(TICK_RE);
    if (m) onNote(m[1], m[2].trim());
    else write(newline ? `${line}\n` : line);
  };
  const push = (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      handle(buffer.slice(0, nl), true);
      buffer = buffer.slice(nl + 1);
    }
  };
  push.flush = () => {
    if (buffer) handle(buffer, false);
    buffer = '';
  };
  return push;
}

/** Plain-language spinner label for a running tool — raw JSON is never shown to the user. */
export function toolActivityLabel(name, args = {}) {
  const base = (p) => (typeof p === 'string' ? p.split(/[\\/]/).pop() : '');
  switch (name) {
    case 'list_files':
      return 'scanning files...';
    case 'read_file':
      return `reading ${base(args.path)}...`;
    case 'grep':
      return 'searching...';
    case 'write_file':
      return `writing ${base(args.path)}...`;
    case 'edit_file':
      return `editing ${base(args.path)}...`;
    case 'run_command':
      return `running ${String(args.command ?? '').slice(0, 60)}...`;
    default:
      return `${name}...`;
  }
}

export function commandProgressLabel(text, elapsedSeconds) {
  const line = String(text)
    .split(/[\r\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .at(-1);
  const elapsed = Number.isFinite(elapsedSeconds) ? ` (${elapsedSeconds}s)` : '';
  return line ? `running${elapsed}... ${line.slice(0, 100)}` : `running command${elapsed}...`;
}

export function reasoningActivityLabel(lastCommand, elapsedSeconds) {
  const context = lastCommand ? ` after ${String(lastCommand).slice(0, 80)}` : '';
  return `reasoning${context} (${elapsedSeconds}s)...`;
}

function readTextOrEmpty(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function collectPageText(cwd) {
  const roots = [path.join(cwd, 'resources', 'views'), path.join(cwd, 'resources', 'js', 'Pages')];
  const files = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(?:blade\.php|vue)$/i.test(entry.name)) files.push(full);
    }
  };
  roots.forEach(walk);
  return files.map(readTextOrEmpty).join('\n');
}

export function scaffoldCompletionGaps(cwd, successfulCommands, { landingPage = true, featureName = '' } = {}) {
  const gaps = [];
  // Universal: every scaffold must install Laravel and end on a passing build.
  if (!fs.existsSync(path.join(cwd, 'artisan'))) gaps.push('Install Laravel before building the feature.');
  if (!successfulCommands.some((command) => /\bphp\s+artisan\s+--version\b/i.test(command))) {
    gaps.push('Verify Laravel with php artisan --version.');
  }
  // Landing-page-specific: only enforced when the request is actually a landing
  // page, so a CRUD/feature scaffold is not forced to grow a marketing page.
  if (landingPage) {
    const route = readTextOrEmpty(path.join(cwd, 'routes', 'web.php'));
    const pages = collectPageText(cwd);
    if (!/Route::get\(\s*['"]\/['"]/i.test(route) || !/->name\(\s*['"][^'"]+['"]\s*\)/i.test(route)) {
      gaps.push('Add a named landing route in routes/web.php.');
    }
    if (!['hero', 'features', 'cta', 'footer'].every((section) => new RegExp(section, 'i').test(pages))) {
      gaps.push('Create a landing page with hero, features, CTA, and footer sections.');
    }
    if (!/\bclass\s*=\s*["'][^"']*(?:flex|grid|bg-|text-|px-|py-|mx-|my-|max-w-)/i.test(pages)) {
      gaps.push('Add Tailwind utility classes to the landing page.');
    }
  } else if (featureName) {
    const exists = (rel) => fs.existsSync(path.join(cwd, rel));
    const plural = `${featureName.toLowerCase()}s`;
    const migrationDir = path.join(cwd, 'database', 'migrations');
    const hasMigration = fs.existsSync(migrationDir) &&
      fs.readdirSync(migrationDir).some((file) => file.includes(`create_${plural}_table`));
    const route = readTextOrEmpty(path.join(cwd, 'routes', 'web.php'));
    if (!exists(`app/Models/${featureName}.php`) || !hasMigration) {
      gaps.push(`Create the ${featureName} model and migration.`);
    }
    if (!exists(`app/Http/Requests/Store${featureName}Request.php`) || !exists(`app/Http/Requests/Update${featureName}Request.php`)) {
      gaps.push(`Create Store${featureName}Request and Update${featureName}Request.`);
    }
    if (!exists(`app/Http/Resources/${featureName}Resource.php`)) gaps.push(`Create ${featureName}Resource.`);
    if (!exists(`app/Http/Controllers/${featureName}Controller.php`) || !new RegExp(`Route::resource\\([^\\n]+${plural}`, 'i').test(route)) {
      gaps.push(`Create ${featureName}Controller and register its resource routes.`);
    }
    const pageDir = `resources/js/Pages/${featureName}`;
    if (!['Index.vue', 'Create.vue', 'Edit.vue', 'Show.vue'].every((file) => exists(`${pageDir}/${file}`))) {
      gaps.push(`Create ${featureName} Index, Create, Edit, and Show Inertia pages.`);
    }
    if (!exists(`tests/Feature/${featureName}Test.php`) && !exists(`tests/Feature/${featureName}sTest.php`)) {
      gaps.push(`Create a Pest feature test for ${featureName}.`);
    }
    if (!successfulCommands.some((command) =>
      new RegExp(`\\bphp\\s+artisan\\s+test\\b.*(?:--filter(?:=|\\s+)${featureName}|${featureName})`, 'i').test(command)
    )) {
      gaps.push(`Run the ${featureName} Pest feature test successfully.`);
    }
  }
  if (!successfulCommands.some((command) => /\bnpm\s+run\s+build\b/i.test(command))) {
    gaps.push('Run npm run build successfully.');
  }
  return gaps;
}

const FEATURE_STOP_WORDS = new Set(['the', 'a', 'an', 'my', 'our', 'complete', 'full', 'simple', 'basic', 'new', 'this']);

// Pull the resource/model a CRUD scaffold is about from varied phrasings, so the
// feature-completeness gate fires regardless of how the user wrote the request.
// Returns the singular, capitalized model name (e.g. "Projects" -> "Project") or ''.
export function scaffoldFeatureName(task) {
  const text = String(task);
  const patterns = [
    /\bCRUD(?:\s+[a-z]+)?\s+(?:for|of)\s+["']?([A-Za-z][A-Za-z0-9_-]*)["']?/i, // CRUD [feature|app] for X
    /["']?([A-Za-z][A-Za-z0-9_-]*)["']?\s+CRUD\b/i,                            // X CRUD
    /\bmanage\s+["']?([A-Za-z][A-Za-z0-9_-]*)["']?/i,                          // manage X
  ];
  for (const re of patterns) {
    const word = text.match(re)?.[1];
    if (word && !FEATURE_STOP_WORDS.has(word.toLowerCase())) {
      return (word.charAt(0).toUpperCase() + word.slice(1)).replace(/s$/i, '');
    }
  }
  return '';
}

/** One-line "tool → target" summary for the permission prompt. */
export function permissionSummary(name, args = {}) {
  const target = name === 'run_command' ? String(args.command ?? '') : String(args.path ?? '');
  return `${name} → ${target}`;
}

/** True when the protocol carried any renderable plan section. Tolerates partial shapes. */
export function hasStructuredPlan(plan) {
  if (!plan) return false;
  return Boolean(
    plan.title || plan.context?.length || plan.plan?.length || plan.files?.length || plan.risks?.length
  );
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

/** readline completer: Tab completes slash commands and @ agents. */
export function completeCommand(line) {
  const choices = line.startsWith('/') ? COMMANDS : line.startsWith('@') ? AGENT_COMMANDS : [];
  const hits = choices.map(([command]) => command).filter((command) => command.startsWith(line));
  return [hits, line];
}

export function commandList() {
  const width = Math.max(...COMMANDS.map(([c]) => c.length)) + 1;
  return COMMANDS.map(([c, d]) => `${c.padEnd(width)} ${d}`).join('\n');
}

export function formatSkillList(skills) {
  if (!skills.length) return 'No Aurora skills found.';
  return skills
    .map((skill) => `$${skill.name} [${skill.scope}${skill.implicit ? ', implicit' : ''}] — ${skill.description}`)
    .join('\n');
}

export function formatAgentList(customAgents, builtInAgents = AGENT_COMMANDS) {
  const custom = customAgents.map((agent) => `@${agent.name} [${agent.scope}] — ${agent.description}`);
  const customNames = new Set(customAgents.map((agent) => `@${agent.name}`));
  const builtIn = builtInAgents
    .filter(([name]) => !customNames.has(name))
    .map(([name, description]) => `${name} [built-in] — ${description}`);
  return [...custom, ...builtIn].join('\n') || 'No Aurora agents found.';
}

export function parseMemoryCommand(input) {
  const match = input.match(/^\/(memory|remember|forget)(?:\s+(.*))?$/i);
  if (!match) return null;
  const command = match[1].toLowerCase();
  const argument = (match[2] ?? '').trim();
  if (command === 'memory') {
    if (/^(?:on|off)$/i.test(argument)) return { action: 'toggle', enabled: argument.toLowerCase() === 'on' };
    return { action: 'list' };
  }
  const scoped = argument.match(/^(global)\s+(.+)$/i);
  return {
    action: command === 'remember' ? 'add' : 'remove',
    scope: scoped ? 'global' : 'project',
    text: scoped ? scoped[2].trim() : argument,
  };
}

export function executeMemoryCommand(command, store) {
  if (command.action === 'list') {
    const entries = store.list();
    const state = store.isEnabled() ? 'enabled' : 'disabled';
    return entries.length
      ? `Memory is ${state}.\n${entries.map(({ scope, text }) => `- [${scope}] ${text}`).join('\n')}`
      : `Memory is ${state}. No saved preferences.`;
  }
  if (command.action === 'toggle') {
    store.setEnabled(command.enabled);
    return `Memory ${command.enabled ? 'enabled' : 'disabled'}.`;
  }
  if (!command.text) return `Usage: /${command.action === 'add' ? 'remember' : 'forget'} [global] <preference>`;
  if (command.action === 'add') {
    const result = store.add(command.text, command.scope);
    return result.added ? `Remembered [${command.scope}]: ${command.text}` : `Not remembered: ${result.reason}.`;
  }
  return store.remove(command.text, command.scope)
    ? `Forgot [${command.scope}]: ${command.text}`
    : `No matching [${command.scope}] memory found.`;
}

export async function startRepl({
  client,
  models,
  initialChain,
  saveModels,
  strictPrivacy = false,
  apiKeys = {},
  providers: availableProviders = [],
  telemetry = {},
  saveTelemetry = () => {},
}) {
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
  const activityGroup = createToolActivityGroup({
    print: (text) => {
      spinner.stop();
      console.log(`\n${text}`);
    },
  });
  const activityToggle = createToolActivityToggleHandler(activityGroup, (text) => {
    spinner.stop();
    console.log(text);
  });
  if (interactiveEnabled) process.stdin.on('keypress', activityToggle);

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

    // Group models by provider
    const providerNames = {
      openrouter: 'OpenRouter',
      google: 'Google AI Studio',
      groq: 'Groq',
      mistral: 'Mistral',
    };

    const sorted = [...models].sort((a, b) => {
      const pa = a.provider || 'openrouter';
      const pb = b.provider || 'openrouter';
      if (pa !== pb) return pa.localeCompare(pb);
      const ca = modelCategory(a.id);
      const cb = modelCategory(b.id);
      return ca === cb ? 0 : ca === 'Coding' ? -1 : 1;
    });

    const options = sorted.map((m) => ({
      label: `${shortModelName(m.id)} (${providerNames[m.provider] || m.provider || 'openrouter'})`,
      value: m.id,
      section: providerNames[m.provider] || m.provider || 'OpenRouter',
      statusText: formatModelStatus(status.get(m.id)),
    }));

    if (!interactiveEnabled) {
      console.log('\nFree tool-capable models:');
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

  const cwd = process.cwd();
  const memoryStore = createMemoryStore({ cwd });
  const instructions = formatInstructionContext(loadInstructions({ cwd }), { cwd });
  const skills = discoverSkills({ cwd });
  const customAgents = discoverCustomAgents({ cwd });
  const currentContext = () => ({
    instructions,
    skillCatalog: formatSkillCatalog(skills),
    memories: memoryStore.isEnabled()
      ? memoryStore.list().map(({ scope, text }) => `- [${scope}] ${text}`).join('\n')
      : '',
  });
  let messages = [{ role: 'system', content: systemPrompt(cwd, mode, currentContext()) }];
  let latestPromptTokens = 0;

  const permissions = createPermissions(async (toolName, args) => {
    spinner.stop();
    // compact prompt: the diff prints ONCE after the change applies, never here
    console.log(`\n${magenta('◆')} Permission needed\n  ${cyan(permissionSummary(toolName, args))}\n`);

    if (!interactiveEnabled) {
      const a = (await rl.question('Allow once / allow Session / Deny? (a/s/d) > '))
        .trim()
        .toLowerCase();
      return { choice: a === 'a' ? 'yes' : a === 's' ? 'always' : 'no' };
    }

    const value = await selectMenu(rl, 'Allow?', [
      { label: 'Allow once', value: 'yes' },
      { label: 'Allow for this session', value: 'always' },
      { label: 'Deny', value: 'no', isEscape: true },
      { label: 'Deny — tell the AI what to do instead', value: 'feedback' },
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
  printBanner({ chain, status: 'online', health: bannerHealth, models });

  const ch = legacyConhost ? '-' : '─';
  const rule = () => dim(ch.repeat(process.stdout.columns || 80));
  const prompt = () => buildInputPrompt(process.cwd());

  /**
   * Read one line of input. In interactive mode, typing "/" or "@" as the
   * first character opens the matching live searchable command menu.
   */
  const readInput = async () => {
    let prefill = '';
    for (;;) {
      if (!interactiveEnabled) return (await rl.question(prompt())).trim();
      const ac = new AbortController();
      let menuPrefix = '';
      const watch = () => {
        menuPrefix = inputMenuPrefix(rl.line, rl.cursor);
        if (menuPrefix) ac.abort();
      };
      process.stdin.on('keypress', watch);
      try {
        const answer = rl.question(prompt(), { signal: ac.signal });
        if (prefill) {
          rl.write(prefill);
          prefill = '';
        }
        return (await answer).trim();
      } catch (err) {
        if (err.name !== 'AbortError') throw err;
        rl.line = '';
        rl.cursor = 0;
        process.stdout.write('\x1B[1A\r\x1B[2K');
        const picked = await slashMenu(rl, menuPrefix === '@' ? AGENT_COMMANDS : COMMANDS);
        if (picked) {
          if (menuPrefix === '@') {
            prefill = `${picked} `;
            continue;
          }
          console.log(`${prompt()}${picked}`);
          return picked;
        }
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

  const DIFF_TOOLS = new Set(['write_file', 'edit_file']);
  // Resolves like the tools do (they default to process.cwd() via resolveSafe);
  // if executeTool ever gets a custom cwd, this must follow it.
  const readFileOrNull = (p) => {
    try {
      return fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');
    } catch {
      return null;
    }
  };
  let editSnapshot = null;

  while (true) {
    console.log(`\n${rule()}`);
    let input = await readInput();
    let previousModeAfterTurn = null;
    console.log(rule());
    if (!input) continue;

    const contextLimit = models.find((model) => model.id === chain[0])?.context;
    if (shouldCompact(latestPromptTokens, contextLimit)) {
      messages = compactMessages(messages);
      latestPromptTokens = 0;
      console.log(dim('conversation compacted locally to stay within the model context limit'));
    }

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
    if (input === '/skills') {
      console.log(formatSkillList(skills));
      continue;
    }
    if (input === '/agents') {
      console.log(formatAgentList(customAgents));
      continue;
    }
    const memoryCommand = parseMemoryCommand(input);
    if (memoryCommand) {
      console.log(executeMemoryCommand(memoryCommand, memoryStore));
      messages[0] = { role: 'system', content: systemPrompt(cwd, mode, currentContext()) };
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
      const switched = applyModeSelection({ selectedMode, mode, messages, cwd, context: currentContext() });
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
      const planning = beginPlanTurn({ mode, messages, cwd, feature, context: currentContext() });
      previousModeAfterTurn = planning.previousMode;
      mode = planning.mode;
      messages = planning.messages;
      input = planning.input;
    }
    if (input.startsWith('/')) {
      console.log(`Unknown command: ${input} — try /help`);
      continue;
    }

    const customAgent = routeCustomAgentInput(input, customAgents);
    if (customAgent.matched) {
      if (customAgent.error) {
        console.log(red(customAgent.error));
        continue;
      }
      console.log(customAgent.announcement);
      const agentPermissions = createAgentPermissions(customAgent.agent, trackedPermissions, tools.RISKY);
      const agentRun = await runIsolatedAgentSafely({
        agent: customAgent.agent,
        task: customAgent.task,
        client,
        models: [...chain],
        tools,
        permissions: agentPermissions,
        context: { ...currentContext(), skills },
      });
      if (agentRun.error) {
        console.log(red(`@${customAgent.agent.name} failed: ${agentRun.error}`));
        continue;
      }
      const result = agentRun.result;
      messages.push({ role: 'user', content: input }, { role: 'assistant', content: result });
      console.log(`\n${magenta('◆')}  ${result}`);
      continue;
    }

    const learningInput = input;
    const activation = activateSkills(input, skills);
    if (activation.error) {
      console.log(red(activation.error));
      continue;
    }
    input = activation.input;
    if (activation.selected.length) {
      const skillInstructions = activation.selected
        .map((skill) => `## Active skill: $${skill.name}\n${skill.body}`)
        .join('\n\n');
      input = `${skillInstructions}\n\n## User task\n${input}`;
    }
    const agentInput = prepareAgentInput(input);
    if (agentInput.error) {
      console.log(red(agentInput.error));
      continue;
    }
    if (agentInput.announcement) console.log(agentInput.announcement);
    const scaffoldSession = /@scaffold dispatched/.test(agentInput.announcement);
    const completionSession = completionSessionForTask(learningInput, scaffoldSession);
    input = agentInput.input;

    let planningSession = previousModeAfterTurn !== null;
    let planShownThisSession = false;
    const turnFileOps = [];
    const turnFileNotes = new Map();
    const turnCommandFailures = [];
    const successfulCommands = [];
    let turnErrors = 0;
    let phantomRetried = false;
    let declineRetried = false;
    let environmentRetried = false;
    let toolPayloadRetried = false;
    let lastCommand = '';
    try {
      while (input) {
        messages.push({ role: 'user', content: input });
        const highlighter = new CodeHighlighter();
        const tickFilter = createTickFilter(
          (t) => process.stdout.write(highlighter.highlight(t)),
          (file, note) => turnFileNotes.set(file, note)
        );
        const writeModelText = createEchoSuppressor(input, tickFilter);
        let aiPrefixPrinted = false;
        const toolPayloadSuppressor = createToolPayloadSuppressor((t) => {
          if (!aiPrefixPrinted) {
            aiPrefixPrinted = true;
            process.stdout.write(`\n${magenta('◆')}  `);
          }
          writeModelText(t);
        });
        let reasoningStarted = 0;
        let commandStarted = 0;
        let latestCommandProgress = '';
        let assistantText = '';
        const commandFailures = [];
        toolsExecuted = [];
        const planActivityStarted = Date.now();
        const completionStarted = Date.now();
        spinner.start(planningSession ? () => planActivityText(planActivityStarted) : 'thinking...');
        await runTurn({
          client,
          models: [...chain],
          messages,
          tools,
          permissions: trackedPermissions,
          maxIterations: maxIterationsForTurn({
            scaffoldSession,
            featureSession: Boolean(completionSession.featureName) || completionSession.buildCheck,
          }),
          strictPrivacy,
          onUsage: (usage) => {
            if (Number.isFinite(usage?.prompt_tokens)) latestPromptTokens = usage.prompt_tokens;
          },
          onText: (t) => {
            assistantText += t;
            if (planningSession) return;
            activityGroup.flush();
            spinner.stop();
            toolPayloadSuppressor(t);
          },
          onReasoning: () => {
            if (reasoningStarted) return; // installed once per reasoning phase
            reasoningStarted = Date.now();
            // time-driven: the spinner re-renders this every frame, so the
            // elapsed counter keeps ticking even when reasoning deltas pause
            spinner.update(() =>
              reasoningActivityLabel(lastCommand, Math.round((Date.now() - reasoningStarted) / 1000))
            );
          },
          onToolStart: (name, args) => {
            if (!isGroupableToolActivity(name)) activityGroup.flush();
            if (DIFF_TOOLS.has(name) && typeof args.path === 'string') {
              editSnapshot = readFileOrNull(args.path);
            }
            reasoningStarted = 0;
            if (name === 'run_command') {
              lastCommand = String(args.command ?? '');
              commandStarted = Date.now();
              latestCommandProgress = lastCommand;
              spinner.start(() =>
                commandProgressLabel(
                  latestCommandProgress,
                  Math.round((Date.now() - commandStarted) / 1000)
                )
              );
              return;
            }
            // never dump raw [tool] JSON — show a plain-language activity line instead
            spinner.start(toolActivityLabel(name, args));
          },
          onToolApproved: (name, args) => {
            if (name === 'run_command') {
              commandStarted = Date.now();
              latestCommandProgress = String(args.command ?? '');
              spinner.start(() =>
                commandProgressLabel(
                  latestCommandProgress,
                  Math.round((Date.now() - commandStarted) / 1000)
                )
              );
              return;
            }
            spinner.start(toolActivityLabel(name, args));
          },
          onToolProgress: (name, text) => {
            if (name === 'run_command') {
              latestCommandProgress = text;
              spinner.update(() =>
                commandProgressLabel(
                  latestCommandProgress,
                  Math.round((Date.now() - commandStarted) / 1000)
                )
              );
            }
          },
          onToolEnd: (name, args, result) => {
            if (/^Error: invalid tool arguments/i.test(String(result))) {
              recordModelEvent(telemetry, chain[0], { malformedToolCall: true });
              saveTelemetry(telemetry);
            }
            const resume = () =>
              spinner.start(planningSession ? () => planActivityText(planActivityStarted) : 'thinking...');
            if (isCommandFailure(name, result)) {
              commandFailures.push(result);
              turnCommandFailures.push({ command: String(args.command ?? ''), result });
              turnErrors += 1;
              spinner.stop();
              console.log(`\n${red(result)}`);
              return resume();
            }
            if (isGroupableToolActivity(name)) {
              if (activityGroup.record(name, args, result)) return resume();
              activityGroup.flush();
              turnErrors += 1;
              spinner.stop();
              console.log(`\n${red(String(result))}`);
              return resume();
            }
            if (name === 'run_command' && typeof result === 'string' && !result.startsWith('User denied') && !result.startsWith('Error')) {
              successfulCommands.push(String(args.command ?? ''));
            }
            if (!DIFF_TOOLS.has(name) || typeof args.path !== 'string' || typeof result !== 'string') {
              return resume(); // tool finished: clear its activity line
            }
            if (result.startsWith('User denied')) return resume();
            if (result.startsWith('Error')) {
              turnErrors += 1;
              return resume();
            }
            turnFileOps.push({ path: args.path, change: editSnapshot === null ? '+' : '~' });
            const after = readFileOrNull(args.path);
            spinner.stop();
            console.log(`\n${formatDiff(args.path, editSnapshot ?? '', after ?? '', { colors: colorEnabled })}`);
            resume();
          },
          onRetry: (attempt, retries, delayMs) =>
            spinner.update(`rate-limited, retrying in ${delayMs / 1000}s (${attempt}/${retries})...`),
          onModelSwitch: (from, to) => {
            recordModelEvent(telemetry, from, { availabilityFailure: true });
            saveTelemetry(telemetry);
            spinner.stop();
            console.log(yellow(`⚠ ${shortModelName(from)} unavailable — switched to ${shortModelName(to)}`));
            spinner.start(planningSession ? () => planActivityText(planActivityStarted) : 'thinking...');
            chain = promoteModel(chain, from, to);
            saveModels(chain);
          },
        });
        recordModelEvent(telemetry, chain[0], { success: true, latencyMs: Date.now() - completionStarted });
        saveTelemetry(telemetry);
        activityGroup.flush();
        spinner.stop();

        if (!planningSession) {
          const suppressedToolPayload = toolPayloadSuppressor.flush();
          writeModelText.flush();
          tickFilter.flush();
          process.stdout.write(highlighter.flush());
          console.log();
          if (suppressedToolPayload && !toolPayloadRetried) {
            toolPayloadRetried = true;
            input = TOOL_PAYLOAD_RETRY_PROMPT;
            continue;
          }
          if (completionSession.active) {
            const gaps = completionSession.buildCheck
              ? buildVerificationGaps(process.cwd(), successfulCommands)
              : scaffoldCompletionGaps(process.cwd(), successfulCommands, {
                  landingPage: completionSession.landingPage,
                  featureName: completionSession.featureName,
                });
            if (gaps.length) {
              input = `The task is not complete. Continue working and satisfy every missing requirement:\n- ${gaps.join('\n- ')}`;
              continue;
            }
          }
          if (isPrematureEnvironmentAbandonment(assistantText, commandFailures) && !environmentRetried) {
            environmentRetried = true;
            input = ENVIRONMENT_CONTINUATION_RETRY_PROMPT;
            continue;
          }
          if (isErroneousTaskDecline(assistantText, toolsExecuted) && !declineRetried) {
            declineRetried = true;
            input = TASK_CONTINUATION_RETRY_PROMPT;
            continue;
          }
          if (claimsUnappliedChanges(assistantText, toolsExecuted)) {
            if (!phantomRetried) {
              // silent auto-retry: tell the model to actually apply what it described
              phantomRetried = true;
              input = PHANTOM_RETRY_PROMPT;
              continue;
            }
            console.log(yellow('⚠ the model described changes but did not modify any files — ask it to apply them using its tools'));
          }
          if (turnFileOps.length || turnErrors) {
            const noteFor = (p) => {
              if (turnFileNotes.has(p)) return turnFileNotes.get(p);
              const base = p.split(/[\\/]/).pop();
              for (const [k, v] of turnFileNotes) if (k.split(/[\\/]/).pop() === base) return v;
              return '';
            };
            const files = turnFileOps.map((op) => ({ ...op, note: noteFor(op.path) }));
            const nextSteps = [
              ...new Set(turnCommandFailures.flatMap(({ command, result }) => commandFailureGuidance(command, result))),
            ];
            console.log(`\n${renderDoneSummary(files, { errors: turnErrors, nextSteps })}`);
          }
          if (turnErrors === 0 && learnExplicitPreferences(learningInput, memoryStore)) {
            messages[0] = { role: 'system', content: systemPrompt(cwd, mode, currentContext()) };
          }
          break;
        }

        const plan = parsePlanResponse(assistantText);
        if (plan.text && !planShownThisSession) {
          process.stdout.write(`\n${magenta('◆')}  ${highlighter.highlight(plan.text)}${highlighter.flush()}\n`);
        }
        if (hasStructuredPlan(plan)) {
          // first render shows the full box; refreshes after answered questions show only what changed
          console.log(`\n${renderPlan(plan, planShownThisSession ? { update: true } : {})}`);
          planShownThisSession = true;
        }
        if (plan.status === 'complete') {
          const choice = await selectMenu(rl, PLAN_IMPLEMENT_PROMPT, planCompletionOptions());
          const completed = completePlanTurn({
            choice,
            previousMode: previousModeAfterTurn,
            messages,
            cwd,
            context: currentContext(),
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
      activityGroup.flush();
      const hint = err.status === 429 || err.status >= 500 ? ' — all models in your chain failed; try /model' : '';
      console.error(`\n${red(`[error] ${err.message}`)}${hint}`);
    } finally {
      spinner.stop();
      if (previousModeAfterTurn) {
        const restored = endPlanTurn({ previousMode: previousModeAfterTurn, messages, cwd, context: currentContext() });
        mode = restored.mode;
        messages = restored.messages;
      }
    }
  }

  if (interactiveEnabled) process.stdin.removeListener('keypress', activityToggle);
  rl.close();
}

const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'run_command']);
const STOCK_TASK_DECLINE = "I'm Aurora, a coding CLI agent. I can only help with code and software development tasks.";
export const TASK_CONTINUATION_RETRY_PROMPT =
  'Continue the active coding task from the latest tool result. Do not decline; the user request is software development.';
export const ENVIRONMENT_CONTINUATION_RETRY_PROMPT =
  'Continue the active coding task. Use the exact command failure as evidence, diagnose it with available tools, and try a safe fallback. Do not stop merely by claiming the environment is unavailable.';
export const TOOL_PAYLOAD_RETRY_PROMPT =
  'The previous response emitted raw tool arguments as text. Invoke the appropriate tool with those arguments now; do not print the JSON.';
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

export function isErroneousTaskDecline(text, toolNames) {
  return toolNames.length > 0 && text.trim() === STOCK_TASK_DECLINE;
}

export function isCommandFailure(name, result) {
  return name === 'run_command' && typeof result === 'string' && result.startsWith('Command failed');
}

export function commandFailureGuidance(command, result) {
  const missing = result.match(/'([^']+)' is not recognized as an internal or external command/i)?.[1];
  if (!missing) return [];

  if (missing.toLowerCase() === 'php') {
    return [
      'Install PHP 8.3+ or add the folder containing php.exe to PATH.',
      'Restart this terminal, then verify with: php -v',
      `Retry: ${command}`,
    ];
  }

  return [
    `Install ${missing} or add its executable folder to PATH.`,
    `Restart this terminal, then verify with: ${missing} --version`,
    `Retry: ${command}`,
  ];
}

export function isPrematureEnvironmentAbandonment(text, commandFailures) {
  if (!commandFailures.length) return false;
  const unavailableClaim =
    /\b(?:php|composer|node|npm|runtime|command|dependency|tool|environment)\b[\s\S]{0,80}\b(?:isn't|is not|aren't|are not|unavailable|missing|not installed|not available)\b/i;
  const abandonment = /\b(?:I|we)\s+(?:can't|cannot|couldn't|could not|am unable to|are unable to)\b/i;
  return unavailableClaim.test(text) && abandonment.test(text);
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

export function createToolPayloadSuppressor(write) {
  let buffer = '';
  let buffering = true;

  const push = (chunk) => {
    if (!buffering) return write(chunk);
    buffer += chunk;
    if (/^\s*\{/.test(buffer)) return;
    buffering = false;
    write(buffer);
    buffer = '';
  };

  push.flush = () => {
    if (!buffering) return false;
    const trimmed = buffer.trim();
    let payload;
    try {
      payload = JSON.parse(trimmed);
    } catch {
      write(buffer);
      buffer = '';
      return false;
    }
    const keys = payload && typeof payload === 'object' ? Object.keys(payload) : [];
    const isToolPayload =
      keys.includes('command') ||
      keys.includes('pattern') ||
      (keys.includes('path') && keys.some((key) => ['content', 'old_string', 'new_string'].includes(key)));
    if (!isToolPayload) write(buffer);
    buffer = '';
    return isToolPayload;
  };

  return push;
}
