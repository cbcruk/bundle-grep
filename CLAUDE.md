# bundle-grep

Archives git repositories as bundles and searches them with GitHub-style code
search queries through `git grep`. The roadmap lives in issue #14; the desktop
app is built on [barlo](https://github.com/cbcruk/barlo).

## Rules

@.claude/rules/jsdoc.md

## Working on this repo

- Runtime is Bun; packages are managed with pnpm.
- `packages/core` uses Node-compatible APIs (`node:child_process`, `node:fs`) so
  it runs without barlo.
- Failures are values: return `Result` from `better-result` instead of throwing.
- `pnpm typecheck`, `pnpm lint`, `pnpm docs:check`, and `pnpm test` must pass
  before committing.
- Tests build throwaway repositories with `packages/core/test/fixture.ts`, which
  isolates git from the user's config.
