#!/bin/bash

# Plexica - Docker Check and Start Helper

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🐳 Plexica Infrastructure Startup${NC}"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker is not installed${NC}"
    echo ""
    echo "Please install Docker Desktop:"
    echo "  https://www.docker.com/products/docker-desktop"
    exit 1
fi

echo -e "${GREEN}✓ Docker is installed${NC}"

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo -e "${YELLOW}⚠ Docker Desktop is not running${NC}"
    echo ""
    echo "Starting Docker Desktop..."
    
    # Try to start Docker Desktop
    open -a Docker
    
    echo "Waiting for Docker to start..."
    
    # Wait up to 60 seconds for Docker to start
    for i in {1..60}; do
        if docker info &> /dev/null; then
            echo -e "${GREEN}✓ Docker Desktop is now running${NC}"
            break
        fi
        echo -n "."
        sleep 1
        
        if [ $i -eq 60 ]; then
            echo ""
            echo -e "${RED}✗ Docker failed to start within 60 seconds${NC}"
            echo ""
            echo "Please start Docker Desktop manually:"
            echo "  1. Open Docker Desktop from Applications"
            echo "  2. Wait for the whale icon to be active in the menu bar"
            echo "  3. Run this script again"
            exit 1
        fi
    done
    echo ""
else
    echo -e "${GREEN}✓ Docker Desktop is running${NC}"
fi

echo ""
echo -e "${BLUE}Starting Plexica infrastructure services...${NC}"
echo ""

# Start infrastructure using the infra script
./scripts/infra.sh start
