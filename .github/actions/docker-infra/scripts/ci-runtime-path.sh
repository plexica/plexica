#!/usr/bin/env bash
# shellcheck shell=bash

valid_ci_project() { [[ "$1" =~ ^plexica-ci-[a-z0-9][a-z0-9-]{5,43}$ ]]; }

safe_directory() {
  local path="$1" strict="${2:-}" mode owner
  [[ -d "$path" && ! -L "$path" ]] || return 1
  owner=$(stat -c %u -- "$path") || return 1
  mode=$(stat -c %a -- "$path") || return 1
  [[ "$owner" == "$UID" && $((8#$mode & 022)) -eq 0 && ( "$strict" != strict || "$mode" == 700 ) ]]
}

ci_runtime_root() {
  local raw=${RUNNER_TEMP:?RUNNER_TEMP is required} runner root
  runner=$(realpath -e -- "$raw") || {
    echo 'Unsafe runner temporary directory' >&2; return 1;
  }
  [[ "$raw" == "$runner" ]] && safe_directory "$runner" || {
    echo 'Unsafe runner temporary directory' >&2; return 1;
  }
  root="$runner/plexica-ci"
  if [[ ! -e "$root" ]]; then mkdir -m 700 -- "$root"; fi
  [[ "$root" == "$(realpath -e -- "$root")" ]] && safe_directory "$root" strict || {
    echo 'Unsafe CI runtime root' >&2; return 1;
  }
  printf '%s\n' "$root"
}

init_ci_runtime() {
  local project="$1" root runtime
  valid_ci_project "$project" || { echo 'Invalid CI Compose project ID' >&2; return 1; }
  root=$(ci_runtime_root) || return 1
  runtime="$root/$project"
  [[ ! -e "$runtime" ]] || {
    echo 'Unsafe CI runtime directory' >&2; return 1;
  }
  mkdir -m 700 -- "$runtime"
  safe_directory "$runtime" strict || { echo 'Unsafe CI runtime directory' >&2; return 1; }
  printf '%s\n' "$runtime"
}

validate_ci_runtime() {
  local project="$1" runtime="$2" root expected actual
  valid_ci_project "$project" || { echo 'Invalid CI Compose project ID' >&2; return 1; }
  root=$(ci_runtime_root) || return 1
  expected="$root/$project"
  [[ "$runtime" == "$expected" && "$runtime" == "$(realpath -e -- "$runtime")" ]] && safe_directory "$runtime" strict || {
    echo 'Unsafe runtime directory' >&2; return 1;
  }
  actual=$(realpath -e -- "$runtime")
  [[ "$actual" == "$expected" ]] || { echo 'Runtime directory is outside its project root' >&2; return 1; }
}
