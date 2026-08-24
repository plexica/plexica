#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
temp=$(mktemp -d); trap 'rm -rf "$temp"' EXIT
for artifact in services/core-api/dist/index.js packages/api-types/dist/index.js apps/web/dist/index.html apps/admin/dist/index.html infra/keycloak/providers/plexica-theme.jar; do
  mkdir -p "$temp/$(dirname "$artifact")"; : > "$temp/$artifact"
done
if (cd "$temp" && bash "$root/.github/actions/docker-infra/scripts/verify-ci-runtime-artifacts.sh"); then
  :
else
  exit 1
fi
rm "$temp/apps/admin/dist/index.html"
if (cd "$temp" && bash "$root/.github/actions/docker-infra/scripts/verify-ci-runtime-artifacts.sh"); then
  echo 'Artifact preflight accepted a clean checkout without preview output' >&2; exit 1
fi
