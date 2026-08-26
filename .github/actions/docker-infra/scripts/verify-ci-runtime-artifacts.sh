#!/usr/bin/env bash
set -euo pipefail

for artifact in \
  services/core-api/dist/index.js \
  packages/api-types/dist/index.js \
  apps/web/dist/index.html \
  apps/admin/dist/index.html \
  infra/keycloak/providers/plexica-theme.jar; do
  [[ -f "$artifact" ]] || { printf 'Missing CI runtime artifact: %s\n' "$artifact" >&2; exit 1; }
done
