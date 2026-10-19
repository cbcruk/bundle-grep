# bundle-grep

Archive your git repositories as bundles and search them with
[GitHub code search](https://github.com/search) syntax, run locally through
`git grep`.

> Work in progress. See the [roadmap](https://github.com/cbcruk/bundle-grep/issues/14).

## Usage

Requires [Bun](https://bun.com), git, and, for GitHub sources, a logged-in
[`gh`](https://cli.github.com).

```sh
bundle-grep sync cbcruk                  # every repository of a user or organisation
bundle-grep sync cbcruk/barlo            # one GitHub repository
bundle-grep sync git@example.com:a/b.git # any git URL or local path
bundle-grep search 'useState language:typescript -is:fork'
bundle-grep list
bundle-grep restore                      # rebuild search caches from the bundles
```

Everything lives under `~/.bundle-grep`, or `$BUNDLE_GREP_ROOT`, or `--root`:
bundles and metadata in `archive/`, and search caches, which `restore` can
always rebuild, in `cache/`. `search` exits 0 when something matched, 1 when
nothing did, and 2 on an error; `--json` prints one JSON object per event.

## Development

Requires [Bun](https://bun.com) >= 1.3.12, pnpm, and git.

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm docs:check
pnpm test
```

## Packages

| Package | Purpose |
| --- | --- |
| `packages/core` | Sync and restore bundles, parse and compile queries, run searches |
| `packages/cli` | The `bundle-grep` command |
