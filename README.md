# prompt-fix

An [omp](https://github.com/oh-my-pi) plugin marketplace, plus the `prompt-fix` extension.

## Install

### As a marketplace (recommended)

```
/marketplace add ysdede/prompt-fix
/marketplace install prompt-fix@prompt-fix
```

From the shell:

```
omp plugin marketplace add ysdede/prompt-fix
omp plugin install prompt-fix@prompt-fix
```

Add `--scope project` to install only for the current project.

### Straight from git

```
omp plugin install github:ysdede/prompt-fix
```

### Manually

Copy `plugins/prompt-fix/` into `~/.omp/agent/extensions/prompt-fix/` (user scope) or
`<project>/.omp/extensions/prompt-fix/` (project scope). The directory ships `index.ts`, which is
what omp auto-discovers.

**Restart omp after installing** — extension modules load when a session starts.

See [plugins/prompt-fix/README.md](plugins/prompt-fix/README.md) for setup (the `@promptfix`
model role), commands, and safety behaviour.

## Layout

```
.omp-plugin/marketplace.json   catalog (omp reads this path first)
plugins/prompt-fix/            the plugin itself
  package.json                 omp.extensions -> ./index.ts
  index.ts, core.ts            extension entry + pure logic
  core.test.ts                 unit tests for the pure logic
```

## Updating

```
omp plugin marketplace update prompt-fix
omp plugin upgrade prompt-fix@prompt-fix
```

Bumping a version means updating **both** `plugins/prompt-fix/package.json` and
`.omp-plugin/marketplace.json` (`plugins[0].version` and `metadata.version`) — the upgrade comparison
uses the catalog entry.

The slash commands are `/polish`, `/promptfix`, and `/pp` — the repo, marketplace, and plugin are
named `prompt-fix`, but the commands you type keep all three spellings.

## Development

```bash
cd plugins/prompt-fix
npm test
```

Link the working copy into your local omp instead of installing from GitHub:

```
omp plugin link /absolute/path/to/prompt-fix/plugins/prompt-fix
omp plugin uninstall prompt-fix
```

`omp plugin link` symlinks into `~/.omp/plugins/node_modules/`, so edits to the checkout are picked up
by a session restart. To iterate on a copy that is already installed from the marketplace, link it and
uninstall the marketplace copy in the same scope.

## License

MIT — see [LICENSE](LICENSE).
