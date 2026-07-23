#!/usr/bin/env bash
set -euo pipefail

ensure_topic() {
  topic="$1"
  retention_ms="$2"
  docker exec plexica-ci-redpanda-1 rpk topic create "$topic" \
    --brokers localhost:9092 --partitions 1 --replicas 1 || true
  docker exec plexica-ci-redpanda-1 rpk topic alter-config "$topic" \
    --set "retention.ms=${retention_ms}" --brokers localhost:9092
  docker exec plexica-ci-redpanda-1 rpk topic describe "$topic" -c \
    --brokers localhost:9092 | grep -Eq "retention.ms[[:space:]]+${retention_ms}"
}

for topic in plexica.tenant.events plexica.user.events plexica.plugin.events; do
  ensure_topic "$topic" 604800000
done
ensure_topic plexica.plugin.dlq 2592000000
docker exec plexica-ci-redpanda-1 rpk topic list --brokers localhost:9092
