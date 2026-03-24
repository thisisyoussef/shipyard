#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
target_dir="$repo_root/test-targets/tic-tac-toe"

mkdir -p "$target_dir"

if [ -e "$target_dir/.git" ]; then
  echo "Test target already initialized: $target_dir"
else
  git -C "$target_dir" init -b main >/dev/null
  echo "Initialized test target git repo: $target_dir"
fi

echo "Shipyard test target path: $target_dir"
