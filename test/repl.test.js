import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  applyModeSelection,
  autoConfirmationOptions,
  AUTO_WARNING,
  buildInputPrompt,
  createEchoSuppressor,
  createToolPayloadSuppressor,
  claimsUnappliedChanges,
  isCommandFailure,
  commandFailureGuidance,
  isErroneousTaskDecline,
  isPrematureEnvironmentAbandonment,
  completeCommand,
  commandList,
  modeOptions,
  beginPlanTurn,
  completePlanTurn,
  formatPlanAnswers,
  parsePlanResponse,
  hasStructuredPlan,
  toolActivityLabel,
  commandProgressLabel,
  reasoningActivityLabel,
  scaffoldCompletionGaps,
  permissionSummary,
  createTickFilter,
  PHANTOM_RETRY_PROMPT,
  planActivityText,
  planChoiceOptions,
  planCompletionOptions,
  endPlanTurn,
  PLAN_IMPLEMENT_PROMPT,
  PLAN_PROMPT,
  promoteModel,
  prepareAgentInput,
  inputMenuPrefix,
  shouldConfirmAuto,
  ENVIRONMENT_CONTINUATION_RETRY_PROMPT,
  parseMemoryCommand,
  executeMemoryCommand,
} from '../src/repl.js';

test('createEchoSuppressor drops an exact first-line echo of the user input', () => {
  let out = '';
  const write = createEchoSuppressor('hello', (chunk) => {
    out += chunk;
  });

  write('hello\nHello! ');
  write('How can I help?');
  write.flush();

  assert.equal(out, 'Hello! How can I help?');
});

test('createEchoSuppressor preserves normal streamed output', () => {
  let out = '';
  const write = createEchoSuppressor('hello', (chunk) => {
    out += chunk;
  });

  write('Hello! ');
  write('How can I help?');
  write.flush();

  assert.equal(out, 'Hello! How can I help?');
});

test('claimsUnappliedChanges fires on claim language + code block + no write tools', () => {
  const text = "I've added the navbar:\n```html\n<nav>...</nav>\n```\nDone!";
  assert.equal(claimsUnappliedChanges(text, ['read_file']), true);
});

test('claimsUnappliedChanges stays quiet when a write tool ran', () => {
  const text = "I've added the navbar:\n```html\n<nav>...</nav>\n```";
  assert.equal(claimsUnappliedChanges(text, ['read_file', 'edit_file']), false);
  assert.equal(claimsUnappliedChanges(text, ['write_file']), false);
});

test('claimsUnappliedChanges ignores explanations without claim language', () => {
  const text = 'Here is how the function works:\n```js\nfn();\n```';
  assert.equal(claimsUnappliedChanges(text, []), false);
});

test('claimsUnappliedChanges fires on claims even without a code block', () => {
  // real phantom-edit summaries usually have no code fence at all
  assert.equal(claimsUnappliedChanges('I fixed the typo in the README.', []), true);
});

test('claimsUnappliedChanges catches subject-less summary claims (real transcript)', () => {
  for (const text of [
    'Replaced the original page with a modern, Tailwind‑CSS based landing page.',
    'Added a responsive navigation bar with a brand name and placeholder links, plus a simple footer.',
    'Created a new file **about.html** with a matching modern Tailwind layout.',
  ]) {
    assert.equal(claimsUnappliedChanges(text, ['read_file']), true, text);
  }
});

test('claimsUnappliedChanges ignores mid-sentence past-tense verbs', () => {
  assert.equal(claimsUnappliedChanges('The navbar added in v2 uses flexbox.', []), false);
  assert.equal(claimsUnappliedChanges('You should keep the code added by the plugin.', []), false);
});

test('claimsUnappliedChanges matches "I have updated" and "I updated" variants', () => {
  const code = '\n```css\n.a{}\n```';
  assert.equal(claimsUnappliedChanges(`I have updated the styles.${code}`, []), true);
  assert.equal(claimsUnappliedChanges(`I updated the styles.${code}`, []), true);
});

test('claimsUnappliedChanges treats run_command as write-capable', () => {
  const text = "I've added the file:\n```js\nx\n```";
  assert.equal(claimsUnappliedChanges(text, ['run_command']), false);
});

