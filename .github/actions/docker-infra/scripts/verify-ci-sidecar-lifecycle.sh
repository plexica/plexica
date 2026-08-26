#!/usr/bin/env bash
set -euo pipefail

publish_only=false
[[ "${1:-}" == '--publish-only' ]] && publish_only=true
project=${CI_COMPOSE_PROJECT:?CI_COMPOSE_PROJECT is required}
runtime=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
root=$(cd -- "$script_dir/../../../.." && pwd)
source "$script_dir/ci-runtime-path.sh"
export CI_RUNTIME_SCOPE="$(bash "$script_dir/ci-runtime-scope.sh" "$project")"
validate_ci_runtime "$project" "$runtime"
[[ -f "$runtime/admission.env" && -O "$runtime/admission.env" && ! -L "$runtime/admission.env" ]] || {
  echo 'Real sidecar proof requires admitted runner evidence' >&2; exit 1;
}
grep -Fx "project=$project" "$runtime/admission.env" >/dev/null || {
  echo 'Admission evidence does not belong to this project' >&2; exit 1;
}
image="plexica-ci-sidecar-harness:$project"
# Deterministic per-project CRM sidecar tag: the real plugin app image that
# PLUGIN_SIDECAR_IMAGE must resolve to (run 32758511913 proved a bare node
# image can never become healthy, degrading every install).
crm_image="plexica-crm-plugin:$project"
mapfile -t _overlay_files < <(ci_compose_overlay_files "$root")
compose=(docker compose --project-name "$project" -f "$root/docker-compose.yml" -f "$root/docker-compose.ci.yml" ${_overlay_files[@]/#/-f})
env_file="$runtime/sidecar-images.env"
# Idempotency: skip rebuild and republish only when BOTH digest-pinned lines
# exist; partial evidence from an older run must republish fail-closed.
if [[ -f "$env_file" ]] \
  && grep -Eq '^CI_SIDECAR_HARNESS_IMAGE=.*@sha256:[0-9a-f]{64}$' "$env_file" \
  && grep -Eq '^PLUGIN_SIDECAR_IMAGE=.*@sha256:[0-9a-f]{64}$' "$env_file"; then
  # shellcheck disable=SC1090
  source "$env_file"
else
  build_id=
  crm_build_id=
  # Remove this run's per-project build TAGS. Never rmi the underlying image
  # IDs: the digest-pinned refs written to sidecar-images.env are the only
  # surviving local reference once the ephemeral registry exits, and they
  # point at the very same image objects as these tags. Run 32762992133:
  # a forced `docker rmi -f <build id>` orphaned those digest refs, so every
  # install degraded with a dead-registry pull failure (PLUGIN_RUNTIME_START,
  # zero plugin container events). Only this run's own tags are touched —
  # never a global prune, never another project's references.
  cleanup() {
    docker image rm -f "$image" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT
  build_id=$(docker build -q --tag "$image" --file "$root/infra/docker/ci-sidecar-harness.Dockerfile" "$root")
  if ! docker image inspect "$crm_image" >/dev/null 2>&1; then
    crm_build_id=$(docker build -q --tag "$crm_image" --file "$root/examples/plugins/crm/Dockerfile" "$root")
  fi
  # Test harnesses override the publisher via PUBLISH_SIDECAR_IMAGES_CMD;
  # production always uses the real script colocated with this one.
  HARNESS_TAG="$image" PLUGIN_IMAGE_TAG="$crm_image" \
    "${PUBLISH_SIDECAR_IMAGES_CMD:-$script_dir/publish-sidecar-images.sh}" >/dev/null
  [[ -f "$env_file" ]] || {
    echo 'Sidecar image publication did not produce sidecar-images.env evidence' >&2; exit 1;
  }
  # shellcheck disable=SC1090
  source "$env_file"
  [[ "${CI_SIDECAR_HARNESS_IMAGE:-}" =~ @sha256:[0-9a-f]{64}$ ]] || {
    echo 'Sidecar harness image reference is not digest-pinned' >&2; exit 1;
  }
  [[ "${PLUGIN_SIDECAR_IMAGE:-}" =~ @sha256:[0-9a-f]{64}$ ]] || {
    echo 'Plugin sidecar image reference is not digest-pinned' >&2; exit 1;
  }
fi
$publish_only && exit 0
# Digest-vs-dead-registry proof: publish-sidecar-images.sh already removed the
# ephemeral registry, so each digest-pinned ref must resolve from the local
# daemon store alone (the push recorded the repo digest) or fail closed.
for pinned in "$CI_SIDECAR_HARNESS_IMAGE" "$PLUGIN_SIDECAR_IMAGE"; do
  docker image inspect "$pinned" >/dev/null || {
    echo "Digest-pinned sidecar image did not resolve from the local daemon store after registry teardown: $pinned" >&2;
    exit 1;
  }
done
"${compose[@]}" exec -T -e "CI_SIDECAR_HARNESS_IMAGE=$CI_SIDECAR_HARNESS_IMAGE" core-api-e2e \
  node /workspace/services/core-api/scripts/verify-ci-sidecar-lifecycle.mjs
