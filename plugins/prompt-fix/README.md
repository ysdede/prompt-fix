# prompt-fix

An [omp](https://github.com/oh-my-pi) extension that rewrites the prompt sitting in the editor, using a
model call **inside the omp process**. No `pi.exec`, no child `omp` process, no prompt sent to a
separate CLI.

| Command             | Shortcut     | Effect                                                                        |
| ------------------- | ------------ | ----------------------------------------------------------------------------- |
| `/polish`           | `Alt+P`      | Conservative polish: fix language errors, translate Turkish/mixed prose to English |
| `/polish:fix`       | `Alt+E`      | Spelling, grammar, and punctuation only; keeps the input language              |
| `/polish:translate` | `Alt+T`      | Minimal Turkish/mixed → technical English translation                          |
| `/polish:undo`      | `Alt+Shift+U`| Restore the draft from before the last rewrite                                  |
| `/polish:model`     | —            | Rank models for `@promptfix` by price, or set one: `/polish:model <provider/id>` |
| `/polish:bench`     | —            | Rewrite a sample through the top-ranked models and report latency and output   |

`/promptfix` and `/pp` are aliases: every command above is also available as
`/promptfix…` and `/pp…` (for example `/pp:translate <text>`). Use whichever root
you have in muscle memory.

`/polish <text>` rewrites the argument instead of the editor content, so it works when the editor is
empty (and in RPC mode, where the editor buffer is always empty).

The extension only ever writes the editor text. It never submits a turn.

## Install

From the marketplace (recommended):

```
/marketplace add ysdede/prompt-fix
/marketplace install prompt-fix@prompt-fix
```

Or straight from git:

```
omp plugin install github:ysdede/prompt-fix
```

Or copy the extension directory into `~/.omp/agent/extensions/prompt-fix/` (or
`<project>/.omp/extensions/prompt-fix/`) — the directory contains `index.ts`, which is what omp
auto-discovers.

**Restart the omp session after installing.** Extension modules are loaded when a session starts;
`/reload-plugins` refreshes skills, slash commands, and MCP servers, not extension modules.

## Setup

### 1. Model role

The extension resolves the model role `@promptfix`. Add it to `~/.omp/agent/config.yml`:

```yaml
modelRoles:
  promptfix: <provider>/<model-id>
```

Any `provider/model-id[:effort]` works — the model is reached via `ctx.models.resolve("@promptfix")`
and its API key comes from your normal omp credential store. A fast, non-reasoning **instruct-tuned**
model is the right fit for text editing.

If the role is missing, the extension fails loudly with that snippet instead of silently doing nothing.

Model fit matters more than raw capability here:

| Model kind                              | Result                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| agentic / tool-trained coding model     | Prepends agentic chatter (`I'll find the parser implementation and see ...`) in every mode |
| instruct-tuned chat model               | Obeys "return only the rewritten text"; produces a clean, minimal edit        |

Agentic coding models answer as if they were about to execute the task. If output ever sprouts
preambles, point the role at a fast instruct model.

### Finding a free or cheap model

`/polish:model` ranks the models your registry can reach: free first, then cheapest, then
non-reasoning. Bare it opens a picker; with a selector it sets the role directly. A `:high`-style
effort suffix is accepted and the model still shows as `current`.

```
/polish:model
/polish:model commandcode/inclusionai/ling-3.0-flash-sante:free
```

`/polish:bench` runs the same sample rewrite through the top-ranked models and reports latency and
output. A zero-cost label is not a guarantee — three OpenRouter `:free` models returned `404
unavailable for free` and one `commandcode` model answered `insufficient credits` — so bench a
candidate before trusting it.

### 2. Free `Alt+P` (optional)

omp ships `app.model.selectTemporary` bound to `alt+p`, which shadows the `/polish` shortcut. Remap
it in `~/.omp/agent/keybindings.json`:

```json
{
  "app.model.selectTemporary": "alt+shift+m"
}
```

`Alt+E`, `Alt+T`, and `Alt+Shift+U` are unbound by default. Run `/reload` after editing keybindings.
`/polish` as a command always works regardless of the shortcut.

## Safety behaviour

- **In-flight edits win.** The editor text is snapshotted before the model call. When the reply
  arrives the editor is re-read; if it differs from the snapshot the result is discarded and the
  user's edit is kept.
- **Conditional undo.** Undo records `{ previous, rewritten }` and only restores when the editor
  still holds exactly `rewritten`. If the draft was edited after the rewrite, undo refuses and
  touches nothing. Undo keeps up to 25 entries. The extension writes the editor through the
  extension API, so it does not rely on — or assume a place in — the editor's own `Ctrl+Z` history.
- **Draft is data, not instructions.** The draft is sent as a JSON string literal in a separate user
  message; the system prompt states it is untrusted text to be rewritten and that embedded directives
  must not be followed. JSON encoding means the draft cannot close the envelope and forge an extra
  message.
- **No hidden submissions.** The extension never submits a turn, and never overwrites a non-empty
  draft without the snapshot check passing.

## Cost

Each rewrite is one small, low-temperature (`0.1`), 4096-max-token model call on the model bound to
`@promptfix`, with a 60s timeout. It is not free; it uses the same provider and credentials omp
already has for you.

## Files

- `core.ts` — prompts, envelope encoding, output cleaning, apply/undo predicates, argument parsing
- `index.ts` — command/shortcut registration, model call, snapshot guard, undo stack
- `core.test.ts` — pure logic tests

## Implementation notes

- Model call: `completeSimple(model, { systemPrompt, messages }, { apiKey, temperature: 0.1, maxTokens: 4096, signal })`
  with `apiKey` from `ctx.modelRegistry.getApiKey(model)`.
- `@mariozechner/pi-ai` resolves through omp's compatibility shim onto the host's bundled package —
  still an in-process call, just an older specifier.
- `ctx.models` exists at runtime but is absent from the published `@mariozechner/pi-coding-agent`
  typings, so `index.ts` narrows that one surface.
- Output is post-processed (`cleanOutput`): code fences, `Here is the rewritten prompt:` preambles,
  and whole-answer quoting are stripped; quoting that is part of the draft is preserved.
- Per-mode behaviour is driven by the mode strings in `core.ts`; `polish` and `translate` are
  Turkish-aware, `fix` is language-preserving.

## Tests

```bash
npm test          # node --test core.test.ts
```

Requires Node 22.18+ (native TypeScript type stripping).

## License

MIT — see [LICENSE](../../LICENSE).