test('claimsUnappliedChanges matches extended claim verbs', () => {
  const code = '\n```js\nx\n```';
  for (const v of ['modified', 'removed', 'implemented', 'replaced']) {
    assert.equal(claimsUnappliedChanges(`I ${v} the helper.${code}`, []), true, v);
  }
});

test('completeCommand completes a unique prefix', () => {
  assert.deepEqual(completeCommand('/mo'), [['/model'], '/mo']);
});

test('completeCommand lists all commands for bare slash', () => {
  const [hits] = completeCommand('/');
  assert.deepEqual(hits, ['/model', '/permission', '/plan', '/memory', '/remember', '/forget', '/clear', '/help', '/exit']);
});

test('completeCommand returns no hits for non-command input', () => {
  assert.deepEqual(completeCommand('hello'), [[], 'hello']);
  assert.deepEqual(completeCommand('/nope'), [[], '/nope']);
});

test('createToolPayloadSuppressor hides raw file-tool JSON and reports it', () => {
  let out = '';
  const push = createToolPayloadSuppressor((text) => { out += text; });
  push('{\n  "path": "routes/web.php",\n');
  push('  "content": "<?php"\n}');

  assert.equal(push.flush(), true);
  assert.equal(out, '');
});

test('createToolPayloadSuppressor streams normal prose unchanged', () => {
  let out = '';
  const push = createToolPayloadSuppressor((text) => { out += text; });
  push('I will inspect the route first.');

  assert.equal(push.flush(), false);
  assert.equal(out, 'I will inspect the route first.');
});

test('isErroneousTaskDecline catches the stock decline after tool execution', () => {
  const decline = "I'm Aurora, a coding CLI agent. I can only help with code and software development tasks.";
  assert.equal(isErroneousTaskDecline(decline, ['run_command']), true);
  assert.equal(isErroneousTaskDecline(decline, []), false);
  assert.equal(isErroneousTaskDecline('Dependency installed. Continuing.', ['run_command']), false);
});

test('isCommandFailure recognizes failed run_command results only', () => {
  assert.equal(isCommandFailure('run_command', 'Command failed (exit code 1):\ncomposer not found'), true);
  assert.equal(isCommandFailure('run_command', '(no output)'), false);
  assert.equal(isCommandFailure('edit_file', 'Command failed (exit code 1)'), false);
});

test('commandFailureGuidance gives actionable Windows steps for a missing PHP executable', () => {
  const steps = commandFailureGuidance(
    'php artisan inertia:install vue',
    "Command failed (exit code 1):\n'php' is not recognized as an internal or external command"
  );

  assert.deepEqual(steps, [
    'Install PHP 8.3+ or add the folder containing php.exe to PATH.',
    'Restart this terminal, then verify with: php -v',
    'Retry: php artisan inertia:install vue',
  ]);
});

test('commandFailureGuidance stays empty for ordinary command failures', () => {
  assert.deepEqual(commandFailureGuidance('npm test', 'Command failed (exit code 1):\n3 tests failed'), []);
});

test('isPrematureEnvironmentAbandonment catches unsupported environment claims after command failure', () => {
  const response = "PHP isn't available in this environment, so I can't execute composer create-project.";
  assert.equal(
    isPrematureEnvironmentAbandonment(response, ['Command failed (exit code 1):\ncomposer is not recognized']),
    true
  );
  assert.equal(isPrematureEnvironmentAbandonment(response, []), false);
  assert.equal(
    isPrematureEnvironmentAbandonment(
      'The command failed because composer is not recognized. I will inspect the available runtimes next.',
      ['Command failed (exit code 1):\ncomposer is not recognized']
    ),
    false
  );
});

test('environment continuation retry requests evidence-based diagnosis and continued work', () => {
  assert.match(ENVIRONMENT_CONTINUATION_RETRY_PROMPT, /exact command failure/i);
  assert.match(ENVIRONMENT_CONTINUATION_RETRY_PROMPT, /continue/i);
});

test('completeCommand completes @ agent names', () => {
  assert.deepEqual(completeCommand('@rev'), [['@review'], '@rev']);
});

