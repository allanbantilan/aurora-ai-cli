# Aurora CLI Polish Design

## Goal

Make Aurora easier to install, inspect, automate, and troubleshoot without changing the core agent loop. This pass addresses the DX audit findings:

- `aurora --help` currently enters startup instead of printing usage.
- There is no root onboarding documentation or changelog.
- Startup labels paid and free provider models under a misleading "Free tool-capable models" heading.
- Provider state is inferred from key shape before the CLI proves the provider can fetch models.
- The REPL works for humans, but there is no scriptable one-shot mode for CI or dogfooding.

## Scope

Implement the full CLI polish pass:

- Add first-class command parsing for help, chat, models, providers, doctor, and run.
- Preserve `aurora` as the default interactive REPL.
- Add scriptable one-shot execution through `aurora run ...` and `aurora --yes "task"`.
- Split startup into reusable helpers so help and provider inspection do not require network access.
- Fix provider and model labels to distinguish configured, usable, failed, free, and paid states.
- Add `README.md` and `CHANGELOG.md`.
- Update package metadata where it claims Aurora is only OpenRouter/free-model based.

Out of scope:

- Adding a command-framework dependency.
- Building an interactive one-shot permission prompt.
- Reworking the agent loop itself.
- Full multi-provider chain routing inside a single request sequence. This pass keeps model-chain selection provider-homogeneous unless the implementation also introduces provider-aware client routing.

## CLI Surface

Supported commands:

```text
aurora
aurora chat
aurora --help
aurora help
aurora models
aurora providers
aurora doctor
aurora run [options] "task"
aurora --model <id> --yes "task"
```

`aurora` remains the normal interactive chat and behaves like today's CLI after startup. `aurora chat` is an explicit alias.

`aurora --help` and `aurora help` print usage and exit with code `0`. They must not read credentials, fetch models, migrate config, or access Windows Credential Manager.

`aurora providers` reads local config and environment state, then prints provider setup status and setup URLs. It avoids network access.

`aurora models` loads credentials, fetches models from configured providers, prints usable model candidates with provider and tier labels, then exits.

`aurora doctor` checks Node version, config readability, provider credential presence, and model-fetch health. It prints actionable setup or repair steps and exits non-zero only for conditions that prevent Aurora from running.

`aurora run` executes one task and exits. The bare form `aurora --yes "task"` is accepted as a shorthand for `aurora run --yes "task"`.

## Startup Architecture

Add a small CLI bootstrap module, likely `src/cli.js`, to keep `bin/aurora.js` thin.

Proposed helpers:

```text
parseCliArgs(argv)
formatCliHelp()
loadRuntime({ requireCredentials })
resolveConfiguredProviders(apiKeys)
fetchUsableModels(apiKeys, telemetry)
selectDefaultProvider(models, providers, apiKeys)
```

`bin/aurora.js` should parse arguments first. Only commands that need credentials or network should perform those operations.

Credential loading behavior:

- Help: no config, credentials, or network.
- Providers: config and environment only.
- Models, doctor, chat, run: config, credentials, provider model fetches as needed.

Provider status vocabulary:

```text
not configured
configured
usable
fetch failed: <reason>
```

Model list heading:

```text
Available tool-capable models:
```

Each model row should include provider and tier:

```text
qwen3-coder (OpenRouter, free)
claude-sonnet-4-20250514 (Anthropic, paid)
```

OpenRouter free models remain preferred by default, but paid configured providers can appear honestly.

## Provider And Model Selection

The current entrypoint creates one client from a default provider while the model list can contain models from multiple providers. That mismatch must not get worse.

For this pass, model chains should be provider-homogeneous unless provider-aware request routing is implemented at the same time. Acceptable behavior:

- If the user selects an OpenRouter model, the OpenRouter client is used.
- If the user selects an Anthropic/OpenAI/etc. model, the matching provider client is used.
- If a fallback chain spans providers and provider-aware routing is not implemented, reject the chain with a clear message or filter it to the active provider.

