# Changelog

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