test('inputMenuPrefix detects bare slash and @ triggers only', () => {
  assert.equal(inputMenuPrefix('/', 1), '/');
  assert.equal(inputMenuPrefix('@', 1), '@');
  assert.equal(inputMenuPrefix('@review', 7), '');
  assert.equal(inputMenuPrefix('hello @', 7), '');
});

test('commandList includes every command with a description', () => {
  const text = commandList();
  for (const c of ['/model', '/permission', '/plan', '/memory', '/remember', '/forget', '/clear', '/help', '/exit']) assert.match(text, new RegExp(c.replace('/', '\\/')));
});

test('parseMemoryCommand recognizes memory controls and scoped values', () => {
  assert.deepEqual(parseMemoryCommand('/memory'), { action: 'list' });
  assert.deepEqual(parseMemoryCommand('/memory off'), { action: 'toggle', enabled: false });
  assert.deepEqual(parseMemoryCommand('/memory on'), { action: 'toggle', enabled: true });
  assert.deepEqual(parseMemoryCommand('/remember Use Pest.'), { action: 'add', scope: 'project', text: 'Use Pest.' });
  assert.deepEqual(parseMemoryCommand('/remember global Keep replies terse.'), {
    action: 'add',
    scope: 'global',
    text: 'Keep replies terse.',
  });
  assert.deepEqual(parseMemoryCommand('/forget global Keep replies terse.'), {
    action: 'remove',
    scope: 'global',
    text: 'Keep replies terse.',
  });
  assert.equal(parseMemoryCommand('/model'), null);
});

test('executeMemoryCommand lists, toggles, adds, and removes through the store', () => {
  const values = [];
  let enabled = true;
  const store = {
    list: () => values,
    isEnabled: () => enabled,
    setEnabled: (value) => { enabled = value; },
    add: (text, scope) => {
      values.push({ text, scope });
      return { added: true };
    },
    remove: (text, scope) => {
      const index = values.findIndex((value) => value.text === text && value.scope === scope);
      if (index < 0) return false;
      values.splice(index, 1);
      return true;
    },
  };

  assert.match(executeMemoryCommand({ action: 'list' }, store), /enabled/i);
  assert.match(executeMemoryCommand({ action: 'add', scope: 'project', text: 'Use Pest.' }, store), /remembered/i);
  assert.match(executeMemoryCommand({ action: 'list' }, store), /Use Pest/);
  assert.match(executeMemoryCommand({ action: 'remove', scope: 'project', text: 'Use Pest.' }, store), /forgot/i);
  assert.match(executeMemoryCommand({ action: 'toggle', enabled: false }, store), /disabled/i);
});

test('promoteModel puts the fallback first and drops the failed model', () => {
  assert.deepEqual(promoteModel(['a', 'b', 'c'], 'a', 'b'), ['b', 'c']);
});

test('promoteModel keeps unrelated models in order', () => {
  assert.deepEqual(promoteModel(['a', 'b', 'c', 'd'], 'b', 'c'), ['c', 'a', 'd']);
});

test('buildInputPrompt is plain and does not show the active mode', () => {
  const prompt = buildInputPrompt('C:\\projects\\demo');
  assert.match(prompt, /C:\\projects\\demo/);
  assert.doesNotMatch(prompt, /\[Permission\]|\[Auto\]|\[Plan\]/);
});

test('prepareAgentInput expands recognized agents and preserves ordinary input', () => {
  const routed = prepareAgentInput('@simplify src/utils.js');
  assert.match(routed.announcement, /◆ @simplify dispatched/);
  assert.match(routed.input, /Run the @simplify agent on: src\/utils\.js/);

  assert.deepEqual(prepareAgentInput('explain this code'), {
    input: 'explain this code',
    announcement: '',
    error: '',
  });
});

test('prepareAgentInput auto-routes fresh framework project requests to scaffold', () => {
  const routed = prepareAgentInput('create a fresh laravel project here, make it a landing page');
  assert.match(routed.announcement, /◆ @scaffold dispatched/);
  assert.match(routed.input, /composer create-project laravel\/laravel \./);
  assert.match(routed.input, /make it a landing page/);
});

