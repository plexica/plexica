#!/usr/bin/env bash
set -euo pipefail

project=${CI_COMPOSE_PROJECT:?CI_COMPOSE_PROJECT is required}
[[ "$project" =~ ^plexica-ci-[a-z0-9][a-z0-9-]{5,45}$ ]] || { echo 'Invalid project' >&2; exit 1; }
resources=$(docker ps -aq --filter "label=com.docker.compose.project=$project")
for id in $resources; do
  [[ $(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$id") == "$project" ]] || {
    echo 'Refusing foreign container selection' >&2; exit 1;
  }
done
docker compose --project-name "$project" -f docker-compose.yml -f docker-compose.ci.yml down -v
