# Changelog

## 0.1.1

- `cleanOutput` collapses a rewrite the model echoed as quoted text followed by
  the bare text (`"X"X`), which otherwise landed in the editor doubled.
- Every command is now reachable under three roots: `/polish`, `/promptfix`, and
  `/pp` — all with `:fix`, `:translate`, and `:undo` variants.

## 0.1.0

- Initial release: `prompt-polish` extension (`/polish`, `/polish:fix`,
  `/polish:translate`, `/polish:undo`).