test('prepareAgentInput does not route non-Laravel projects to the Laravel scaffold agent', () => {
  assert.deepEqual(prepareAgentInput('create a React project'), {
    input: 'create a React project',
    announcement: '',
    error: '',
  });
});

test('prepareAgentInput returns validation errors without runnable input', () => {
  assert.deepEqual(prepareAgentInput('@fix'), {
    input: '',
    announcement: '',
    error: '@fix requires a file, error, or description.',
  });
});

test('modeOptions lists Default and Auto but not Plan', () => {
  assert.deepEqual(modeOptions().map((o) => o.value), ['permission', 'auto', null]);
  const labels = modeOptions().map((o) => o.label).join('\n');
  assert.match(labels, /Default.*approval/i);
  assert.doesNotMatch(labels, /Permission/);
  assert.match(labels, /Auto.*without approval/i);
  assert.doesNotMatch(labels, /Plan/);
});

test('applyModeSelection updates system message and preserves input', () => {
  const messages = [
    { role: 'system', content: 'old' },
    { role: 'user', content: 'earlier' },
  ];
  const result = applyModeSelection({
    selectedMode: 'auto',
    messages,
    cwd: 'C:\\project',
    input: 'partially typed',
  });

  assert.equal(result.mode, 'auto');
  assert.equal(result.input, 'partially typed');
  assert.match(result.messages[0].content, /Active mode: Auto/);
  assert.deepEqual(result.messages.slice(1), messages.slice(1));
  assert.equal(messages[0].content, 'old');
});

test('applyModeSelection leaves state unchanged when picker is cancelled', () => {
  const messages = [{ role: 'system', content: 'old' }];
  const result = applyModeSelection({ selectedMode: null, mode: 'plan', messages, cwd: 'C:\\project', input: 'draft' });
  assert.equal(result.mode, 'plan');
  assert.equal(result.input, 'draft');
  assert.equal(result.messages, messages);
});

test('Auto confirmation is required only before first session approval', () => {
  assert.equal(shouldConfirmAuto('auto', false), true);
  assert.equal(shouldConfirmAuto('auto', true), false);
  assert.equal(shouldConfirmAuto('permission', false), false);
  assert.equal(shouldConfirmAuto('plan', false), false);
});

test('Auto confirmation clearly warns and defaults to cancel', () => {
  assert.match(AUTO_WARNING, /all file changes and shell commands/i);
  assert.match(AUTO_WARNING, /without approval/i);
  assert.equal(autoConfirmationOptions()[0].value, 'cancel');
  assert.equal(autoConfirmationOptions()[0].isEscape, true);
  assert.equal(autoConfirmationOptions()[1].value, 'enable');
});

test('PLAN_PROMPT asks for the feature to plan', () => {
  assert.match(PLAN_PROMPT, /feature/i);
  assert.match(PLAN_PROMPT, /plan/i);
});

test('beginPlanTurn temporarily switches to Plan and creates the planning request', () => {
  const messages = [{ role: 'system', content: 'old system' }, { role: 'user', content: 'earlier' }];
  const result = beginPlanTurn({ mode: 'auto', messages, cwd: 'C:\\project', feature: 'add authentication' });

  assert.equal(result.previousMode, 'auto');
  assert.equal(result.mode, 'plan');
  assert.match(result.input, /add authentication/);
  assert.match(result.messages[0].content, /Active mode: Plan/);
  assert.deepEqual(result.messages.slice(1), messages.slice(1));
});

test('endPlanTurn restores the previous execution mode and system prompt', () => {
  const messages = [{ role: 'system', content: 'plan system' }, { role: 'assistant', content: 'the plan' }];
  const result = endPlanTurn({ previousMode: 'auto', messages, cwd: 'C:\\project' });

  assert.equal(result.mode, 'auto');
  assert.match(result.messages[0].content, /Active mode: Auto/);
  assert.deepEqual(result.messages.slice(1), messages.slice(1));
});

