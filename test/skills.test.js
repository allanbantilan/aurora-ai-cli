import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { activateSkills, discoverSkills, formatSkillCatalog } from '../src/skills.js';

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-skills-'));
  const home = path.join(base, 'home');
  const root = path.join(base, 'project');
  const cwd = path.join(root, 'packages', 'app');
  fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  const bundled = path.join(base, 'bundled');
  fs.mkdirSync(bundled, { recursive: true });
  return { home, root, cwd, bundled };
}

function skill(dir, name, frontmatter, body = 'Follow the workflow.') {
  const folder = path.join(dir, '.aurora', 'skills', name);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'SKILL.md'), `---\n${frontmatter}\n---\n\n${body}\n`);
}

test('discoverSkills loads global and project skills with project override precedence', () => {
  const { home, root, cwd, bundled } = fixture();
  skill(home, 'testing', 'name: testing\ndescription: Global testing workflow');
  skill(root, 'testing', 'name: testing\ndescription: Project testing workflow');
  skill(root, 'review', 'name: review\ndescription: Review the current changes');

  const skills = discoverSkills({ home, cwd, bundledDir: bundled });

  assert.deepEqual(skills.map(({ name, description, scope }) => ({ name, description, scope })), [
    { name: 'review', description: 'Review the current changes', scope: 'project' },
    { name: 'testing', description: 'Project testing workflow', scope: 'project' },
  ]);
});

test('discoverSkills loads bundled skills at the lowest precedence', () => {
  const { home, root, cwd } = fixture();
  const bundled = path.join(path.dirname(root), 'bundled');
  const bundledSkill = path.join(bundled, 'eloquent');
  fs.mkdirSync(bundledSkill, { recursive: true });
  fs.writeFileSync(path.join(bundledSkill, 'SKILL.md'), '---\nname: eloquent\ndescription: Bundled Eloquent workflow\nimplicit: true\n---\n\nBundled body.\n');
  skill(home, 'eloquent', 'name: eloquent\ndescription: Global Eloquent workflow');
  skill(root, 'review', 'name: review\ndescription: Project review workflow');

  const skills = discoverSkills({ home, cwd, bundledDir: bundled });

  assert.deepEqual(skills.map(({ name, scope }) => ({ name, scope })), [
    { name: 'eloquent', scope: 'global' },
    { name: 'review', scope: 'project' },
  ]);
});

test('bundled Eloquent skill activates implicitly and explicitly', () => {
  const skill = {
    name: 'eloquent',
    description: 'Eloquent models migrations relationships scopes soft deletes eager loading',
    implicit: true,
    body: 'Use Eloquent safely.',
  };

  assert.deepEqual(activateSkills('add a soft delete scope to the Eloquent Order model', [skill]).selected, [skill]);
  assert.deepEqual(activateSkills('$eloquent add a scope', [skill]), {
    input: 'add a scope',
    selected: [skill],
  });
  assert.deepEqual(activateSkills('write a Node.js CLI parser', [skill]).selected, []);
});

test('bundled skill descriptions are readable sentences', () => {
  const skills = discoverSkills();
  const bundled = skills.filter(({ scope }) => scope === 'bundled');

  assert.equal(bundled.length, 7);
  for (const skill of bundled) {
    assert.match(skill.description, /^(?:Build|Create|Design|Implement|Secure|Test|Use)\b/);
    assert.match(skill.description, /\.$/);
  }
});

test('discoverSkills ignores malformed definitions safely', () => {
  const { root, cwd, home, bundled } = fixture();
  skill(root, 'missing-description', 'name: missing-description');
  skill(root, 'bad-name', 'name: Bad Name\ndescription: invalid');
  skill(root, 'valid', 'name: valid-skill\ndescription: Valid skill\nimplicit: true');

  const skills = discoverSkills({ home, cwd, bundledDir: bundled });

  assert.equal(skills.length, 1);
  assert.equal(skills[0].name, 'valid-skill');
  assert.equal(skills[0].implicit, true);
  assert.match(skills[0].body, /Follow the workflow/);
});

test('formatSkillCatalog includes metadata without full skill bodies and respects budget', () => {
  const skills = [
    { name: 'review', description: 'Review changes', body: 'SECRET FULL BODY', file: 'x' },
    { name: 'test', description: 'Add tests', body: 'ANOTHER BODY', file: 'y' },
  ];

  const catalog = formatSkillCatalog(skills, { maxChars: 80 });

  assert.match(catalog, /\$review.*Review changes/);
  assert.doesNotMatch(catalog, /SECRET FULL BODY|ANOTHER BODY/);
  assert.ok(catalog.length <= 80);
});

test('activateSkills explicitly loads a named skill and removes the invocation marker', () => {
  const skills = [{ name: 'pest-testing', description: 'Add Laravel Pest tests', implicit: false, body: 'Use Pest.' }];

  assert.deepEqual(activateSkills('$pest-testing add coverage for orders', skills), {
    input: 'add coverage for orders',
    selected: [skills[0]],
  });
});

test('activateSkills conservatively selects implicit skills from description overlap', () => {
  const review = { name: 'security-review', description: 'Review PHP code for security vulnerabilities', implicit: true, body: 'Review safely.' };
  const docs = { name: 'write-docs', description: 'Write product documentation', implicit: true, body: 'Document.' };

  assert.deepEqual(activateSkills('review this PHP controller for security vulnerabilities', [review, docs]).selected, [review]);
  assert.deepEqual(activateSkills('fix this controller', [review, docs]).selected, []);
});

test('activateSkills bounds loaded content and reports unknown explicit skills', () => {
  const large = { name: 'large', description: 'Large workflow', implicit: false, body: 'x'.repeat(1000) };
  assert.equal(activateSkills('$large run it', [large], { maxChars: 100 }).selected[0].body.length, 100);
  assert.deepEqual(activateSkills('$missing run it', [large]), {
    input: '$missing run it',
    selected: [],
    error: 'Unknown skill: $missing',
  });
});
