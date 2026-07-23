#!/bin/sh
set -eu

brokers="${1:-redpanda:9092}"
week_ms=604800000
month_ms=2592000000

ensure_topic() {
  topic="$1"
  retention_ms="$2"
  rpk --brokers "$brokers" topic create "$topic" \
    --partitions 1 --replicas 1 >/dev/null 2>&1 || true
  rpk --brokers "$brokers" topic alter-config "$topic" \
    --set "retention.ms=$retention_ms"
  rpk --brokers "$brokers" topic describe "$topic" -c | \
    grep -Eq "retention.ms[[:space:]]+$retention_ms"
}

for topic in plexica.tenant.events plexica.user.events plexica.plugin.events; do
  ensure_topic "$topic" "$week_ms"
done
ensure_topic plexica.plugin.dlq "$month_ms"
rpk --brokers "$brokers" topic list