test('parsePlanResponse separates visible text from needs-input protocol', () => {
  const response = `## Verified project context
- Framework: Not confirmed yet

<!-- AURORA_PLAN_PROTOCOL
{"status":"needs_input","questions":[{"prompt":"Which route?","choices":["Replace home page","Add a new route"]}]}
-->`;
  const result = parsePlanResponse(response);

  assert.match(result.text, /Verified project context/);
  assert.doesNotMatch(result.text, /AURORA_PLAN_PROTOCOL/);
  assert.equal(result.status, 'needs_input');
  assert.deepEqual(result.questions, [{ prompt: 'Which route?', choices: ['Replace home page', 'Add a new route'] }]);
});

test('parsePlanResponse hides protocol when the closing marker follows JSON on the same line', () => {
  const response = `## Questions / Unknowns
- Which technology?

<!-- AURORA_PLAN_PROTOCOL
{"status":"needs_input","questions":[{"prompt":"Which technology?","choices":["Plain HTML","React"]}]}-->`;
  const result = parsePlanResponse(response);

  assert.doesNotMatch(result.text, /AURORA_PLAN_PROTOCOL|needs_input/);
  assert.equal(result.status, 'needs_input');
  assert.deepEqual(result.questions, [{ prompt: 'Which technology?', choices: ['Plain HTML', 'React'] }]);
});

test('parsePlanResponse safely treats missing or malformed protocol as complete', () => {
  const plain = parsePlanResponse('plain plan');
  assert.equal(plain.text, 'plain plan');
  assert.equal(plain.status, 'complete');
  assert.deepEqual(plain.questions, []);
  const malformed = parsePlanResponse('visible\n<!-- AURORA_PLAN_PROTOCOL\nnope\n-->');
  assert.equal(malformed.text, 'visible');
  assert.equal(malformed.status, 'complete');
  assert.deepEqual(malformed.questions, []);
  assert.deepEqual(malformed.plan, []);
});

test('planChoiceOptions marks the first choice recommended and adds custom answer', () => {
  const options = planChoiceOptions(['Use existing route', 'Add new route']);
  assert.deepEqual(options.map((o) => o.value), [0, 1, 'custom']);
  assert.match(options[0].label, /\(Recommended\)$/);
  assert.doesNotMatch(options[1].label, /Recommended/);
  assert.match(options[2].label, /custom answer/i);
});

test('planChoiceOptions does not duplicate model-provided recommendation markers', () => {
  const options = planChoiceOptions(['Use npm with build step (recommended)', 'Use plain files (Recommended)']);

  assert.equal(options[0].label, 'Use npm with build step (Recommended)');
  assert.equal(options[1].label, 'Use plain files');
});

test('formatPlanAnswers sends all selected answers back together', () => {
  assert.equal(
    formatPlanAnswers([
      { prompt: 'Which route?', answer: 'Replace home page' },
      { prompt: 'Animations?', answer: 'No animations' },
    ]),
    'Answers to planning questions:\n1. Which route?\n   Replace home page\n2. Animations?\n   No animations'
  );
});

test('plan completion asks for approval and defaults to proceeding', () => {
  assert.match(PLAN_IMPLEMENT_PROMPT, /proceed/i);
  const options = planCompletionOptions();
  assert.deepEqual(options.map((option) => option.value), ['proceed', 'return']);
  assert.match(options[0].label, /\(Recommended\)$/);
  assert.equal(options[1].isEscape, true);
});

test('planActivityText shows elapsed planning seconds', () => {
  assert.equal(planActivityText(1_000, 4_600), 'planning... (4s)');
});

test('completePlanTurn restores the previous mode and starts approved implementation', () => {
  const messages = [{ role: 'system', content: 'plan system' }, { role: 'assistant', content: 'the approved plan' }];
  const result = completePlanTurn({
    choice: 'proceed',
    previousMode: 'auto',
    messages,
    cwd: 'C:\\project',
  });

  assert.equal(result.mode, 'auto');
  assert.match(result.messages[0].content, /Active mode: Auto/);
  assert.match(result.input, /implement the approved plan/i);
});

