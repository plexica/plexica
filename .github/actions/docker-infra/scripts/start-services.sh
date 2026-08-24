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

bash "$script_dir/verify-ci-compose-render.sh" "$project"
bash "$script_dir/verify-ci-runtime-artifacts.sh"
"${compose[@]}" create postgres redis minio keycloak mailpit loki
"${compose[@]}" start postgres redis minio keycloak mailpit loki
"${compose[@]}" create redpanda
bash "$script_dir/ci-runtime-compose.sh" write-redpanda
"${compose[@]}" start redpanda
