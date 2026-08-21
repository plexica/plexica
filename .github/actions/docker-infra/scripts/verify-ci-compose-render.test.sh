#!/usr/bin/env bash
set -euo pipefail

compose="$(git rev-parse --show-toplevel)/docker-compose.ci.yml"
grep -F '!override' "$compose" >/dev/null
for port in 5432 8080 6379 9000 19092; do grep -F "127.0.0.1::${port}" "$compose" >/dev/null; done
if grep -E '^name:|plexica-e2e' "$compose"; then exit 1; fi
