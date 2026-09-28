# Changelog

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
