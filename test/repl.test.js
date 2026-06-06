import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyModeSelection,
  autoConfirmationOptions,
  AUTO_WARNING,
  buildInputPrompt,
  createEchoSuppressor,
  claimsUnappliedChanges,
  completeCommand,
  commandList,
  modeOptions,
  beginPlanTurn,
  completePlanTurn,
  formatPlanAnswers,
  parsePlanResponse,
  planActivityText,
  planChoiceOptions,
  planCompletionOptions,
  endPlanTurn,
  PLAN_IMPLEMENT_PROMPT,
  PLAN_PROMPT,
  promoteModel,
  shouldConfirmAuto,
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
  assert.deepEqual(hits, ['/model', '/permission', '/plan', '/clear', '/help', '/exit']);
});

test('completeCommand returns no hits for non-command input', () => {
  assert.deepEqual(completeCommand('hello'), [[], 'hello']);
  assert.deepEqual(completeCommand('/nope'), [[], '/nope']);
});

test('commandList includes every command with a description', () => {
  const text = commandList();
  for (const c of ['/model', '/permission', '/plan', '/clear', '/help', '/exit']) assert.match(text, new RegExp(c.replace('/', '\\/')));
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

test('parsePlanResponse safely treats missing or malformed protocol as complete', () => {
  assert.deepEqual(parsePlanResponse('plain plan'), { text: 'plain plan', status: 'complete', questions: [] });
  const malformed = parsePlanResponse('visible\n<!-- AURORA_PLAN_PROTOCOL\nnope\n-->');
  assert.equal(malformed.text, 'visible');
  assert.equal(malformed.status, 'complete');
  assert.deepEqual(malformed.questions, []);
});

test('planChoiceOptions marks the first choice recommended and adds custom answer', () => {
  const options = planChoiceOptions(['Use existing route', 'Add new route']);
  assert.deepEqual(options.map((o) => o.value), [0, 1, 'custom']);
  assert.match(options[0].label, /\(Recommended\)$/);
  assert.doesNotMatch(options[1].label, /Recommended/);
  assert.match(options[2].label, /custom answer/i);
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

