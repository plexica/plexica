#!/usr/bin/env bash
# create-topics.sh
# Creates the core Plexica topics in Redpanda on startup.
# Idempotent: rpk topic create is safe to re-run (ignores TOPIC_ALREADY_EXISTS).

set -euo pipefail

BROKER="${REDPANDA_BROKER:-redpanda:9092}"
ADMIN_URL="${REDPANDA_ADMIN_URL:-http://redpanda:9644}"
RETENTION_MS=$((7 * 24 * 60 * 60 * 1000))  # 7 days

# Wait for at least one broker to appear in the Admin API response.
# The Admin API is available before the Kafka listener is fully initialised;
# checking /v1/brokers (not just /v1/status/ready) ensures the Kafka subsystem
# has registered itself.
echo "Waiting for Redpanda broker to register via Admin API at $ADMIN_URL..."
RETRIES=30
until curl -sf "$ADMIN_URL/v1/brokers" 2>/dev/null | grep -q '"node_id"'; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    echo "ERROR: No broker registered at $ADMIN_URL/v1/brokers after 60s." >&2
    exit 1
  fi
  echo "  No broker registered yet, retrying in 2s... ($RETRIES retries left)"
  sleep 2
done
echo "Redpanda broker is registered."

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
