#!/usr/bin/env bash
set -euo pipefail

project=${CI_COMPOSE_PROJECT:?CI_COMPOSE_PROJECT is required}
runtime=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
compose=(docker compose --project-name "$project" -f docker-compose.yml -f docker-compose.ci.yml)
required=(postgres keycloak redis minio redpanda mailpit loki core-api-e2e web-e2e admin-e2e)
for service in "${required[@]}"; do
  container=$("${compose[@]}" ps -q "$service")
  [[ -n "$container" ]] || { echo "$service is not running" >&2; exit 1; }
  [[ $(docker inspect --format '{{.State.Status}}' "$container") == running ]] || { echo "$service is not running" >&2; exit 1; }
done
set -a; source "$runtime/host.env"; set +a
for url in "$CORE_API_PUBLIC_BASE/health" "$WEB_E2E_PUBLIC_BASE" "$ADMIN_E2E_PUBLIC_BASE"; do
  curl --fail --silent --show-error --max-time 15 "$url" >/dev/null
done
