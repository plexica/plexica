#!/usr/bin/env bash
set -euo pipefail

script="$(dirname "$0")/verify-concurrent-ci-runtime.sh"
if bash "$script"; then
  echo 'Verifier accepted a missing --full-e2e flag' >&2; exit 1
fi
grep -F 'snapshot "$project_b"' "$script" >/dev/null
grep -F 'down-ci-runtime-project.sh' "$script" >/dev/null
