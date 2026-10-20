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

root="$work/root"
"$binary" sync "$work/repo" --root "$root"
"$binary" list --root "$root" | grep -q repo || fail "list does not show the repository"
"$binary" search greetSmoke --root "$root" | grep -q 'src/greet.ts' || fail "search found nothing"
"$binary" search 'symbol:greetSmoke' --root "$root" | grep -q 'src/greet.ts:1' || fail "symbol: found nothing"
rm -rf "$root/cache"
"$binary" restore --root "$root"
"$binary" search 'path:greet language:typescript' --root "$root" | grep -q 'src/greet.ts' || fail "search after restore found nothing"
"$binary" ui --help >/dev/null || fail "ui --help failed"
echo "smoke test passed"
