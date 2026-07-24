#!/usr/bin/env bash
set -euo pipefail

readonly MAX_LINES=200

is_governed_path() {
  local file="$1"
  [[ "$file" != */* ]] || case "$file" in
    .github/*|apps/*|e2e/*|examples/*|infra/*|packages/*|scripts/*|services/*) return 0 ;;
    *) return 1 ;;
  esac
}

is_authored_code() {
  case "$1" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.sh|*.bash|*.yml|*.yaml|*.json|*.jsonc|*.toml|*.sql|Dockerfile|Dockerfile.*|.env|.env.*) return 0 ;;
    *) return 1 ;;
  esac
}

is_excluded() {
  case "$1" in
    pnpm-lock.yaml|package-lock.json|*/package-lock.json|yarn.lock|*/yarn.lock) return 0 ;;
    node_modules/*|*/node_modules/*|dist/*|*/dist/*|build/*|*/build/*) return 0 ;;
    coverage/*|*/coverage/*|*/playwright-report/*|*/test-results/*) return 0 ;;
    generated/*|*/generated/*|*.generated.*|*.gen.ts|*.min.js) return 0 ;;
    */migrations/*.sql) return 0 ;;
    *) return 1 ;;
  esac
}

check_file() {
  local file="$1" lines
  [[ -f "$file" ]] || return 0
  is_authored_code "$file" || return 0
  is_excluded "$file" && return 0
  lines=$(awk 'END { print NR + 0 }' "$file")
  if (( lines > MAX_LINES )); then
    printf '%s: %d lines (maximum %d)\n' "$file" "$lines" "$MAX_LINES" >&2
    return 1
  fi
}

failures=0
if (( $# > 0 )); then
  for file in "$@"; do
    check_file "$file" || failures=$((failures + 1))
  done
else
  while IFS= read -r -d '' file; do
    is_governed_path "$file" || continue
    check_file "$file" || failures=$((failures + 1))
  done < <(git ls-files --cached --others --exclude-standard -z)
fi

if (( failures > 0 )); then
  printf 'Authored-file line gate failed: %d file(s) exceed %d lines.\n' \
    "$failures" "$MAX_LINES" >&2
  exit 1
fi

printf 'Authored-file line gate passed (maximum %d lines).\n' "$MAX_LINES"
