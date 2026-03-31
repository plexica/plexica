#!/usr/bin/env bash
# create-topics.sh
# Creates the core Plexica topics in Redpanda on startup.
# Idempotent: uses --if-not-exists to handle restarts gracefully.

set -euo pipefail

BROKER="${REDPANDA_BROKER:-redpanda:9092}"
RETENTION_MS=$((7 * 24 * 60 * 60 * 1000))  # 7 days

echo "Waiting for Redpanda to be ready..."
until rpk cluster info --brokers "$BROKER" > /dev/null 2>&1; do
  echo "  Redpanda not ready yet, retrying in 2s..."
  sleep 2
done
echo "Redpanda is ready."

TOPICS=("tenant.events" "user.events" "plugin.events")

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