test('completePlanTurn restores the previous mode without implementation when declined', () => {
  const result = completePlanTurn({
    choice: 'return',
    previousMode: 'permission',
    messages: [{ role: 'system', content: 'plan system' }],
    cwd: 'C:\\project',
  });

  assert.equal(result.mode, 'permission');
  assert.match(result.messages[0].content, /Active mode: Default/);
  assert.equal(result.input, '');
});

test('parsePlanResponse extracts extended plan sections', () => {
  const response = `Short summary.

<!-- AURORA_PLAN_PROTOCOL
{"status":"complete","title":"modern landing page","context":["index.html (main page)"],"questions":[],"plan":["Add Tailwind CDN"],"files":[{"path":"index.html","change":"~","note":"redesign"}],"risks":["no backend"]}
-->`;
  const result = parsePlanResponse(response);
  assert.equal(result.status, 'complete');
  assert.equal(result.title, 'modern landing page');
  assert.deepEqual(result.context, ['index.html (main page)']);
  assert.deepEqual(result.plan, ['Add Tailwind CDN']);
  assert.deepEqual(result.files, [{ path: 'index.html', change: '~', note: 'redesign' }]);
  assert.deepEqual(result.risks, ['no backend']);
});

test('parsePlanResponse keeps sections on needs_input responses', () => {
  const response = `Summary.
<!-- AURORA_PLAN_PROTOCOL
{"status":"needs_input","title":"t","questions":[{"prompt":"Q?","choices":["A","B"]}],"plan":["step"]}
-->`;
  const result = parsePlanResponse(response);
  assert.equal(result.status, 'needs_input');
  assert.equal(result.title, 't');
  assert.deepEqual(result.plan, ['step']);
});

test('parsePlanResponse drops malformed file entries and non-string section items', () => {
  const response = `s
<!-- AURORA_PLAN_PROTOCOL
{"status":"complete","questions":[],"context":["ok", 42],"files":[{"path":"a.js","change":"~"},{"path":"b.js","change":"x"},{"change":"+"},"junk"],"risks":"not-an-array"}
-->`;
  const result = parsePlanResponse(response);
  assert.deepEqual(result.context, ['ok']);
  assert.deepEqual(result.files, [{ path: 'a.js', change: '~', note: '' }]);
  assert.deepEqual(result.risks, []);
});

test('parsePlanResponse legacy two-field protocol still parses with empty sections', () => {
  const response = `text
<!-- AURORA_PLAN_PROTOCOL
{"status":"complete","questions":[]}
-->`;
  const result = parsePlanResponse(response);
  assert.equal(result.status, 'complete');
  assert.equal(result.title, '');
  assert.deepEqual(result.context, []);
  assert.deepEqual(result.files, []);
});

test('hasStructuredPlan detects any populated section', () => {
  const empty = { title: '', context: [], plan: [], files: [], risks: [] };
  assert.equal(hasStructuredPlan(empty), false);
  assert.equal(hasStructuredPlan({ ...empty, title: 't' }), true);
  assert.equal(hasStructuredPlan({ ...empty, plan: ['step'] }), true);
  assert.equal(hasStructuredPlan({ ...empty, files: [{ path: 'a', change: '+', note: '' }] }), true);
});

test('hasStructuredPlan tolerates missing or partial shapes', () => {
  assert.equal(hasStructuredPlan({}), false);
  assert.equal(hasStructuredPlan(null), false);
  assert.equal(hasStructuredPlan({ title: 'x' }), true);
});


test('toolActivityLabel produces plain-language activity lines', () => {
  assert.equal(toolActivityLabel('list_files', {}), 'scanning files...');
  assert.equal(toolActivityLabel('write_file', { path: 'src/components/Cart.jsx' }), 'writing Cart.jsx...');
  assert.equal(toolActivityLabel('edit_file', { path: String.raw`a\b\index.html` }), 'editing index.html...');
  assert.equal(toolActivityLabel('read_file', { path: 'x.js' }), 'reading x.js...');
  assert.equal(toolActivityLabel('run_command', { command: 'npm test' }), 'running npm test...');
  assert.equal(toolActivityLabel('grep', { pattern: 'x' }), 'searching...');
  assert.equal(toolActivityLabel('mystery_tool', {}), 'mystery_tool...');
});

