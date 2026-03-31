#!/usr/bin/env bash
# create-topics.sh
# Creates the core Plexica topics in Redpanda on startup.
# Idempotent: rpk topic create is safe to re-run (ignores TOPIC_ALREADY_EXISTS).

set -euo pipefail

BROKER="${REDPANDA_BROKER:-redpanda:19092}"
BROKER_HOST="${BROKER%%:*}"
BROKER_PORT="${BROKER##*:}"
RETENTION_MS=$((7 * 24 * 60 * 60 * 1000))  # 7 days

# Wait for TCP port to be open using bash /dev/tcp (no external tools needed).
# The service_healthy dependency guarantees the Admin API is up, but we need the
# Kafka listener on 9092 to accept connections from this container as well.
echo "Waiting for Kafka TCP port at $BROKER_HOST:$BROKER_PORT..."
RETRIES=30
until (echo > /dev/tcp/"$BROKER_HOST"/"$BROKER_PORT") 2>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    echo "ERROR: Kafka TCP port $BROKER not open after 60s." >&2
    exit 1
  fi
  echo "  Port not open yet, retrying in 2s... ($RETRIES retries left)"
  sleep 2
done
echo "Kafka TCP port is open."

TOPICS=("plexica.tenant.events" "plexica.user.events" "plexica.plugin.events")

for TOPIC in "${TOPICS[@]}"; do
  echo "Creating topic: $TOPIC"
  timeout 30 rpk topic create "$TOPIC" \
    --brokers "$BROKER" \
    --partitions 1 \
    --replicas 1 \
    --topic-config "retention.ms=${RETENTION_MS}" || true
done

echo "Topic list:"
timeout 10 rpk topic list --brokers "$BROKER" || true
echo "Done."
