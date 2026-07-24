#!/usr/bin/env bash
set -euo pipefail

readonly GATE="$(dirname "$0")/check-authored-lines.sh"
fixture_dir=$(mktemp -d)
trap 'rm -rf "$fixture_dir"' EXIT

write_lines() {
  local target="$1" count="$2" line=1
  : > "$target"
  while (( line <= count )); do
    printf '// fixture line %d\n' "$line" >> "$target"
    line=$((line + 1))
  done
}

pass_fixture="$fixture_dir/exactly-200.ts"
fail_fixture="$fixture_dir/exactly-201.ts"
write_lines "$pass_fixture" 200
write_lines "$fail_fixture" 201

bash "$GATE" "$pass_fixture" >/dev/null
if bash "$GATE" "$fail_fixture" >/dev/null 2>&1; then
  printf 'Expected the 201-line fixture to fail.\n' >&2
  exit 1
fi

printf 'Line-gate self-test passed: 200 accepted, 201 rejected.\n'
