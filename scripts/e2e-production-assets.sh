#!/usr/bin/env bash
set -euo pipefail

readonly ROOT=${ROOT:?ROOT is required}
readonly COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:?COMPOSE_PROJECT_NAME is required}
# The CI overlay requires the per-project runtime-scope label value at load time.
export CI_RUNTIME_SCOPE="$(printf 'ci-%s' "$(printf '%s' "$COMPOSE_PROJECT_NAME" | sha256sum | cut -c1-28)")"
readonly COMPOSE=(docker compose -p "$COMPOSE_PROJECT_NAME" -f docker-compose.yml -f docker-compose.ci.yml -f infra/compose/docker-compose.e2e-production.yml)

pnpm --filter @plexica/vite-plugin build
pnpm --filter @plexica/plugin-crm build:ui
# Skip Docker build if the image already exists — self-hosted CI runners with
# persistent filesystem get a ~30 s win on every run after the first.
if ! docker image inspect plexica/crm-plugin:1.0.0 >/dev/null 2>&1; then
  docker build -f examples/plugins/crm/Dockerfile -t plexica/crm-plugin:1.0.0 .
fi

minio_container=$("${COMPOSE[@]}" ps -q minio)
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:?MINIO_ACCESS_KEY is required}" \
  MINIO_SECRET_KEY="${MINIO_SECRET_KEY:?MINIO_SECRET_KEY is required}" \
  UPLOAD_CRM_ASSET_ROOT="$ROOT/examples/plugins/crm/dist-ui/assets" \
  bash "$ROOT/scripts/upload-crm-ui-assets.sh" "$minio_container"
