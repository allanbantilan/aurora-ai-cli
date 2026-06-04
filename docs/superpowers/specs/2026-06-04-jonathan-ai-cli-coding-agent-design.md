# jonathan-ai — CLI Coding Agent Design

**Date:** 2026-06-04
**Status:** Approved

## Overview

`jonathan-ai` is an interactive CLI coding agent written in Node.js (ESM, Node 20+),
in the style of Codex / Claude Code, powered exclusively by **free models on
OpenRouter**. It runs as a persistent REPL chat session in the terminal, can read
and edit files, search the codebase, and run shell commands in an agent loop,
asking the user's permission before risky actions.

**Audience:** personal tool first. Installed locally via `npm link`. Success for
v1 = it can complete real coding tasks in the user's own projects. Publishing and
polish come later.

## Architecture

Layers, top to bottom:

1. **CLI entry** (`bin/jonathan.js`) — starts the app, loads config, runs the
   model picker if no model is selected, hands off to the REPL.
2. **REPL** (`src/repl.js`) — readline-based chat prompt with streamed model
   output. Slash commands: `/model` (switch model), `/clear` (reset
   conversation), `/help`, `/exit`.
3. **Agent loop** (`src/agent.js`) — for each user message: send conversation to
   the model → stream the response → if the model requested tool calls, get
   permission (for writes/commands), execute, append results to the
   conversation, loop back to the model. Repeats until the model responds with
   plain text. Hard cap of **15 tool-call iterations** per user request.
4. **OpenRouter client** (`src/client.js`) — the `openai` npm SDK pointed at
   `https://openrouter.ai/api/v1`. Also fetches the model catalog from
   `GET /api/v1/models`.
5. **Tools** (`src/tools/`) — one module per tool; each exports a JSON-schema
   tool definition and an `execute(args)` function.

### Project structure

```
jonathan-ai/
  bin/jonathan.js        # entry point (shebang, arg parsing, boot)
  src/
    repl.js              # readline loop, slash commands, streaming display
    agent.js             # agent loop: model <-> tools orchestration
    client.js            # OpenRouter API client + model list fetch/filter
    config.js            # API key + last-used model (~/.jonathan-ai/config.json)
    prompt.js            # system prompt
    permissions.js       # y/a/n confirmation flow with previews
    tools/
      index.js           # registry: definitions array + dispatch
      read-file.js
      list-files.js
      grep.js
      write-file.js
      edit-file.js
      run-command.js
  test/                  # node:test suites
  package.json           # type: module, bin entry, deps: openai (+ minimal others)
```

## Configuration

- API key: `OPENROUTER_API_KEY` env var, falling back to
  `~/.jonathan-ai/config.json`. First run with no key prompts the user to paste
  one and saves it to the config file.
- Config file also stores the last-used model id; it becomes the default
  selection on next launch.

## Model selection

- Fetch the live model list from OpenRouter (`GET /api/v1/models`).
- Filter to models where **prompt and completion pricing are both `0`** and
  `supported_parameters` includes `tools` (native tool calling). Models without
  tool support are excluded entirely — the agent loop requires it.
- Present as a numbered menu at startup (defaulting to last-used model);
  switchable mid-session at any time via `/model`.

## System prompt

Short and directive — free models are small and long prompts degrade them.
Contents: role (coding agent), working directory (`process.cwd()`), available
tools, guidance to read files before editing, keep changes minimal, and use
exact strings with `edit_file`.

## Tools

| Tool | Behavior | Permission |
|---|---|---|
| `read_file` | Read a file with line numbers; truncate very large files | free |
| `list_files` | List a directory or glob pattern (e.g. `src/**/*.js`) | free |
| `grep` | Regex search across files; return matching lines with locations | free |
| `write_file` | Create or overwrite a file | ask |
| `edit_file` | Exact find-and-replace within a file | ask |
| `run_command` | Run a shell command in cwd; capture stdout/stderr; 60s timeout | ask |

- **Path safety:** all file tools resolve paths and refuse to operate outside
  the current working directory.
- **Result truncation:** tool results are truncated to ~8k characters before
  being sent back to the model (free models have small context windows).

## Permission flow

Before any `write_file`, `edit_file`, or `run_command` executes, the user sees
a preview — a diff for edits, full content for new files, the command string
for shell — and answers:

- `y` — allow once
- `a` — always allow this tool for the rest of the session
- `n` — deny; the denial is returned to the model as the tool result so it can
  adjust its approach

Read-only tools (`read_file`, `list_files`, `grep`) run without prompting.

## Agent loop details

- Max 15 tool-call iterations per user request; on exceeding the cap, stop and
  inform the user.
- Malformed tool calls (unknown tool, invalid args) never crash the loop — the
  error text is returned as the tool result so the model can self-correct.
- Conversation state is an in-memory message array per session; `/clear`
  resets it. No persistence in v1.

## Error handling

Free models and free tiers are flaky; errors must be loud and actionable:

- **429 rate limits:** retry with backoff (2 attempts); if still failing,
  report clearly and suggest `/model` to switch. Never hang silently.
- **Mid-stream failure:** discard the partial assistant message, report the
  error, keep the conversation array consistent.
- **Provider errors (5xx, model offline):** one-line error + suggestion to
  switch models.
- **Model list fetch failure at startup:** fall back to the last-used model
  from config so the app still starts.
- **Tool execution errors** (missing file, failed command): returned to the
  model as the tool result; never crash.

## Testing

Node's built-in `node:test` runner; no extra test framework.

- **Tool unit tests:** real temp directories; assert read/write/edit/glob/grep
  behavior and rejection of paths escaping cwd.
- **Agent loop tests:** a fake client stub returning scripted responses
  (tool call → text, malformed tool call, repeated calls hitting the iteration
  cap, user denial) verifies orchestration without network access.
- **Model filter test:** fixture of the OpenRouter `/models` payload; assert
  only free + tool-capable models survive filtering.
- Live-API behavior is verified manually in v1 (depends on third-party uptime).

## Out of scope for v1

- Conversation persistence / resume
- Auto-fallback model chains
- Prompt-based tool calling for non-tool models
- Rich TUI (Ink), syntax highlighting
- npm publishing, cross-platform hardening beyond Windows + POSIX basics
- Sub-agents, MCP, web search