This keeps user-visible provider labels truthful and prevents sending a provider-native model id to the wrong API base URL.

## One-Shot Execution

`aurora run "task"` uses the same agent loop as the REPL but without readline menus.

Flow:

1. Parse task and flags.
2. Load config and credentials.
3. Fetch usable models.
4. Resolve model chain:
   - `--model <id>` first.
   - Saved model chain second, if valid.
   - First preferred usable model otherwise.
5. Create non-interactive permissions.
6. Run one agent turn.
7. Print final assistant output and any existing done summary.
8. Exit with a meaningful status code.

Permission behavior:

- `--yes` maps to Auto mode semantics for file changes and shell commands.
- Without `--yes`, mutating tools are denied with: `This command needs --yes for file changes or shell commands.`
- Read-only tools may run without `--yes`.

One-shot mode intentionally has no slash commands, model picker, or interactive approval prompts. That makes it stable for CI and automated dogfooding.

Exit codes:

- `0`: task completed.
- Non-zero: empty task, unknown flag/command, missing credentials, no usable models, provider failure with no fallback, mutation required without `--yes`, or uncaught runtime error.

## Documentation

Add `README.md` with:

- What Aurora is.
- Requirements: Node 20+.
- Local install: `npm install`, `npm link`, `aurora`.
- API key setup: `OPENROUTER_API_KEY` and `/provider` for other providers.
- First interactive session.
- One-shot usage.
- Permission modes.
- Skills and agents.
- Troubleshooting startup, model, provider, and Windows credential issues.

Add `CHANGELOG.md` with:

- `Unreleased` section for the CLI polish changes.
- Existing `0.1.0` section with a short initial-release note.

Update `package.json` description to avoid claiming Aurora is only free/OpenRouter based. Preferred wording:

```text
CLI coding agent with tool use, provider fallback, and Laravel-aware workflows
```

## Error Handling

Required behavior:

- `--help`: exit `0`, no config/key/network access.
- No credentials for chat/models/doctor/run: clear setup message with provider URLs.
- Provider fetch failure: show provider name and reason, continue if another provider has usable models.
- No usable models: exit non-zero unless a saved offline fallback is used, and label fallback as offline/stale.
- `run` without a task: usage message, exit non-zero.
- `run` needs mutation without `--yes`: exit non-zero and name the exact flag to add.
- Unknown command or flag: usage hint, exit non-zero.

## Testing

Unit tests:

- `parseCliArgs` recognizes help, chat, models, providers, doctor, run, shorthand one-shot, `--model`, and `--yes`.
- `formatCliHelp` contains all public commands and exits without credential access.
- Provider status formatting distinguishes not configured, configured, usable, and fetch failed.
- Model list labels use "Available tool-capable models" and include free/paid tiers.
- One-shot permission denies mutating tools without `--yes`.
- One-shot permission allows mutating tools with `--yes`.
- Provider-homogeneous model-chain selection is enforced unless provider-aware routing is implemented.

Regression tests:

- Existing `npm test`.
- Existing `node scripts/eval.js`.

Manual smoke tests:

```text
node bin/aurora.js --help
node bin/aurora.js providers
node bin/aurora.js doctor
node bin/aurora.js models
node bin/aurora.js run --model <known-model> --yes "Reply with AURORA_OK"
node bin/aurora.js run --model <known-model> --yes "Create a scratch file and verify it"
```

## Acceptance Criteria

- A new developer can get from clone to first prompt using only `README.md`.
- `node bin/aurora.js --help` prints help without credentials or network.
- `node bin/aurora.js providers` prints configured provider state without network.
- Model lists no longer call paid models free.
- Provider fetch failures are visible and do not imply the provider is usable.
- `aurora run --yes "task"` can complete a one-shot live agent task and exit.
- `aurora run "mutating task"` fails clearly without `--yes`.
- All tests and offline evals pass.
