#!/usr/bin/env bash
set -euo pipefail

script="$(dirname "$0")/verify-ci-runner-capacity.sh"
temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
if CI_RUNTIME_DIR="$temp" PLEXICA_CI_RUNNER_MARKER="$temp/missing" bash "$script" plexica-ci-contract-123456; then
  echo 'Admission accepted an absent marker' >&2; exit 1
fi
