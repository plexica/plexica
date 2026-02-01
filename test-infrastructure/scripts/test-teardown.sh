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

# Stop Docker containers
echo ""
echo "🐳 Stopping Docker containers..."
cd "$DOCKER_DIR"
docker-compose -f docker-compose.test.yml down -v

echo ""
echo "✅ Test infrastructure stopped and cleaned up"
echo ""
