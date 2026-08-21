#!/usr/bin/env bash
set -euo pipefail

project=${CI_COMPOSE_PROJECT:?CI_COMPOSE_PROJECT is required}
runtime=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
script_dir=$(dirname "$0")
compose=(docker compose --project-name "$project" -f docker-compose.yml -f docker-compose.ci.yml)

"${compose[@]}" up -d --wait --wait-timeout 300 postgres redis minio keycloak redpanda mailpit loki
"${compose[@]}" up -d redpanda-init
for service in redpanda-init; do
  container=$("${compose[@]}" ps -q "$service")
  [[ -n "$container" ]] || { echo "$service was not created" >&2; exit 1; }
  [[ $(docker wait "$container") == 0 ]] || { docker logs "$container" >&2; exit 1; }
done
bash "$script_dir/ci-runtime-compose.sh" write-infra
set -a; source "$runtime/host.env"; set +a
DATABASE_URL="$POSTGRES_HOST_URL" pnpm --filter core-api exec prisma migrate deploy
DATABASE_URL="$POSTGRES_HOST_URL" pnpm --filter core-api exec prisma migrate status
"${compose[@]}" create core-api-e2e
"${compose[@]}" start core-api-e2e
bash "$script_dir/ci-runtime-compose.sh" write-core
"${compose[@]}" create web-e2e admin-e2e
bash "$script_dir/ci-runtime-compose.sh" write-browser
"${compose[@]}" start web-e2e admin-e2e
"${compose[@]}" up -d keycloak-init
container=$("${compose[@]}" ps -q keycloak-init)
[[ -n "$container" && $(docker wait "$container") == 0 ]] || { docker logs "$container" >&2; exit 1; }
bash "$script_dir/verify-health.sh"
