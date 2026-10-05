# Changelog

## 0.1.5

- Local models are skipped by `/polish:model` instead of being offered as
  candidates. A llama.cpp server on the LAN is not a hosted model, so it no longer
  appears in the list — and `/polish:model lama225/qwen3.8-27b` is refused rather
  than written. Set a local model by editing `modelRoles.promptfix` directly if you
  want one.

## 0.1.4

Fixes from a review of 0.1.3. Three of these were silent — the wrong result
arrived with no error.

- **The model picker now works.** `ctx.ui.select` is positional; it was being
  called with an options object, which threw inside the host and was swallowed by
  a catch-all that fell back to a text list. The picker never opened.
- **`cleanOutput` no longer deletes the draft's own opening line.** A draft like
  `Here is the error: TypeError: …` had `Here is the error:` stripped out of the
  result, because the preamble stripper could not tell the model's opener from the
  user's. It now takes the draft and leaves the user's words alone.
- **A preamble in front of a fenced answer is cleaned.** Both orders now strip,
  where previously the literal ``` reached the editor.
- **The echo collapse handles typographic quotes.** `“X”X` never matched, because
  the closing quote had to equal the opening one.
- **Free-tier caveats are no longer attached to local models.** A llama.cpp server
  on the LAN is not a shared tier and cannot reject a request.
- **A model with no price data is no longer ranked as free.** It is labelled
  `price unknown` and sorted after every known price.
- **`provider/id:high` works on the explicit path and still marks as current**, so
  bench no longer re-measures the model already in use.
- **The picker validates its result** against the models it offered before writing
  anything, so a cancelled or unusual dialog cannot persist a null or a number.
- **Bench takes the single-flight guard** and uses its own status key, so a bench
  and a rewrite can no longer erase each other's progress line.

## 0.1.3

- New `/polish:model` (also `/promptfix:model`, `/pp:model`): ranks the chat
  models your own registry can reach, free first, then cheapest, then
  non-reasoning. Bare it opens a picker; with a selector
  (`/polish:model opencode-go/deepseek-flash`) it sets the role directly.
- New `/polish:bench` (also `/promptfix:bench`, `/pp:bench`): runs the same
  sample rewrite through the top-ranked models and reports measured latency and
  the text each one produced. A zero-cost label is not a guarantee — three
  OpenRouter `:free` models and one `commandcode` model listed as free were
  rejected by their providers, and bench is what shows that.

## 0.1.2

- Renamed the repository, marketplace, and plugin to `prompt-fix` (was
  `omp-prompt-polish`). GitHub redirects the old URL, but existing installs must
  re-add the marketplace: `/marketplace add ysdede/prompt-fix` then
  `/marketplace install prompt-fix@prompt-fix`.
- The slash commands are unchanged: `/polish`, `/promptfix`, and `/pp`, each with
  `:fix`, `:translate`, and `:undo`. The model role is still `@promptfix`.

## 0.1.1

- `cleanOutput` collapses a rewrite the model echoed as quoted text followed by
  the bare text (`"X"X`), which otherwise landed in the editor doubled.
- Every command is now reachable under three roots: `/polish`, `/promptfix`, and
  `/pp` — all with `:fix`, `:translate`, and `:undo` variants.

## 0.1.0

- Initial release: `prompt-polish` extension (`/polish`, `/polish:fix`,
  `/polish:translate`, `/polish:undo`).
