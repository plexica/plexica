#!/usr/bin/env bash
set -euo pipefail

project=${CI_COMPOSE_PROJECT:?CI_COMPOSE_PROJECT is required}
runtime=${CI_RUNTIME_DIR:?CI_RUNTIME_DIR is required}
script_dir=$(dirname "$0")
compose=(docker compose --project-name "$project" -f docker-compose.yml -f docker-compose.ci.yml)

bash "$script_dir/verify-ci-compose-render.sh" "$project"
"${compose[@]}" create postgres redis minio keycloak mailpit loki
"${compose[@]}" start postgres redis minio keycloak mailpit loki
"${compose[@]}" create redpanda
bash "$script_dir/ci-runtime-compose.sh" write-infra
bash "$script_dir/ci-runtime-compose.sh" write-redpanda
"${compose[@]}" start redpanda
