#!/usr/bin/env bash
# Give a worktree the main checkout's .env, so a session started in one can run
# the dev loop without hand-copying it. Does nothing when there is nothing to
# copy, or when the worktree already has an .env of its own.
set -uo pipefail

input=$(cat 2>/dev/null || true)
cwd=""
if [ -n "$input" ] && command -v jq >/dev/null 2>&1; then
  cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
fi
[ -n "$cwd" ] || cwd=$PWD

cd "$cwd" 2>/dev/null || exit 0
cwd=$(pwd -P)

# In a worktree, the shared git directory is the main checkout's .git.
common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
main=$(cd "$(dirname "$common")" 2>/dev/null && pwd -P) || exit 0

if [ "$main" = "$cwd" ]; then exit 0; fi   # the main checkout itself
if [ ! -f "$main/.env" ]; then exit 0; fi  # nothing to copy
if [ -e "$cwd/.env" ]; then exit 0; fi     # this worktree already has one

cp "$main/.env" "$cwd/.env" || exit 0
printf '{"systemMessage":"Copied .env from %s into this worktree."}\n' "$main"
