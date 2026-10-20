# bundle-grep

Archive your git repositories as bundles and search them with
[GitHub code search](https://github.com/search) syntax, run locally through
`git grep`.

## Install

Each [release](https://github.com/cbcruk/bundle-grep/releases) has a
self-contained binary for macOS and Linux (glibc), on arm64 and x64, with a
`SHA256SUMS` file. Download the one for your platform — `darwin-arm64`,
`darwin-x64`, `linux-x64` or `linux-arm64` — with `gh` into an empty
directory, check it, and put `bundle-grep` on your `PATH`:

```sh
cd "$(mktemp -d)"
gh release download --repo cbcruk/bundle-grep --pattern '*-darwin-arm64.tar.gz' --pattern SHA256SUMS
shasum -a 256 --check --ignore-missing SHA256SUMS   # sha256sum --check --ignore-missing on Linux
tar -xzf bundle-grep-*.tar.gz
mkdir -p ~/.local/bin && mv bundle-grep ~/.local/bin/   # add ~/.local/bin to PATH if it is not there
bundle-grep --version
```

The binaries are not signed. macOS blocks a binary downloaded through a
browser until you clear its quarantine flag with
`xattr -d com.apple.quarantine bundle-grep`; `gh` and `curl` do not set it.

## Usage

Requires git, and, for GitHub sources, a logged-in
[`gh`](https://cli.github.com). Running from a checkout instead of a release
binary also requires [Bun](https://bun.com).

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

### Keeping the archive current

`sync` syncs 8 repositories at a time (`--concurrency`), or one at a time for
ssh URLs at a terminal, so that ssh prompts do not interleave. An https URL
that git rewrites to ssh through `url.<base>.insteadOf` still counts as https,
so pass `--concurrency 1` if ssh may prompt then. Before fetching
a repository it lists the remote's branches and tags, and it skips the fetch
when the cache already holds exactly those, so rerunning `sync` over an
unchanged account costs one round trip per repository. `sync` and `restore`
lock each repository they update, and a second run on the same repository
fails for it rather than racing, so overlapping scheduled runs are safe. A
lock left by a run that was killed, or from before a reboot, is taken over.

To run it on a schedule, give the scheduler the binary's absolute path and a
`PATH` where it finds `git` and `gh`. On macOS, use a launchd agent: `gh`
keeps its token in the login keychain, which cron jobs may not be able to
read. Save this as `~/Library/LaunchAgents/com.example.bundle-grep.plist`,
with your own paths and source, and load it with
`launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.example.bundle-grep.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.example.bundle-grep</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/you/.local/bin/bundle-grep</string>
    <string>sync</string>
    <string>cbcruk</string>
    <string>--json</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/opt/homebrew/bin:/usr/bin:/bin</string></dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>/Users/you/.bundle-grep/sync.log</string>
  <key>StandardErrorPath</key><string>/Users/you/.bundle-grep/sync.log</string>
</dict>
</plist>
```

On Linux, a cron line does the same, here every night at 3:00:

```cron
0 3 * * * PATH=/usr/local/bin:/usr/bin:/bin $HOME/.local/bin/bundle-grep sync cbcruk --json >> $HOME/.bundle-grep/sync.log 2>&1
```

Nobody is at the terminal then, so unless `GIT_SSH_COMMAND`, `GIT_SSH` or
`core.sshCommand` chooses an ssh command, ssh runs in batch mode and fails
rather than prompting. The exit code is 1 when some repository failed, and
each failure is a `failed` line in the log.

### Query syntax

Queries follow
[GitHub code search syntax](https://docs.github.com/en/search-github/github-code-search/understanding-github-code-search-syntax):
terms, `"phrases"`, `/regular expressions/`, the qualifiers `content:`,
`path:`, `symbol:`, `repo:`, `org:`, `user:`, `language:` and
`is:fork`/`is:archived`, `AND`, `OR`, `NOT`, `-` and parentheses. Matching
ignores case, and `\"` and `\\` escape a quote or a backslash inside or
outside a phrase. Inside `/.../` only `\/` is unescaped, and the rest is
passed on as written.

A `path:` value that starts and ends with `/` is a regular expression, so
`path:/src/` matches `src` anywhere in the path. For files under a top-level
`src` directory, write the glob `path:/src/**` or the expression
`path:/^src\//`.

`symbol:` finds definitions — functions, methods, classes, types and the
like — rather than every mention: `symbol:useState` matches a definition named
`useState`, ignoring case, and `symbol:/^use/` any whose name starts with
`use`. Definitions are found with [tree-sitter](https://tree-sitter.github.io)
in C, C#, C++, Go, Java, JavaScript, Python, Ruby, Rust, TypeScript and TSX
files under 1 MiB. `sync` and `restore` index each repository's default
branch, and a search indexes one it finds without an index; an index only
parses the files that changed since the last one.

A definition inside a class, struct, interface, enum, trait, module or
namespace is also known by the names around it, as is a Go method by its
receiver and a Rust one by its `impl`. A `symbol:` value with a `.` or `::`
in it matches the end of such a name, so `symbol:Maint.deleteRows` finds the
`deleteRows` method of `Maint` and not other `deleteRows`. Either separator
works in any language, as do regular expressions:
`symbol:/^String::to_/` finds the methods of `String` that start with `to_`.
A regular expression is only compared with these longer names when it holds
`::` or an escaped `\.`.

`ref:` searches a branch, tag or commit instead of the default branch:
`ref:v1.0 useState`. Repositories without that ref are skipped, and results
name the commit they were found in.

`history:` searches what commits changed rather than the files as they are
now, so it finds deleted code too: `history:useState path:src` lists, newest
first, the commits that added or removed a line matching `useState`, with
those lines. It runs `git log -G` from `HEAD`, or from the `ref:` given, and
leaves out merge commits. Since git diffs every commit it walks past,
histories stop once more commits than `--limit` were found, and the total then
reads as a lower bound such as `100+ commits`. It can be combined with
`path:`, `language:`, `repo:`, `org:`, `user:`, `is:` and `ref:` only. A
`history:` regular expression is a POSIX extended regular expression, so `\d`
is not supported — write `[0-9]` — and a leading `(?-i)` makes it
case-sensitive. `ref:` and `history:` may each appear once, and neither can be
negated or used inside `OR`.

## Development

Requires [Bun](https://bun.com) >= 1.3.12, pnpm, and git.

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm docs:check
pnpm test
```

The search window's UI is a Vite + React app in `apps/desktop/www`. Build it
into one HTML file before running `bundle-grep ui` or compiling a binary, or
work on it with the dev server:

```sh
pnpm build:ui                                          # apps/desktop/www/dist/index.html
bun build --compile packages/cli/src/main.ts --outfile bundle-grep

pnpm dev:ui                                            # Vite on 127.0.0.1:5173
bun packages/cli/src/main.ts ui --dev-server http://127.0.0.1:5173
```

`scripts/smoke-test.sh <binary> [version]` runs a compiled binary end to end
against a throwaway repository. Pushing a tag `v<version>` that matches
`packages/cli/package.json` builds every target, smoke-tests the ones a hosted
runner can execute, and publishes them as a GitHub release.

`pnpm bench --dir <directory of bare repositories>` times searches at 10, 100
and 500 repositories; [docs/performance.md](docs/performance.md) has the
numbers and where the time goes.

In the window, `/` focuses the search box, `j`/`k` move between results,
`Enter` opens one, and `Esc` goes back.

## Packages

| Package | Purpose |
| --- | --- |
| `packages/core` | Sync and restore bundles, parse and compile queries, run searches |
| `packages/cli` | The `bundle-grep` command |
| `apps/desktop` | The search window: a [barlo](https://github.com/cbcruk/barlo) app over a local-only server |
