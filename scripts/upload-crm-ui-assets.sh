#!/usr/bin/env bash
# Upload the built CRM plugin UI assets into the stack's MinIO plugin-assets
# bucket. Shared by the canonical production E2E runner and the CI runtime
# contract publisher: same bucket layout, same remoteEntry.js location.
#
# Usage: upload-crm-ui-assets.sh <minio-container-id>
# Requires: MINIO_ACCESS_KEY / MINIO_SECRET_KEY in the environment and the
# CRM UI built at examples/plugins/crm/dist-ui/assets/.
set -euo pipefail

fail() { printf '%s\n' "$*" >&2; exit 1; }
minio_container=${1:?Usage: upload-crm-ui-assets.sh <minio-container-id>}
: "${MINIO_ACCESS_KEY:?MINIO_ACCESS_KEY is required}"
: "${MINIO_SECRET_KEY:?MINIO_SECRET_KEY is required}"
asset_root=${UPLOAD_CRM_ASSET_ROOT:-examples/plugins/crm/dist-ui/assets}
[[ -f "$asset_root/remoteEntry.js" ]] || fail "Missing $asset_root/remoteEntry.js — build the CRM UI first"

docker exec "$minio_container" rm -rf /tmp/crm-assets
docker cp "$asset_root/." "$minio_container:/tmp/crm-assets"
docker exec "$minio_container" mc alias set e2e http://localhost:9000 \
  "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null
docker exec "$minio_container" mc mb --ignore-existing e2e/plugin-assets
docker exec "$minio_container" mc anonymous set download e2e/plugin-assets

shopt -s globstar nullglob
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
