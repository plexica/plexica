#!/usr/bin/env bash
set -euo pipefail

project=${CI_COMPOSE_PROJECT:?CI_COMPOSE_PROJECT is required}
compose=(docker compose --project-name "$project" -f docker-compose.yml -f docker-compose.ci.yml)
container=$("${compose[@]}" ps -q redpanda)
[[ -n "$container" ]] || { echo 'Redpanda is not running' >&2; exit 1; }
for topic in plexica.tenant.events plexica.user.events plexica.plugin.events; do
  docker exec "$container" rpk topic create "$topic" --brokers redpanda:9092 --partitions 1 --replicas 1 || true
  docker exec "$container" rpk topic alter-config "$topic" --set retention.ms=604800000 --brokers redpanda:9092
done
docker exec "$container" rpk topic create plexica.plugin.dlq --brokers redpanda:9092 --partitions 1 --replicas 1 || true
docker exec "$container" rpk topic alter-config plexica.plugin.dlq --set retention.ms=2592000000 --brokers redpanda:9092
