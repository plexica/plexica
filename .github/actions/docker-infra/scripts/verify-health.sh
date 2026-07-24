#!/usr/bin/env bash
set -euo pipefail

compose=(docker compose -f docker-compose.yml -f docker-compose.ci.yml)
required=(postgres keycloak redis minio redpanda mailpit loki)

"${compose[@]}" ps
for service in "${required[@]}"; do
  container=$("${compose[@]}" ps -q "$service")
  if [[ -z "$container" ]]; then
    printf '%s is not running.\n' "$service" >&2
    exit 1
  fi
  state=$(docker inspect --format '{{.State.Status}}' "$container")
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$container")
  if [[ "$state" != "running" || "$health" != "healthy" ]]; then
    printf '%s is not healthy (state=%s, health=%s).\n' "$service" "$state" "$health" >&2
    docker logs "$container" >&2
    exit 1
  fi
  printf '%s is healthy.\n' "$service"
done
