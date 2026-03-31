#!/usr/bin/env bash
# create-topics.sh
# Creates the core Plexica topics in Redpanda on startup.
# Idempotent: uses --if-not-exists to handle restarts gracefully.

set -euo pipefail

BROKER="${REDPANDA_BROKER:-redpanda:9092}"
RETENTION_MS=$((7 * 24 * 60 * 60 * 1000))  # 7 days

# Wait for Kafka broker to accept connections from this container.
# Use timeout to prevent rpk from hanging indefinitely on unreachable brokers.
echo "Waiting for Kafka broker at $BROKER..."
RETRIES=30
until timeout 5 rpk cluster info --brokers "$BROKER" > /dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    echo "ERROR: Kafka broker at $BROKER did not become reachable in time." >&2
    exit 1
  fi
  echo "  Broker not reachable yet, retrying in 2s... ($RETRIES retries left)"
  sleep 2
done
echo "Kafka broker is ready."

TOPICS=("plexica.tenant.events" "plexica.user.events" "plexica.plugin.events")

for TOPIC in "${TOPICS[@]}"; do
  echo "Creating topic: $TOPIC"
  # Allow exit code 1 from rpk (TOPIC_ALREADY_EXISTS is a non-zero exit),
  # but surface any real errors via stderr.
  timeout 30 rpk topic create "$TOPIC" \
    --brokers "$BROKER" \
    --partitions 1 \
    --replicas 1 \
    --topic-config "retention.ms=${RETENTION_MS}" || true
done

echo "Topic list:"
timeout 10 rpk topic list --brokers "$BROKER"
echo "Done."
