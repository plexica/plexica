#!/usr/bin/env bash
# Upload the built CRM plugin UI assets into the stack's storage plugin-assets
# bucket. Shared by the canonical production E2E runner and the CI runtime
# contract publisher: same bucket layout, same remoteEntry.js location.
#
# The i18n bundles (006-09) are a first-class artifact: every locale the plugin
# manifest declares under `i18n.bundles` is uploaded to
# `plugins/crm/1.0.0/i18n/{locale}.json` and its remote existence asserted —
# a silent gap would leave the shell's bundle fetch 404ing in production/E2E.
#
# Usage: upload-crm-ui-assets.sh <storage-container-id>
# Requires: STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY in the environment and the
# CRM UI built at examples/plugins/crm/dist-ui/ (assets + i18n).
set -euo pipefail

fail() { printf '%s\n' "$*" >&2; exit 1; }
storage_container=${1:?Usage: upload-crm-ui-assets.sh <storage-container-id>}
: "${STORAGE_ACCESS_KEY:?STORAGE_ACCESS_KEY is required}"
: "${STORAGE_SECRET_KEY:?STORAGE_SECRET_KEY is required}"
asset_root=${UPLOAD_CRM_ASSET_ROOT:-examples/plugins/crm/dist-ui/assets}
dist_root=$(dirname "$asset_root")
# The manifest lives at the plugin project root (builds only emit dist-ui), so
# it is one level above the build output: dist-ui <- examples/plugins/crm.
manifest_file="$(dirname "$dist_root")/manifest.json"
[[ -f "$asset_root/remoteEntry.js" ]] || fail "Missing $asset_root/remoteEntry.js — build the CRM UI first"

# Locales declared by the plugin manifest (`i18n.bundles`); empty when the
# plugin ships no bundles. Parsed once, used for upload + existence assertions.
# Read/parse explicitly — never require() a relative path (Node resolves it as a
# package name → MODULE_NOT_FOUND) — and fail loudly: a silent parse gap would
# upload nothing and leave every i18n/{locale}.json fetch 404ing in E2E/prod.
[[ -f "$manifest_file" ]] || fail "Missing $manifest_file — cannot read i18n.bundles"
declared_locales_raw=$(
  node -e 'const { readFileSync } = require("node:fs");
           const m = JSON.parse(readFileSync(process.argv[1], "utf8"));
           process.stdout.write((m.i18n?.bundles ?? []).join("\n"));' \
    "$manifest_file"
) || fail "Failed to parse $manifest_file"
declared_locales=()
if [[ -n "$declared_locales_raw" ]]; then
  mapfile -t declared_locales <<< "$declared_locales_raw"
fi

docker exec "$storage_container" rm -rf /tmp/crm-assets
docker cp "$asset_root/." "$storage_container:/tmp/crm-assets"
docker exec "$storage_container" mc alias set e2e http://localhost:9000 \
  "$STORAGE_ACCESS_KEY" "$STORAGE_SECRET_KEY" >/dev/null
docker exec "$storage_container" mc mb --ignore-existing e2e/plugin-assets
docker exec "$storage_container" mc anonymous set download e2e/plugin-assets

shopt -s globstar nullglob
for asset in "$asset_root"/**/*; do
  [[ -f "$asset" ]] || continue
  name=${asset#"$asset_root"/}
  case "$name" in
    *.css) content_type='text/css; charset=utf-8' ;;
    *.js) content_type='application/javascript; charset=utf-8' ;;
    *.json) content_type='application/json; charset=utf-8' ;;
    *) content_type='application/octet-stream' ;;
  esac
  docker exec "$storage_container" mc cp \
    --attr "Content-Type=$content_type" \
    "/tmp/crm-assets/$name" "e2e/plugin-assets/plugins/crm/1.0.0/$name"
done

# i18n bundles: same base path as the assets, served from the MF asset origin.
if [[ ${#declared_locales[@]} -gt 0 ]]; then
  i18n_root="$dist_root/i18n"
  mkdir -p -- "$i18n_root"
  for locale in "${declared_locales[@]}"; do
    local_file="$i18n_root/$locale.json"
    [[ -f "$local_file" ]] || fail "Missing $local_file — declared in $manifest_file"
    docker exec "$storage_container" mkdir -p /tmp/crm-assets/i18n
    docker cp "$local_file" "$storage_container:/tmp/crm-assets/i18n/$locale.json"
    remote_obj="e2e/plugin-assets/plugins/crm/1.0.0/i18n/$locale.json"
    docker exec "$storage_container" mc cp \
      --attr "Content-Type=application/json; charset=utf-8" \
      "/tmp/crm-assets/i18n/$locale.json" "$remote_obj"
    # Existence assertion: the shell must be able to fetch this object.
    docker exec "$storage_container" mc stat "$remote_obj" >/dev/null
  done
fi

docker exec "$storage_container" mc stat \
  e2e/plugin-assets/plugins/crm/1.0.0/remoteEntry.js >/dev/null
