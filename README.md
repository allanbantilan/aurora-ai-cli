# Aurora

Aurora is a CLI coding agent with file tools, shell-command tools, provider fallback, and Laravel-aware workflows.

## Requirements

- Node.js 20 or newer
- At least one provider API key

## Install From This Repo

```bash
npm install
npm link
aurora --help
```

## Configure A Provider

OpenRouter is the default free-model path:

```bash
set OPENROUTER_API_KEY=sk-...
```

PowerShell:

```powershell
$env:OPENROUTER_API_KEY = "sk-..."
```

Inside Aurora, use `/provider` to add or remove providers.

## Interactive Usage

```bash
aurora
```

Useful commands:

- `/help`
- `/model`
- `/provider`
- `/permission`
- `/plan`
- `/skills`
- `/agents`
- `/exit`

## One-Shot Usage

```bash
aurora run --model <model-id> --yes "Create hello.txt with hello"
```

Omit `--yes` for read-only tasks. File changes and shell commands require `--yes` in one-shot mode.

## Inspection Commands

```bash
aurora providers
aurora models
aurora doctor
```

## Permission Modes

Default mode asks before file changes and shell commands. Auto mode allows them for the session. Plan mode is read-only.

## Troubleshooting

- `aurora --help` should work without API keys.
- If `aurora models` shows no usable models, run `aurora providers` and check your keys.
- If a provider says `fetch failed`, verify the key in that provider's dashboard.
- On Windows, Aurora can use Windows Credential Manager for saved provider keys.