test('toolActivityLabel never includes raw JSON braces', () => {
  for (const name of ['list_files', 'write_file', 'edit_file', 'read_file', 'run_command', 'grep']) {
    const label = toolActivityLabel(name, { path: 'a.js', command: 'dir', pattern: 'p' });
    assert.doesNotMatch(label, /[{}"]/);
  }
});

test('commandProgressLabel shows the latest installer progress line', () => {
  assert.equal(commandProgressLabel('Downloading 10%\rDownloading 20%\r'), 'running... Downloading 20%');
});

test('commandProgressLabel includes elapsed time during silent command phases', () => {
  assert.equal(commandProgressLabel('Generating optimized autoload files', 42), 'running (42s)... Generating optimized autoload files');
});

test('reasoningActivityLabel retains the last command context', () => {
  assert.equal(reasoningActivityLabel('composer create-project laravel/laravel .', 5), 'reasoning after composer create-project laravel/laravel . (5s)...');
});

test('scaffoldCompletionGaps reports missing route, page sections, and build verification', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-scaffold-'));
  fs.mkdirSync(path.join(dir, 'routes'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'resources', 'views'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'artisan'), '');
  fs.writeFileSync(path.join(dir, 'routes', 'web.php'), "<?php\nRoute::get('/', fn () => view('welcome'));\n");
  fs.writeFileSync(path.join(dir, 'resources', 'views', 'app.blade.php'), '<html>@inertia()</html>');

  assert.deepEqual(scaffoldCompletionGaps(dir, []), [
    'Verify Laravel with php artisan --version.',
    'Add a named landing route in routes/web.php.',
    'Create a landing page with hero, features, CTA, and footer sections.',
    'Add Tailwind utility classes to the landing page.',
    'Run npm run build successfully.',
  ]);
});

test('scaffoldCompletionGaps accepts a complete Blade landing page and successful build', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-scaffold-'));
  fs.mkdirSync(path.join(dir, 'routes'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'resources', 'views'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'artisan'), '');
  fs.writeFileSync(path.join(dir, 'routes', 'web.php'), "<?php\nRoute::get('/', fn () => view('landing'))->name('landing');\n");
  fs.writeFileSync(path.join(dir, 'resources', 'views', 'landing.blade.php'), '<section class="flex">hero</section><section>features</section><section>CTA</section><footer>footer</footer>');

  assert.deepEqual(scaffoldCompletionGaps(dir, ['php artisan --version', 'npm run build']), []);
});

test('permissionSummary shows the tool and its target', () => {
  assert.equal(permissionSummary('write_file', { path: 'products.json' }), 'write_file → products.json');
  assert.equal(permissionSummary('run_command', { command: 'npm i' }), 'run_command → npm i');
});

test('createTickFilter harvests per-file summary lines and hides them from display', () => {
  let shown = '';
  const notes = [];
  const f = createTickFilter((t) => (shown += t), (file, note) => notes.push([file, note]));
  f('Working on it.\n');
  f('✓ index.html: updated product links and cart\n');
  f('All done');
  f.flush();
  assert.equal(shown, 'Working on it.\nAll done');
  assert.deepEqual(notes, [['index.html', 'updated product links and cart']]);
});

test('createTickFilter handles tick lines split across stream chunks', () => {
  let shown = '';
  const notes = [];
  const f = createTickFilter((t) => (shown += t), (file, note) => notes.push([file, note]));
  f('✓ prod');
  f('uct.html: Tailwind design\n');
  f.flush();
  assert.equal(shown, '');
  assert.deepEqual(notes, [['product.html', 'Tailwind design']]);
});

test('createTickFilter harvests a trailing tick line without newline on flush', () => {
  const notes = [];
  const f = createTickFilter(() => {}, (file, note) => notes.push(file));
  f('✓ cart.html: cart UI');
  f.flush();
  assert.deepEqual(notes, ['cart.html']);
});

test('PHANTOM_RETRY_PROMPT tells the model to apply changes with tools', () => {
  assert.match(PHANTOM_RETRY_PROMPT, /apply.*changes.*file tools/i);
});
