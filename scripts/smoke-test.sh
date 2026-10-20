#!/usr/bin/env bash
# Runs a compiled bundle-grep binary end to end against a throwaway repository.
# Usage: scripts/smoke-test.sh <binary> [expected version]
set -euo pipefail

binary=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
expected=${2:-}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

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

expect() {
  local output=$1 pattern=$2 message=$3
  grep -q -- "$pattern" <<<"$output" || fail "$message"
}

owner=$(basename "$work")
root="$work/root"
"$binary" sync "$work/repo" --root "$root"
expect "$("$binary" list --root "$root")" "$owner/repo" "list does not show the repository"
expect "$("$binary" search greetSmoke --root "$root")" 'src/greet.ts' "search found nothing"
expect "$("$binary" search 'symbol:greetSmoke' --root "$root")" 'src/greet.ts:1' "symbol: found nothing"
rm -rf "$root/cache"
"$binary" restore --root "$root"
expect "$("$binary" search 'path:greet language:typescript' --root "$root")" 'src/greet.ts' "search after restore found nothing"
"$binary" ui --help >/dev/null || fail "ui --help failed"
grep -a -q '<title>bundle-grep</title>' "$binary" || fail "the search window's UI is not embedded"
echo "smoke test passed"
