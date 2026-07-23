#!/usr/bin/env bash
set -euo pipefail

readonly ROOT=${ROOT:?ROOT is required}
readonly COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME:?COMPOSE_PROJECT_NAME is required}
readonly COMPOSE=(docker compose -p "$COMPOSE_PROJECT_NAME" -f docker-compose.yml -f docker-compose.ci.yml -f infra/compose/e2e-production.yml)

pnpm --filter @plexica/vite-plugin build
pnpm --filter @plexica/plugin-crm build:ui
docker build -f examples/plugins/crm/Dockerfile -t plexica/crm-plugin:1.0.0 .

minio_container=$("${COMPOSE[@]}" ps -q minio)
docker exec "$minio_container" rm -rf /tmp/crm-assets
docker cp "$ROOT/examples/plugins/crm/dist-ui/assets/." "$minio_container:/tmp/crm-assets"
docker exec "$minio_container" mc alias set e2e http://localhost:9000 \
  "${MINIO_ACCESS_KEY:?MINIO_ACCESS_KEY is required}" \
  "${MINIO_SECRET_KEY:?MINIO_SECRET_KEY is required}" >/dev/null
docker exec "$minio_container" mc mb --ignore-existing e2e/plugin-assets
docker exec "$minio_container" mc anonymous set download e2e/plugin-assets

shopt -s globstar nullglob
asset_root="$ROOT/examples/plugins/crm/dist-ui/assets"
for asset in "$asset_root"/**/*; do
  [[ -f "$asset" ]] || continue
  name=${asset#"$asset_root"/}
  case "$name" in
    *.css) content_type='text/css; charset=utf-8' ;;
    *.js) content_type='application/javascript; charset=utf-8' ;;
    *) content_type='application/octet-stream' ;;
  esac
  docker exec "$minio_container" mc cp \
    --attr "Content-Type=$content_type" \
    "/tmp/crm-assets/$name" "e2e/plugin-assets/plugins/crm/1.0.0/$name"
done

docker exec "$minio_container" mc stat \
  e2e/plugin-assets/plugins/crm/1.0.0/remoteEntry.js >/dev/null
