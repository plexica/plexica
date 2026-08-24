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
compose=(docker compose --project-name "$project" -f "$root/docker-compose.yml" -f "$root/docker-compose.ci.yml")
env_file="$runtime/sidecar-images.env"
# Idempotency: skip rebuild and republish when digest-pinned sidecar-images.env evidence already exists.
if [[ -f "$env_file" ]] && grep -Eq '^CI_SIDECAR_HARNESS_IMAGE=.*@sha256:[0-9a-f]{64}$' "$env_file"; then
  # shellcheck disable=SC1090
  source "$env_file"
else
  build_id=
  # Remove both the tag and the image ID recorded at build time: `docker
  # image rm <tag>` leaves the underlying layers as dangling store entries,
  # so the EXIT cleanup additionally rmi's the exact build output. Never a
  # global prune — only this run's own image.
  cleanup() {
    docker image rm -f "$image" >/dev/null 2>&1 || true
    [[ -z "$build_id" ]] || docker rmi -f "$build_id" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT
  build_id=$(docker build -q --tag "$image" --file "$root/infra/docker/ci-sidecar-harness.Dockerfile" "$root")
  HARNESS_TAG="$image" PATH="$script_dir:$PATH" publish-sidecar-images.sh >/dev/null
  [[ -f "$env_file" ]] || {
    echo 'Sidecar image publication did not produce sidecar-images.env evidence' >&2; exit 1;
  }
  # shellcheck disable=SC1090
  source "$env_file"
  [[ "${CI_SIDECAR_HARNESS_IMAGE:-}" =~ @sha256:[0-9a-f]{64}$ ]] || {
    echo 'Sidecar harness image reference is not digest-pinned' >&2; exit 1;
  }
fi
$publish_only && exit 0
# Digest-vs-dead-registry proof: publish-sidecar-images.sh already removed the
# ephemeral registry, so the digest-pinned ref must resolve from the local
# daemon store alone (the push recorded the repo digest) or fail closed.
docker image inspect "$CI_SIDECAR_HARNESS_IMAGE" >/dev/null || {
  echo 'Digest-pinned sidecar harness did not resolve from the local daemon store after registry teardown' >&2;
  exit 1;
}
"${compose[@]}" exec -T -e "CI_SIDECAR_HARNESS_IMAGE=$CI_SIDECAR_HARNESS_IMAGE" core-api-e2e \
  node /workspace/services/core-api/scripts/verify-ci-sidecar-lifecycle.mjs
