#!/usr/bin/env bash
# Publish the CRM plugin UI assets into the project's MinIO so Module
# Federation remotes resolve inside the contract stack. Canonical parity:
# scripts/e2e-production-assets.sh performs the same upload for the host-run
# production E2E suite; both share scripts/upload-crm-ui-assets.sh.
#
# Requires a sourced host.env (MINIO_ACCESS_KEY / MINIO_SECRET_KEY) and the
# CRM UI + sidecar image build inputs from the repository working tree.
set -euo pipefail

project=${CI_COMPOSE_PROJECT:?CI_COMPOSE_PROJECT is required}
runtime=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$script_dir/ci-runtime-path.sh"
export CI_RUNTIME_SCOPE="$(bash "$script_dir/ci-runtime-scope.sh" "$project")"
root=$(cd -- "$script_dir/../../../.." && pwd)
: "${MINIO_ACCESS_KEY:?MINIO_ACCESS_KEY is required}"
: "${MINIO_SECRET_KEY:?MINIO_SECRET_KEY is required}"

mapfile -t _overlay_files < <(ci_compose_overlay_files "$root")
compose=(docker compose --project-name "$project" -f "$root/docker-compose.yml" -f "$root/docker-compose.ci.yml" ${_overlay_files[@]/#/-f})

cd "$root"
# Concurrent A/B bootstraps share one working tree, and the CRM UI build
# writes into the SHARED examples/plugins/crm/dist-ui directory. Two
# simultaneous vite builds race there: one build's outDir wipe deletes the
# sibling's freshly built assets between its build and its upload, failing
# the upload with "Missing .../remoteEntry.js". Serialize build+upload per
# runner so each project publishes a coherent dist-ui generation.
lock_dir=${CI_PLUGIN_ASSETS_LOCK_DIR:-${RUNNER_TEMP:-/tmp}/plexica-ci}
mkdir -p -- "$lock_dir"
exec 9>"$lock_dir/plugin-assets-publish.lock"
flock 9 || exit 1
pnpm --filter @plexica/vite-plugin build
pnpm --filter @plexica/plugin-crm build:ui

minio_container=$("${compose[@]}" ps -q minio)
[[ -n "$minio_container" ]] || { echo 'MinIO container is not running' >&2; exit 1; }
MINIO_ACCESS_KEY="$MINIO_ACCESS_KEY" MINIO_SECRET_KEY="$MINIO_SECRET_KEY" \
  UPLOAD_CRM_ASSET_ROOT="$root/examples/plugins/crm/dist-ui/assets" \
  bash "$root/scripts/upload-crm-ui-assets.sh" "$minio_container"
