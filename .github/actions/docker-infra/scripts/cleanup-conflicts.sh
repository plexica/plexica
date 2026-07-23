#!/usr/bin/env bash
set -euo pipefail

docker compose -f docker-compose.yml -f docker-compose.ci.yml down -v --remove-orphans \
  2>/dev/null || true

for port in 5432 6379 8080 9000 19092 1025 3100 3301 9644 8025; do
  for project in plexica-ci plexica-dev; do
    container=$(docker ps -q \
      --filter "label=com.docker.compose.project=$project" \
      --filter "publish=$port" 2>/dev/null || true)
    if [[ -n "$container" ]]; then
      echo "Stopping container $container (project $project on port $port)"
      docker stop "$container" 2>/dev/null || true
      docker rm "$container" 2>/dev/null || true
    fi
  done
done
