#!/usr/bin/env bash
set -euo pipefail

# One-shot init containers are handled after long-running services are healthy.
docker compose -f docker-compose.yml -f docker-compose.ci.yml \
  up -d postgres keycloak redis minio redpanda mailpit loki
