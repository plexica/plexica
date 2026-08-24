#!/usr/bin/env bash
set -euo pipefail

project=${CI_COMPOSE_PROJECT:?CI_COMPOSE_PROJECT is required}
runtime=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$script_dir/ci-runtime-path.sh"
root=$(cd -- "$script_dir/../../../.." && pwd)
compose=(docker compose --project-name "$project" -f "$root/docker-compose.yml" -f "$root/docker-compose.ci.yml")
validate_ci_runtime "$project" "$runtime"
bash "$script_dir/ci-runtime-keycloak-credentials.sh" "$project" "$runtime"
set -a; source "$runtime/keycloak-credentials.env"; set +a

"${compose[@]}" up -d --wait --wait-timeout 300 postgres redis minio keycloak redpanda mailpit loki
"${compose[@]}" up -d redpanda-init
for service in redpanda-init; do
  container=$("${compose[@]}" ps -q "$service")
  [[ -n "$container" ]] || { echo "$service was not created" >&2; exit 1; }
  [[ $(docker wait "$container") == 0 ]] || { docker logs "$container" >&2; exit 1; }
done
bash "$script_dir/ci-runtime-compose.sh" write-infra
export CI_RUNTIME_HOST_STAGE=infra
source "$script_dir/source-ci-runtime-host.sh"
unset CI_RUNTIME_HOST_STAGE
pnpm --filter core-api exec prisma migrate deploy
pnpm --filter core-api exec prisma migrate status
lifecycle=$(PATH="$PATH:$script_dir" command -v verify-ci-sidecar-lifecycle.sh)
CI_RUNTIME_DIR="$runtime" bash "$lifecycle" --publish-only
"${compose[@]}" create plugin-docker-proxy
"${compose[@]}" start plugin-docker-proxy
"${compose[@]}" create core-api-e2e
"${compose[@]}" start core-api-e2e
bash "$script_dir/ci-runtime-compose.sh" write-core
"${compose[@]}" create web-e2e admin-e2e
bash "$script_dir/ci-runtime-compose.sh" write-browser
source "$script_dir/source-ci-runtime-host.sh"
"${compose[@]}" start web-e2e admin-e2e
"${compose[@]}" up -d keycloak-init
container=$("${compose[@]}" ps -q keycloak-init)
[[ -n "$container" && $(docker wait "$container") == 0 ]] || { docker logs "$container" >&2; exit 1; }
bash "$script_dir/verify-health.sh"
