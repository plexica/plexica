#!/usr/bin/env bash
set -euo pipefail

docker compose -f docker-compose.yml -f docker-compose.ci.yml \
  up -d --wait --wait-timeout 300 \
  postgres keycloak redis minio redpanda mailpit loki

for service in redpanda-init keycloak-init; do
  docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d "$service"
  container="plexica-ci-${service}-1"
  exit_code=$(docker wait "$container")
  if [[ "$exit_code" != "0" ]]; then
    echo "$service failed with exit code $exit_code" >&2
    docker logs "$container" >&2
    exit 1
  fi
  echo "$service completed successfully."
done
