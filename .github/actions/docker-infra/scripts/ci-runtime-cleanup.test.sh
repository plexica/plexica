#!/usr/bin/env bash
set -euo pipefail

dir=$(dirname "$0")
grep -F 'label=com.docker.compose.project=$project' "$dir/collect-ci-runtime-diagnostics.sh" >/dev/null
grep -F 'down -v' "$dir/down-ci-runtime-project.sh" >/dev/null
if grep -E '(pkill|lsof|--remove-orphans)' "$dir/down-ci-runtime-project.sh"; then exit 1; fi
