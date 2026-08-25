#!/usr/bin/env bash
set -euo pipefail

project=${CI_COMPOSE_PROJECT:?CI_COMPOSE_PROJECT is required}
runtime=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
source "$script_dir/ci-runtime-path.sh"
export CI_RUNTIME_SCOPE="$(bash "$script_dir/ci-runtime-scope.sh" "$project")"
wait_for_http="$script_dir/wait-for-http.sh"
root=$(cd -- "$script_dir/../../../.." && pwd)
compose=(docker compose --project-name "$project" -f "$root/docker-compose.yml" -f "$root/docker-compose.ci.yml")
validate_ci_runtime "$project" "$runtime"
required=(postgres keycloak redis minio redpanda mailpit loki core-api-e2e web-e2e admin-e2e)
for service in "${required[@]}"; do
  container=$("${compose[@]}" ps -q "$service")
  [[ -n "$container" ]] || { echo "$service is not running" >&2; exit 1; }
  [[ $(docker inspect --format '{{.State.Status}}' "$container") == running ]] || { echo "$service is not running" >&2; exit 1; }
done
source "$script_dir/source-ci-runtime-host.sh"
for url in "$CORE_API_PUBLIC_BASE/health" "$CORE_API_PUBLIC_BASE/api/v1/health" "$WEB_E2E_PUBLIC_BASE" "$ADMIN_E2E_PUBLIC_BASE"; do
  bash "$wait_for_http" "$url"
done
for url in "$WEB_E2E_PUBLIC_BASE/runtime-config.js" "$ADMIN_E2E_PUBLIC_BASE/runtime-config.js"; do
  config=$(curl --fail --silent --show-error --max-time 15 "$url")
  [[ "$config" == *'apiBase:""'* && "$config" == *"keycloakBase:\"${KEYCLOAK_PUBLIC_ISSUER_BASE}\""* ]] || {
    echo 'Runtime config is not the safe manifest projection' >&2; exit 1;
  }
  [[ "$config" != *CORE_API_PUBLIC_BASE* && "$config" != *core-api-e2e* ]] || {
    echo 'Runtime config exposes a private Core endpoint' >&2; exit 1;
  }
done
