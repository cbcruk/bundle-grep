# bundle-grep

Archives git repositories as bundles and searches them with GitHub-style code
search queries through `git grep`. The roadmap lives in issue #14; `bundle-grep
ui` serves the search page from `apps/desktop`.

## Rules

@.claude/rules/jsdoc.md

## Working on this repo

- Runtime is Node.js 24; packages are managed with pnpm, tests run with Vitest,
  and the CLI is bundled with tsdown into the `bundle-grep` npm package.
- `packages/core` uses Node-compatible APIs (`node:child_process`, `node:fs`).
- Failures are values: return `Result` from `better-result` instead of throwing.
- `pnpm typecheck`, `pnpm lint`, `pnpm docs:check`, and `pnpm test` must pass
  before committing.
- Tests build throwaway repositories with `packages/core/test/fixture.ts`, which
  isolates git from the user's config.
