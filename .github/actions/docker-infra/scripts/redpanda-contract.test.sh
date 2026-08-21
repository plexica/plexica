#!/usr/bin/env bash
set -euo pipefail

entrypoint="$(git rev-parse --show-toplevel)/infra/redpanda/ci-entrypoint.sh"
grep -F 'REDPANDA_EXTERNAL_LISTENER' "$entrypoint" >/dev/null
if grep -F 'localhost:19092' "$entrypoint"; then exit 1; fi
