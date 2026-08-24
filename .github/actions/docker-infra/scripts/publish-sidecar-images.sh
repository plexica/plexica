#!/usr/bin/env bash
set -euo pipefail

harness_tag=${HARNESS_TAG:?HARNESS_TAG is required}
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

index_digest=$(
  docker buildx imagetools inspect registry:2 |
    awk '/^Digest:[[:space:]]+/ { print $2; exit }'
) || die 'Unable to inspect registry:2 multi-arch index'
[[ "$index_digest" =~ ^sha256:[0-9a-f]{64}$ ]] ||
  die 'registry:2 multi-arch index digest unavailable'

registry_cid=$(
  docker run -d --rm -p 127.0.0.1::5000 \
    --label "com.docker.compose.project=$project" \
    --label "io.plexica.runtime-scope=$scope" \
    "registry:2@$index_digest"
) || die 'Unable to start ephemeral sidecar registry'
[[ "$registry_cid" =~ ^[0-9a-f]{12,64}$ ]] || die 'Unexpected ephemeral registry container id'

host_port=$(
  docker port "$registry_cid" 5000/tcp |
    awk 'NR == 1 { n = split($0, parts, ":"); print parts[n] }'
) || die 'Unable to resolve ephemeral registry host port'
[[ "$host_port" =~ ^[0-9]+$ ]] || die 'Ephemeral registry host port unresolved'

bash "$script_dir/wait-for-http.sh" "http://127.0.0.1:$host_port/v2/" ||
  die 'Ephemeral sidecar registry did not become ready'

sidecar_ref="127.0.0.1:$host_port/sidecar-harness"
docker tag "$harness_tag" "$sidecar_ref" >/dev/null ||
  die 'Unable to tag sidecar harness image for the ephemeral registry'
docker push "$sidecar_ref" >/dev/null ||
  die 'Unable to push sidecar harness image'

pushed_digest=$(
  docker buildx imagetools inspect "$sidecar_ref" |
    awk '/^Digest:[[:space:]]+/ { print $2; exit }'
) || die 'Unable to inspect pushed sidecar harness image'
[[ "$pushed_digest" =~ ^sha256:[0-9a-f]{64}$ ]] ||
  die 'Pushed sidecar harness digest unavailable'

final_ref="$sidecar_ref@$pushed_digest"
env_file="$runtime/sidecar-images.env"
tmp_file="$runtime/.sidecar-images.env.$$"
(
  umask 077
  printf 'CI_SIDECAR_HARNESS_IMAGE=%s\n' "$final_ref" >"$tmp_file"
) || die 'Unable to stage sidecar images environment file'
mv -f -- "$tmp_file" "$env_file" || die 'Unable to publish sidecar images environment file'

printf '%s\n' "$final_ref"
