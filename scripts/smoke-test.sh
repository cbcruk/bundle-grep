#!/usr/bin/env bash
# Runs an installed bundle-grep end to end against a throwaway repository.
# Usage: scripts/smoke-test.sh <bundle-grep executable> [expected version]
set -euo pipefail

binary=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
expected=${2:-}
work=$(mktemp -d)
ui=
trap 'if [[ -n $ui ]]; then kill "$ui" 2>/dev/null || true; fi; rm -rf "$work"' EXIT

export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=smoke GIT_AUTHOR_EMAIL=smoke@example.com
export GIT_COMMITTER_NAME=smoke GIT_COMMITTER_EMAIL=smoke@example.com

fail() {
  echo "smoke test failed: $*" >&2
  exit 1
}

version=$("$binary" --version)
echo "$version"
if [[ -n $expected && $version != "bundle-grep $expected" ]]; then fail "expected version $expected"; fi

git init --quiet -b main "$work/repo"
mkdir -p "$work/repo/src"
printf 'export function greetSmoke(): string {\n  return "hello"\n}\n' >"$work/repo/src/greet.ts"
git -C "$work/repo" add .
git -C "$work/repo" commit --quiet -m init

# Runs the binary with the given arguments and fails unless it succeeds and prints the pattern.
expect() {
  local pattern=$1 message=$2 output
  shift 2
  output=$("$binary" "$@") || fail "$message (exit $?)"
  grep -q -- "$pattern" <<<"$output" || fail "$message"
}

owner=$(basename "$work")
root="$work/root"
"$binary" sync "$work/repo" --root "$root"
expect "$owner/repo" "list does not show the repository" list --root "$root"
expect 'src/greet.ts' "search found nothing" search greetSmoke --root "$root"
expect 'src/greet.ts:1' "symbol: found nothing" search 'symbol:greetSmoke' --root "$root"
rm -rf "$root/cache"
"$binary" restore --root "$root"
expect 'src/greet.ts' "search after restore found nothing" search 'path:greet language:typescript' --root "$root"
"$binary" ui --help >/dev/null || fail "ui --help failed"

"$binary" ui --no-open --root "$root" >"$work/ui.log" 2>&1 &
ui=$!
for _ in $(seq 100); do
  if grep -q 'http://' "$work/ui.log"; then break; fi
  sleep 0.1
done
url=$(grep -o 'http://[^ ]*' "$work/ui.log" | head -n 1) || fail "ui printed no URL: $(cat "$work/ui.log")"
origin=${url%%/session*}
session=$(curl -sS -o /dev/null -w '%{http_code}' -c "$work/cookies" "$url") || fail "ui does not answer"
if [[ $session != 303 ]]; then fail "redeeming the session link answered $session, not 303"; fi
curl -fsS -b "$work/cookies" -o "$work/page.html" "$origin/" || fail "ui rejects the session cookie"
grep -q '<title>bundle-grep</title>' "$work/page.html" || fail "ui does not serve the search page"
find "$root/cache" -name bundle-grep-symbols.json -delete
curl -fsS -b "$work/cookies" -o "$work/symbols.html" "$origin/?q=symbol%3AgreetSmoke" || fail "ui search failed"
grep -q 'src/greet.ts' "$work/symbols.html" || fail "ui symbol: search found nothing"
kill -INT "$ui"
for _ in $(seq 100); do
  if ! kill -0 "$ui" 2>/dev/null; then break; fi
  sleep 0.1
done
if kill -0 "$ui" 2>/dev/null; then fail "ui did not stop on SIGINT"; fi
status=0
wait "$ui" || status=$?
ui=
if [[ $status != 130 ]]; then fail "ui exited $status on SIGINT, not 130"; fi
echo "smoke test passed"
