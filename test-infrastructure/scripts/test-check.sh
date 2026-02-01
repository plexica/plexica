#!/bin/bash

# ===================================================================
# Plexica Test Prerequisites Check
# ===================================================================
# This script verifies that all prerequisites are installed

echo "🔍 Checking test prerequisites..."
echo ""

# Check Docker
if command -v docker &> /dev/null; then
  echo "✅ Docker is installed: $(docker --version)"
else
  echo "❌ Docker is NOT installed"
  exit 1
fi

# Check Docker Compose
if docker compose version &> /dev/null; then
  echo "✅ Docker Compose is installed: $(docker compose version)"
elif command -v docker-compose &> /dev/null; then
  echo "✅ Docker Compose is installed: $(docker-compose --version)"
else
  echo "❌ Docker Compose is NOT installed"
  exit 1
fi

# Check Node.js
if command -v node &> /dev/null; then
  echo "✅ Node.js is installed: $(node --version)"
else
  echo "❌ Node.js is NOT installed"
  exit 1
fi

# Check pnpm
if command -v pnpm &> /dev/null; then
  echo "✅ pnpm is installed: $(pnpm --version)"
  HAS_PNPM=true
else
  echo "⚠️  pnpm is NOT installed (will use npm)"
  HAS_PNPM=false
fi

# Check npm
if command -v npm &> /dev/null; then
  echo "✅ npm is installed: $(npm --version)"
else
  echo "❌ npm is NOT installed"
  exit 1
fi

# Check if dependencies are installed
echo ""
echo "🔍 Checking project dependencies..."

if [ "$HAS_PNPM" = true ]; then
  if [ -d "node_modules" ] && [ -d "node_modules/@prisma/client" ]; then
    echo "✅ Dependencies are installed"
  else
    echo "⚠️  Dependencies not installed. Running: pnpm install"
    pnpm install || {
      echo "❌ Failed to install dependencies"
      exit 1
    }
  fi
else
  if [ -d "node_modules" ] && [ -d "node_modules/@prisma/client" ]; then
    echo "✅ Dependencies are installed"
  else
    echo "⚠️  Dependencies not installed. Running: npm install"
    npm install || {
      echo "❌ Failed to install dependencies"
      exit 1
    }
  fi
fi

# Check if Docker daemon is running
echo ""
echo "🔍 Checking Docker daemon..."
if docker ps &> /dev/null; then
  echo "✅ Docker daemon is running"
else
  echo "❌ Docker daemon is NOT running. Please start Docker."
  exit 1
fi

# Check available ports
echo ""
echo "🔍 Checking if test ports are available..."

check_port() {
  local port=$1
  local service=$2
  if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Port $port ($service) is already in use"
    return 1
  else
    echo "✅ Port $port ($service) is available"
    return 0
  fi
}

ALL_PORTS_FREE=true
check_port 5433 "PostgreSQL" || ALL_PORTS_FREE=false
check_port 8081 "Keycloak" || ALL_PORTS_FREE=false
check_port 6380 "Redis" || ALL_PORTS_FREE=false
check_port 9010 "MinIO API" || ALL_PORTS_FREE=false
check_port 9011 "MinIO Console" || ALL_PORTS_FREE=false

if [ "$ALL_PORTS_FREE" = false ]; then
  echo ""
  echo "⚠️  Some ports are already in use. You may need to:"
  echo "   1. Stop services using those ports"
  echo "   2. Run: ./test-infrastructure/scripts/test-teardown.sh"
  echo "   3. Or change ports in test-infrastructure/docker/docker-compose.test.yml"
fi

echo ""
echo "✅ All prerequisites are met!"
echo ""
echo "📝 Next steps:"
echo "   1. Start test infrastructure: ./test-infrastructure/scripts/test-setup.sh"
echo "   2. Run tests: cd apps/core-api && npm run test:unit"
echo ""
