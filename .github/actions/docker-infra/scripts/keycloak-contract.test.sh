#!/usr/bin/env bash
set -euo pipefail

compose="$(git rev-parse --show-toplevel)/docker-compose.ci.yml"
grep -F "KC_HOSTNAME_STRICT: 'false'" "$compose" >/dev/null
if grep -E 'KC_HOSTNAME:|KC_PROXY_HEADERS:' "$compose"; then exit 1; fi
