# Aurora Review Findings — Fix Design

Date: 2026-06-21

## Purpose

Address six findings from a code review of the Aurora CLI coding agent, plus four
smaller notes. Three are correctness bugs that break real flows; two are UX gaps;
the rest are polish. Each fix is surgical and covered by extending an existing test
file.

## Scope

In scope: findings 1–6 and the four minor notes below. Out of scope: the broader
architectural limitation that the REPL uses a single `client` for a model chain that
may span providers (noted for follow-up, not fixed here).

## Decisions (confirmed)

- **Interrupt**: Ctrl+C during a running turn cancels the turn and returns to the
  prompt; Ctrl+C at the idle prompt exits (unchanged).
- **Context meter**: rendered on the input prompt line, every loop.
- **Scope**: all six findings + four minor notes.

---

## Fix 1 — Narrow the fallback trigger (`src/agent.js`)

**Problem**: `const availability = err.status === 429 || err.status >= 400 || err.stalled;`
treats every 4xx as a retryable availability error. A 400 (malformed request/tool
schema), 401 (bad key), or 403 fails identically on every model in the chain, so the
chain is silently burned and only the last model's error surfaces — hiding the root
cause. The docstring already says the intent is "429/5xx".

**Fix**: 
```js
const availability =
  err.status === 429 || err.status >= 500 || err.status === 404 || err.stalled;
```
Keep 404 (model-not-found is worth failing over on a multi-model proxy). Let
400/401/403 propagate immediately.

**Test** (`test/agent.test.js`): a 400 on the head model throws immediately without
switching; a 503 (or `stalled`) switches to the next model. Verify `onModelSwitch`
fires only in the retryable cases.

---

## Fix 2 — Gate OpenRouter-only request params (`src/agent.js`)

**Problem**: `streamCompletion` unconditionally sends
`provider: { require_parameters: false, ... }` (and, under strict privacy,
`data_collection: 'deny'`). These are OpenRouter body extensions. Sent to
`api.openai.com` / Google / Anthropic (all reached via the OpenAI SDK with a
different `baseURL`), `provider` is an unrecognized parameter and the request 400s.
Combined with Fix 1's old behavior, an OpenAI-only or Google-only user's chain fails
on every model. `aurora models` still lists them, so the breakage is non-obvious.

**Fix**: detect OpenRouter from the client and attach the extensions only then.
```js
const isOpenRouter = /openrouter\.ai/i.test(client.baseURL ?? '');
const extra = isOpenRouter
  ? { provider: { require_parameters: false, ...(strictPrivacy ? { data_collection: 'deny' } : {}) } }
  : {};
// ...create({ ..., parallel_tool_calls: false, ...extra })
```
`parallel_tool_calls: false` is standard OpenAI and stays unconditional.

**Test** (`test/agent.test.js`): with a mock client whose `baseURL` is openrouter.ai,
the create call includes `provider`; with a non-OpenRouter `baseURL`, it does not.
After landing, smoke-test live with a direct OpenAI key to confirm completions work.

---

## Fix 3 — Don't orphan tool results when compacting (`src/context.js`)

**Problem**: `compactMessages` keeps `system + summary + last keepRecent` messages.
The slice boundary can drop an assistant message carrying `tool_calls` while keeping
its `tool` result, producing a `tool` message with no preceding assistant
`tool_calls`. The API requires every `tool` message to follow its matching
assistant call, so the next request 400s.

**Fix**: after computing the recent window, if its first message is `role: 'tool'`,
extend the window backward (decrement the cut index) until it begins on a non-`tool`
message — i.e. include the parent assistant `tool_calls` message. Cap the walk-back
so a pathological run of tool messages can't pull the entire history back.

**Test** (`test/context.test.js`): a history whose `-keepRecent` boundary lands on a
`tool` message compacts to a slice that starts with the assistant `tool_calls`
message; a history with no tool messages at the boundary is unaffected.

---

## Fix 4 — Interruptible turns (`src/repl.js`, `src/agent.js`)

**Problem**: `rl.on('SIGINT')` calls `process.exit(0)`. During a long turn (scaffolds
allow 60 iterations) the only way to stop a runaway model is to quit and lose the
session.

