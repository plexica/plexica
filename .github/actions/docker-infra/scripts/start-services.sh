#!/usr/bin/env bash
set -euo pipefail

project=${CI_COMPOSE_PROJECT:?CI_COMPOSE_PROJECT is required}
runtime=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$script_dir/ci-runtime-path.sh"
export CI_RUNTIME_SCOPE="$(bash "$script_dir/ci-runtime-scope.sh" "$project")"
root=$(cd -- "$script_dir/../../../.." && pwd)
mapfile -t _overlay_files < <(ci_compose_overlay_files "$root")
compose=(docker compose --project-name "$project" -f "$root/docker-compose.yml" -f "$root/docker-compose.ci.yml" ${_overlay_files[@]/#/-f})
validate_ci_runtime "$project" "$runtime"
bash "$script_dir/ci-runtime-keycloak-credentials.sh" "$project" "$runtime"
set -a; source "$runtime/keycloak-credentials.env"; set +a

bash "$script_dir/verify-ci-compose-render.sh" "$project"
bash "$script_dir/verify-ci-runtime-artifacts.sh"
# TLS staging: generate the server certificate into the shared volume BEFORE
# postgres starts (its overlay command requires /tls/server.* to exist).
if [[ -n ${E2E_POSTGRES_TLS_SOURCE:-} ]]; then
  "${compose[@]}" up -d postgres-tls-init
  # One-shot init exits 0 on success, so resolve it with -a (stopped included).
  tls_init=$("${compose[@]}" ps -aq postgres-tls-init)
  [[ -n "$tls_init" ]] || { echo 'postgres-tls-init was not created' >&2; exit 1; }
  [[ $(docker wait "$tls_init") == 0 ]] || { docker logs "$tls_init" >&2; exit 1; }
fi
"${compose[@]}" create postgres redis minio keycloak mailpit loki
"${compose[@]}" start postgres redis minio keycloak mailpit loki
# stage-redpanda: create, START (host port is allocated at start), then
# resolve the dynamic mapping and write the gated entrypoint's listener file.
bash "$script_dir/ci-runtime-compose.sh" stage-redpanda
