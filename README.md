# bundle-grep

Archive your git repositories as bundles and search them with
[GitHub code search](https://github.com/search) syntax, run locally through
`git grep`.

## Install

Requires [Node.js](https://nodejs.org) 24 or later.

```sh
npm install --global bundle-grep
bundle-grep --version
```

The package has no dependencies of its own: the CLI, the search page and the
tree-sitter grammars are bundled into it. Each
[release](https://github.com/cbcruk/bundle-grep/releases) also attaches the
same `.tgz` with a `SHA256SUMS` file, for `npm install --global ./bundle-grep-<version>.tgz`.

## Usage

Requires git, and, for GitHub sources, a logged-in
[`gh`](https://cli.github.com).

```sh
bundle-grep sync cbcruk                  # every repository of a user or organisation
bundle-grep sync cbcruk/barlo            # one GitHub repository
bundle-grep sync git@example.com:a/b.git # any git URL, or a local path such as ./repo
bundle-grep search useState language:typescript -is:fork
bundle-grep list
bundle-grep restore                      # rebuild search caches from the bundles
bundle-grep ui                           # serve the search page and open it in your browser
```

Everything lives under `--root`, else `$BUNDLE_GREP_ROOT`, else
`~/.bundle-grep`: bundles and metadata in `archive/`, and search caches, which
`restore` can always rebuild, in `cache/`. `search` exits 0 when something
matched, 1 when nothing did, and 2 on an error; any command stopped with
Ctrl-C exits 130. With `--json`, `list` prints a JSON array and the other
commands one JSON object per line.

`ui` serves the search page on `127.0.0.1` and opens it in the default
browser. It also prints the URL, for `--no-open` or a browser that did not
start, and runs until Ctrl-C. The URL ends in `#code=…`, which the first page
to open it trades for that run's secret token, so open it once, as printed;
a reload keeps working in that tab. Requests from other sites, or for another
host name, are refused. Other users on the same machine can see the URL in
the process list while the browser starts, so on a shared machine one of them
could trade the code first and reach the archive; the page would then say the
link was already used.

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

To run it on a schedule, give the scheduler the absolute path that
`command -v bundle-grep` prints and a `PATH` where it finds `node`, `git` and
`gh`. On macOS, use a launchd agent: `gh`
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
    <string>/opt/homebrew/bin/bundle-grep</string>
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
0 3 * * * PATH=/usr/local/bin:/usr/bin:/bin /usr/local/bin/bundle-grep sync cbcruk --json >> $HOME/.bundle-grep/sync.log 2>&1
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

A definition directly inside a class, struct, interface, enum, trait, module
or namespace, C#'s file-scoped `namespace N;` included, is also known by the
names around it, as is a Go method by its receiver and a Rust one by its
`impl`; a definition local to a function is not. A `symbol:` value with a `.` or `::`
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

Requires Node.js 24 or later, pnpm, and git. Tests run with
[Vitest](https://vitest.dev); `pnpm cli <command>` runs the CLI from source,
with relative paths resolved from the repository root.

```sh
pnpm install
pnpm typecheck
pnpm lint
pnpm docs:check
pnpm test
```

The search page is a Vite + React app in `apps/desktop/www`. Build it
into one HTML file before running `bundle-grep ui` or packing, or work on it
with the dev server, which `ui --dev-server` proxies:

```sh
pnpm build                                             # the UI, then the CLI bundle in packages/cli/dist
pnpm --filter bundle-grep pack                         # bundle-grep-<version>.tgz

pnpm dev:ui                                            # Vite on 127.0.0.1:5173
pnpm cli ui --dev-server http://127.0.0.1:5173
```

`scripts/smoke-test.sh <executable> [version]` runs an installed
`bundle-grep` end to end against a throwaway repository, `ui` included.
Pushing a tag `v<version>` that matches `packages/cli/package.json` packs the
package, smoke-tests it on Linux and macOS, publishes it to npm, and attaches
it to a GitHub release.

`pnpm bench --dir <directory of bare repositories>` times searches at 10, 100
and 500 repositories; [docs/performance.md](docs/performance.md) has the
numbers and where the time goes.

In the search page, `/` focuses the search box, `j`/`k` move between results,
`Enter` opens one, and `Esc` goes back.

## Packages

| Package | Purpose |
| --- | --- |
| `packages/core` | Sync and restore bundles, parse and compile queries, run searches |
| `packages/cli` | The `bundle-grep` command |
| `apps/desktop` | The search page and the local-only server behind it |