**Fix**:
- In `startRepl`, track whether a turn is in flight (`let turnAbort = null`).
- Replace the SIGINT handler: if `turnAbort`, call `turnAbort.abort()` and clear it
  (cancel the turn); otherwise exit as today.
- Per turn, create `turnAbort = new AbortController()` before `runTurn` and clear it
  in the `finally`. Pass `signal: turnAbort.signal` to `runTurn`.
- `runTurn` accepts `signal`, passes it to `streamCompletion`, which passes
  `{ signal }` as the OpenAI SDK request option. Also check `signal.aborted` between
  tool calls so a cancel during tool execution stops the loop promptly.
- Aborting throws an `AbortError`. `runTurn` must treat an abort as cancellation, not
  as an availability error (no model fallback) — re-throw a tagged error or return a
  `cancelled` marker. The REPL catches it, prints `dim('(turn cancelled)')`, and
  returns to the prompt. Partial assistant/tool messages already pushed to `messages`
  remain valid (an assistant message with tool_calls but no tool result would be
  invalid, so on cancel, drop any trailing assistant message that has unanswered
  `tool_calls`).

**Test** (`test/agent.test.js`): aborting the signal mid-stream rejects with a
cancellation that does NOT trigger `onModelSwitch`; `messages` is left in a valid
shape (no trailing assistant `tool_calls` without matching tool results).

---

## Fix 5 — Show the context meter on the prompt line (`src/repl.js`, `src/ui.js`)

**Problem**: `formatCtx`, `formatCtxMeter`, and `statusLine` are implemented and
tested but never called in the REPL. Compaction at 70% happens with no forewarning.

**Fix**: compute `pct = latestPromptTokens / contextLimit * 100` (using the head
model's `context`; `null` when unknown) and render `statusLine(cwd, chain, { pct })`
on the input prompt line each loop, just above the prompt rule. When tokens/limit are
unknown, `statusLine`/`formatCtxMeter` already return a neutral `--` / empty bar.

**Test** (`test/ui.test.js` already covers the formatters): add a `test/repl.test.js`
assertion that the prompt-render path includes the meter text when a pct is present.

---

## Fix 6 — Keep command lists in sync (`README.md`)

**Problem**: `COMMANDS` in `src/repl.js` is the source of truth for `/help`, Tab
completion, and the slash menu, but the README's "Useful commands" omits `/memory`,
`/remember`, `/forget`, and `/clear`.

**Fix**: add the missing commands to the README list. Low risk, docs-only.

---

## Minor notes

- **Chain-merge on `/provider`** (`src/repl.js` ~line 999): after adding a provider
  key, the code does `chain = models.slice(0, 3)`, discarding the user's curated
  fallback order. Merge newly available models in (append unseen ids) instead of
  replacing the chain.
- **Iteration-cap message** (`src/agent.js` ~line 99): the "Stopped after N tool
  iterations" `throw` renders as a red `[error]`. For the 60-iteration scaffold path
  it reads better as a turn-level notice. Surface it as a normal assistant/system
  message ("hit the iteration cap — here's what got done") rather than an error throw,
  or have the REPL catch this specific message and render it dim/yellow.
- **README/first-run validation reuse** (`bin/aurora.js` ~line 79): the first-run
  OpenRouter key prompt duplicates the `sk-` prefix rule that `PROVIDER_INFO` already
  encodes. Reuse the shared prefix data so the rule lives in one place.

## Testing strategy

Run `npm test` after each fix. Each fix extends its existing test file. Fix 2 and
Fix 4 additionally warrant a manual smoke test (direct OpenAI key for Fix 2; Ctrl+C
mid-scaffold for Fix 4) since they touch live provider/stream behavior.

## Risks

- Fix 4 is the largest change and touches raw-mode keypress / SIGINT handling, which
  is platform-sensitive (Windows conhost vs Windows Terminal). The abort path must
  leave `messages` in an API-valid state, or the next turn 400s.
- Fix 2's `client.baseURL` detection assumes the OpenAI SDK exposes `baseURL` on the
  instance (it does as of the pinned `openai@^6`). If a future SDK hides it, fall
  back to threading the provider id.
