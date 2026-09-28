# omp-prompt-polish

An [omp](https://github.com/oh-my-pi) plugin marketplace, plus the `prompt-polish` extension.

## Install

### As a marketplace (recommended)

```
/marketplace add yd-zd/omp-prompt-polish
/marketplace install prompt-polish@omp-prompt-polish
```

From the shell:

```
omp plugin marketplace add yd-zd/omp-prompt-polish
omp plugin install prompt-polish@omp-prompt-polish
```

Add `--scope project` to install only for the current project.

### Straight from git

```
omp plugin install github:yd-zd/omp-prompt-polish
```

### Manually

Copy `plugins/prompt-polish/` into `~/.omp/agent/extensions/prompt-polish/` (user scope) or
`<project>/.omp/extensions/prompt-polish/` (project scope). The directory ships `index.ts`, which is
what omp auto-discovers.

**Restart omp after installing** — extension modules load when a session starts.

See [plugins/prompt-polish/README.md](plugins/prompt-polish/README.md) for setup (the `@promptfix`
model role), commands, and safety behaviour.

## Layout

```
.omp-plugin/marketplace.json   catalog (omp reads this path first)
plugins/prompt-polish/         the plugin itself
  package.json                 omp.extensions -> ./index.ts
  index.ts, core.ts            extension entry + pure logic
  core.test.ts                 unit tests for the pure logic
```

## Updating

```
omp plugin marketplace update omp-prompt-polish
omp plugin upgrade prompt-polish@omp-prompt-polish
```

Bumping a version means updating **both** `plugins/prompt-polish/package.json` and
`.omp-plugin/marketplace.json` (`plugins[0].version` and `metadata.version`) — the upgrade comparison
uses the catalog entry.

## Development

```bash
cd plugins/prompt-polish
npm test
```

Link the working copy into your local omp instead of installing from GitHub:

```
omp plugin link /absolute/path/to/omp-prompt-plugins/prompt-polish
omp plugin uninstall prompt-polish
```

`omp plugin link` symlinks into `~/.omp/plugins/node_modules/`, so edits to the checkout are picked up
by a session restart. To iterate on a copy that is already installed from the marketplace, link it and
uninstall the marketplace copy in the same scope.

## License

MIT — see [LICENSE](LICENSE).
