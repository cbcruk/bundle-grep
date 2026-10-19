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
bundle-grep sync git@example.com:a/b.git # any git URL, or a local path such as ./repo
bundle-grep search useState language:typescript -is:fork
bundle-grep list
bundle-grep restore                      # rebuild search caches from the bundles
bundle-grep ui                           # open the search window (needs a local Chrome)
```

Everything lives under `--root`, else `$BUNDLE_GREP_ROOT`, else
`~/.bundle-grep`: bundles and metadata in `archive/`, and search caches, which
`restore` can always rebuild, in `cache/`. `search` exits 0 when something
matched, 1 when nothing did, and 2 on an error. With `--json`, `list` prints a
JSON array and the other commands one JSON object per line.

### Query syntax

Queries follow
[GitHub code search syntax](https://docs.github.com/en/search-github/github-code-search/understanding-github-code-search-syntax):
terms, `"phrases"`, `/regular expressions/`, the qualifiers `content:`,
`path:`, `repo:`, `org:`, `user:`, `language:` and `is:fork`/`is:archived`,
`AND`, `OR`, `NOT`, `-` and parentheses. Matching ignores case, and `\"` and
`\\` escape a quote or a backslash inside or outside a phrase. Inside
`/.../` only `\/` is unescaped, and the rest is passed on as written.

A `path:` value that starts and ends with `/` is a regular expression, so
`path:/src/` matches `src` anywhere in the path. For files under a top-level
`src` directory, write the glob `path:/src/**` or the expression
`path:/^src\//`.

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
| `apps/desktop` | The search window: a [barlo](https://github.com/cbcruk/barlo) app over a local-only server |
