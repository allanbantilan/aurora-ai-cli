#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient, fetchFreeToolModels } from '../src/client.js';
import { runTurn } from '../src/agent.js';
import { systemPrompt } from '../src/prompt.js';
import { activateSkills, discoverSkills, formatSkillCatalog } from '../src/skills.js';
import * as toolRegistry from '../src/tools/index.js';

const allowAll = { check: async () => ({ allowed: true }) };

export function loadEvalFixtures(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => JSON.parse(fs.readFileSync(path.join(dir, entry.name), 'utf8')))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function toolCallChunks(index, response) {
  const args = JSON.stringify(response.args ?? {});
  return [
    {
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: `eval-${index}`,
            function: { name: response.tool, arguments: args },
          }],
        },
      }],
    },
  ];
}

function cannedClient(responses) {
  let index = 0;
  return {
    chat: {
      completions: {
        create: async () => {
          const response = responses[index++];
          if (!response) throw new Error('Eval fixture exhausted canned responses');
          const chunks = response.tool
            ? toolCallChunks(index, response)
            : [{ choices: [{ delta: { content: response.content ?? '' } }] }];
          return {
            async *[Symbol.asyncIterator]() {
              for (const chunk of chunks) yield chunk;
            },
          };
        },
      },
    },
  };
}

function scopedTools(cwd) {
  return {
    definitions: toolRegistry.definitions,
    executeTool: (name, args, options) => toolRegistry.executeTool(name, args, cwd, options),
  };
}

function seedFiles(cwd, files = {}) {
  for (const [relPath, content] of Object.entries(files)) {
    const file = path.resolve(cwd, relPath);
    if (file !== cwd && !file.startsWith(`${cwd}${path.sep}`)) throw new Error(`Eval fixture path escapes cwd: ${relPath}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

function evaluateExpectations(fixture, cwd, tools, finalText, skills) {
  const failures = [];
  if (fixture.expect?.tools && JSON.stringify(tools) !== JSON.stringify(fixture.expect.tools)) {
    failures.push(`Expected tools ${JSON.stringify(fixture.expect.tools)}, got ${JSON.stringify(tools)}`);
  }
  for (const forbidden of fixture.expect?.forbidTools ?? []) {
    if (tools.includes(forbidden)) failures.push(`Used forbidden tool ${forbidden}`);
  }
  if (fixture.expect?.skills && JSON.stringify(skills) !== JSON.stringify(fixture.expect.skills)) {
    failures.push(`Expected skills ${JSON.stringify(fixture.expect.skills)}, got ${JSON.stringify(skills)}`);
  }
  const verification = fixture.expect?.verification;
  if (verification) {
    const modificationIndex = tools.lastIndexOf(verification.after);
    const verificationIndex = tools.findIndex((tool, index) => index > modificationIndex && tool === verification.tool);
    if (modificationIndex < 0 || verificationIndex < 0) {
      failures.push(`Expected verification tool ${verification.tool} after ${verification.after}`);
    }
  }
  for (const expected of fixture.expect?.files ?? []) {
    const file = path.join(cwd, expected.path);
    if (!fs.existsSync(file)) {
      failures.push(`Expected file ${expected.path} to exist`);
      continue;
    }
    const content = fs.readFileSync(file, 'utf8');
    if (expected.contains && !content.includes(expected.contains)) {
      failures.push(`Expected ${expected.path} to contain ${JSON.stringify(expected.contains)}`);
    }
  }
  for (const expected of fixture.expect?.contains ?? []) {
    if (!finalText.toLowerCase().includes(String(expected).toLowerCase())) {
      failures.push(`Final response did not contain expected text ${JSON.stringify(expected)}`);
    }
  }
  for (const forbidden of fixture.expect?.forbid ?? []) {
    if (finalText.toLowerCase().includes(String(forbidden).toLowerCase())) {
      failures.push(`Final response contained forbidden text ${JSON.stringify(forbidden)}`);
    }
  }
  return failures;
}

export async function runEvalFixture(fixture, { client, model = 'offline/canned' } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-eval-'));
  const tools = [];
  let finalText = '';
  try {
    seedFiles(cwd, fixture.files);
    const availableSkills = discoverSkills({ cwd });
    const activation = activateSkills(fixture.prompt, availableSkills);
    const activeSkillText = activation.selected
      .map((skill) => `## Active skill: $${skill.name}\n${skill.body}`)
      .join('\n\n');
    const userContent = [activation.input, activeSkillText].filter(Boolean).join('\n\n');
    const messages = [
      { role: 'system', content: systemPrompt(cwd, 'permission', { skillCatalog: formatSkillCatalog(availableSkills) }) },
      { role: 'user', content: userContent },
    ];
    await runTurn({
      client: client ?? cannedClient(fixture.responses ?? []),
      models: [model],
      messages,
      tools: scopedTools(cwd),
      permissions: allowAll,
      onText: (text) => {
        finalText += text;
      },
      onToolEnd: (name) => tools.push(name),
      retryDelayMs: 0,
    });
    const skills = activation.selected.map((skill) => skill.name);
    const failures = evaluateExpectations(fixture, cwd, tools, finalText, skills);
    return { name: fixture.name, passed: failures.length === 0, failures, tools, skills, finalText };
  } catch (error) {
    return { name: fixture.name, passed: false, failures: [error.message], tools, skills: [], finalText };
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

export async function runEvals({ live = false, model, fixturesDir = path.join(process.cwd(), 'test', 'evals') } = {}) {
  const fixtures = loadEvalFixtures(fixturesDir);
  let client;
  let selectedModel = model;
  if (live) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('Live evals require OPENROUTER_API_KEY');
    selectedModel ??= (await fetchFreeToolModels())[0]?.id;
    if (!selectedModel) throw new Error('No free tool-capable model is available for live evals');
    client = createClient(apiKey);
  }
  return Promise.all(fixtures.map((fixture) => runEvalFixture(fixture, { client, model: selectedModel })));
}

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes('--live');
  const modelIndex = args.indexOf('--model');
  const model = modelIndex >= 0 ? args[modelIndex + 1] : undefined;
  const results = await runEvals({ live, model });
  for (const result of results) {
    console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}${result.failures.length ? `: ${result.failures.join('; ')}` : ''}`);
  }
  const passed = results.filter((result) => result.passed).length;
  console.log(`${passed}/${results.length} evals passed`);
  if (passed !== results.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL eval runner: ${error.message}`);
    process.exitCode = 1;
  });
}
