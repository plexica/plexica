#!/usr/bin/env bash
set -euo pipefail

harness_tag=${HARNESS_TAG:?HARNESS_TAG is required}
plugin_image_tag=${PLUGIN_IMAGE_TAG:?PLUGIN_IMAGE_TAG is required}
project=${CI_COMPOSE_PROJECT:?CI_COMPOSE_PROJECT is required}
runtime=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$script_dir/ci-runtime-path.sh"
validate_ci_runtime "$project" "$runtime"
scope=$(bash "$script_dir/ci-runtime-scope.sh" "$project")

registry_cid=''

remove_registry() {
  if [[ -n "$registry_cid" ]]; then
    docker rm -f "$registry_cid" >/dev/null 2>&1 || true
  fi
}
# EXIT covers normal and set -e aborts; INT/TERM mirror the concurrent
# verifier so a cancelled job cannot leak the ephemeral registry container.
trap remove_registry EXIT
trap 'remove_registry; exit 130' INT TERM

die() { printf '%s\n' "$1" >&2; exit 1; }

# Pinned ephemeral registry image (tag@digest policy). The digest below is
# the verified multi-arch index for registry:2. To refresh it, run on a
# machine with working buildx:
#   docker buildx imagetools inspect registry:2 | awk '/^Digest:/ { print $2; exit }'
# then update the constant and re-verify before committing.
REGISTRY_IMAGE=registry:2@sha256:a3d8aaa63ed8681a604f1dea0aa03f100d5895b6a58ace528858a7b332415373
[[ "$REGISTRY_IMAGE" =~ ^registry:2@sha256:[0-9a-f]{64}$ ]] ||
  die 'Pinned registry:2 reference has an invalid sha256 format'

registry_cid=$(
  docker run -d --rm -p 127.0.0.1::5000 \
    --label "com.docker.compose.project=$project" \
    --label "io.plexica.runtime-scope=$scope" \
    "$REGISTRY_IMAGE"
) || die 'Unable to start ephemeral sidecar registry'
[[ "$registry_cid" =~ ^[0-9a-f]{12,64}$ ]] || die 'Unexpected ephemeral registry container id'

host_port=$(
  docker port "$registry_cid" 5000/tcp |
    awk 'NR == 1 { n = split($0, parts, ":"); print parts[n] }'
) || die 'Unable to resolve ephemeral registry host port'
[[ "$host_port" =~ ^[0-9]+$ ]] || die 'Ephemeral registry host port unresolved'

bash "$script_dir/wait-for-http.sh" "http://127.0.0.1:$host_port/v2/" ||
  die 'Ephemeral sidecar registry did not become ready'

# Repository name for a local tag reference: strip any digest, any registry
# host/path prefix, then the tag. Validated so a malformed tag fails closed.
repo_name() {
  local name=${1%%@*}
  name=${name##*/}
  name=${name%%:*}
  [[ "$name" =~ ^[a-z0-9][a-z0-9._-]*$ ]] ||
    die "Image tag has no usable repository name: $plugin_image_tag"
  printf '%s\n' "$name"
}

# Publish one image into the ephemeral registry and resolve its pushed digest
# by pulling it back through that registry: buildx (imagetools) is not
# installed on self-hosted runners. The pull also caches the image by digest
# on this daemon, so later sidecar container creates survive registry teardown.
publish_image() {
  local source_tag=$1 repo=$2 variable=$3 ref final_ref
  ref="127.0.0.1:$host_port/$repo"
  docker tag "$source_tag" "$ref" >/dev/null ||
    die "Unable to tag $repo image for the ephemeral registry"
  docker push "$ref" >/dev/null ||
    die "Unable to push $repo image"
  docker pull "$ref:latest" >/dev/null ||
    die "Unable to pull pushed $repo image"
  final_ref=$(
    docker image inspect --format '{{index .RepoDigests 0}}' "$ref:latest"
  ) || die "Unable to inspect pulled $repo image"
  [[ "$final_ref" =~ ^127\.0\.0\.1:[0-9]+/$repo@sha256:[0-9a-f]{64}$ ]] ||
    die "Pulled $repo digest reference has an unexpected format"
  printf '%s=%s\n' "$variable" "$final_ref"
}

harness_entry=$(publish_image "$harness_tag" sidecar-harness CI_SIDECAR_HARNESS_IMAGE)
plugin_repo=$(repo_name "$plugin_image_tag")
plugin_entry=$(publish_image "$plugin_image_tag" "$plugin_repo" PLUGIN_SIDECAR_IMAGE)

env_file="$runtime/sidecar-images.env"
tmp_file="$runtime/.sidecar-images.env.$$"
(
  umask 077
  printf '%s\n%s\n' "$harness_entry" "$plugin_entry" >"$tmp_file"
) || die 'Unable to stage sidecar images environment file'
mv -f -- "$tmp_file" "$env_file" || die 'Unable to publish sidecar images environment file'

printf '%s\n%s\n' "$harness_entry" "$plugin_entry"
