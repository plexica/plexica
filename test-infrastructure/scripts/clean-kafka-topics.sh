#!/bin/bash

# ===================================================================
# Plexica Kafka Topic Cleanup Script
# ===================================================================
# This script deletes all test-related Kafka topics to ensure a clean
# state before running integration tests. This prevents topic pollution
# from previous test runs that can cause consumer timing issues.
# Usage: ./test-infrastructure/scripts/clean-kafka-topics.sh

set -e

echo "🧹 Cleaning Kafka topics..."

# Get the root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Kafka broker address (Redpanda test container)
KAFKA_BROKER="localhost:19092"
REDPANDA_CONTAINER="plexica-redpanda-test"

# Check if Redpanda container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${REDPANDA_CONTAINER}$"; then
  echo "❌ Redpanda container '${REDPANDA_CONTAINER}' is not running"
  echo "   Run ./test-infrastructure/scripts/test-setup.sh first"
  exit 1
fi

# List of topics to delete (both main topics and DLQ topics)
TOPICS=(
  "plexica.auth.user.lifecycle"
  "plexica.workspace.lifecycle"
  "plexica.workspace.resource.lifecycle"
  "dlq.plexica.auth.user.lifecycle"
  "dlq.plexica.workspace.lifecycle"
  "dlq.plexica.workspace.resource.lifecycle"
)

echo "📋 Topics to delete:"
for topic in "${TOPICS[@]}"; do
  echo "   - $topic"
done
echo ""

# Delete each topic (ignore errors if topic doesn't exist)
for topic in "${TOPICS[@]}"; do
  echo "🗑️  Deleting topic: $topic"
  docker exec "$REDPANDA_CONTAINER" rpk topic delete "$topic" --brokers "$KAFKA_BROKER" 2>/dev/null || {
    echo "   ℹ️  Topic '$topic' does not exist (skipping)"
  }
done

echo ""
echo "✅ Kafka topic cleanup complete!"
echo ""
echo "💡 Next steps:"
echo "   cd apps/core-api"
echo "   NODE_ENV=test pnpm test:integration user-sync.integration.test.ts"
echo ""
