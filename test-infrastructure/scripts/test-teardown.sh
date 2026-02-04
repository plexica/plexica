#!/bin/bash

# ===================================================================
# Plexica Test Teardown Script
# ===================================================================
# This script stops the test infrastructure and cleans up resources
# Usage: ./test-infrastructure/scripts/test-teardown.sh

set -e

echo "🛑 Stopping Plexica test infrastructure..."

# Get the root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DOCKER_DIR="$ROOT_DIR/test-infrastructure/docker"

# Detect docker compose command (v2 uses 'docker compose', v1 uses 'docker-compose')
if docker compose version &> /dev/null; then
  DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
  DOCKER_COMPOSE="docker-compose"
else
  echo "❌ Neither 'docker compose' nor 'docker-compose' found"
  exit 1
fi

# Stop Docker containers
echo ""
echo "🐳 Stopping Docker containers..."
cd "$DOCKER_DIR"
$DOCKER_COMPOSE -f docker-compose.test.yml down -v

echo ""
echo "✅ Test infrastructure stopped and cleaned up"
echo ""
