#!/usr/bin/env bash
# create-topics.sh
# Creates the core Plexica topics in Redpanda on startup.
# Idempotent: uses --if-not-exists to handle restarts gracefully.

set -euo pipefail

BROKER="${REDPANDA_BROKER:-redpanda:9092}"
RETENTION_MS=$((7 * 24 * 60 * 60 * 1000))  # 7 days

# Redpanda is guaranteed healthy (Kafka broker ready) by depends_on service_healthy.
echo "Redpanda is ready (guaranteed by service_healthy dependency)."

TOPICS=("plexica.tenant.events" "plexica.user.events" "plexica.plugin.events")

for TOPIC in "${TOPICS[@]}"; do
  echo "Creating topic: $TOPIC"
  rpk topic create "$TOPIC" \
    --brokers "$BROKER" \
    --partitions 1 \
    --replicas 1 \
    --topic-config "retention.ms=${RETENTION_MS}" \
    2>&1 | grep -v "TOPIC_ALREADY_EXISTS" || true
done

echo "Topic list:"
rpk topic list --brokers "$BROKER"
echo "Done."
