#!/bin/bash

# Plexica Development Infrastructure Management Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    print_success "Docker is running"
}

# Start infrastructure
start() {
    print_info "Starting Plexica infrastructure..."
    check_docker
    
    docker-compose up -d
    
    print_info "Waiting for services to be healthy..."
    sleep 5
    
    # Wait for PostgreSQL
    until docker-compose exec -T postgres pg_isready -U plexica > /dev/null 2>&1; do
        echo -n "."
        sleep 1
    done
    print_success "PostgreSQL is ready"
    
    # Wait for Redis
    until docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; do
        echo -n "."
        sleep 1
    done
    print_success "Redis is ready"
    
    # Wait for Keycloak (this takes longer)
    print_info "Waiting for Keycloak (this may take a minute)..."
    until curl -sf http://localhost:8080/health/ready > /dev/null 2>&1; do
        echo -n "."
        sleep 2
    done
    print_success "Keycloak is ready"
    
    print_success "All services are running!"
    print_info "Services:"
    echo "  - PostgreSQL:      localhost:5432"
    echo "  - Redis:           localhost:6379"
    echo "  - Keycloak:        http://localhost:8080 (admin/admin)"
    echo "  - Redpanda:        localhost:9092"
    echo "  - Redpanda Console: http://localhost:8090"
    echo "  - MinIO:           http://localhost:9001 (minioadmin/minioadmin)"
}

# Stop infrastructure
stop() {
    print_info "Stopping Plexica infrastructure..."
    docker-compose down
    print_success "Infrastructure stopped"
}

# Restart infrastructure
restart() {
    stop
    start
}

# Show status
status() {
    print_info "Plexica infrastructure status:"
    docker-compose ps
}

# Show logs
logs() {
    SERVICE=${1:-}
    if [ -z "$SERVICE" ]; then
        docker-compose logs -f
    else
        docker-compose logs -f "$SERVICE"
    fi
}

# Clean everything (including volumes)
clean() {
    print_warning "This will remove all containers, volumes, and data!"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Cleaning up..."
        docker-compose down -v
        print_success "Cleanup complete"
    else
        print_info "Cancelled"
    fi
}

# Reset database
reset_db() {
    print_warning "This will reset the database and all data will be lost!"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Resetting database..."
        docker-compose stop postgres
        docker-compose rm -f postgres
        docker volume rm plexica_postgres_data || true
        docker-compose up -d postgres
        
        until docker-compose exec -T postgres pg_isready -U plexica > /dev/null 2>&1; do
            echo -n "."
            sleep 1
        done
        
        print_success "Database reset complete"
        print_info "Run 'pnpm db:migrate' to apply migrations"
    else
        print_info "Cancelled"
    fi
}

# Main command handler
case "${1:-}" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    status)
        status
        ;;
    logs)
        logs "${2:-}"
        ;;
    clean)
        clean
        ;;
    reset-db)
        reset_db
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs [service]|clean|reset-db}"
        echo ""
        echo "Commands:"
        echo "  start      - Start all infrastructure services"
        echo "  stop       - Stop all infrastructure services"
        echo "  restart    - Restart all infrastructure services"
        echo "  status     - Show status of all services"
        echo "  logs       - Show logs (optionally for specific service)"
        echo "  clean      - Remove all containers and volumes (DESTRUCTIVE)"
        echo "  reset-db   - Reset the database (DESTRUCTIVE)"
        exit 1
        ;;
esac
