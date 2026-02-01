#!/bin/bash
# File: scripts/quickstart-setup.sh
# Automated quickstart setup script for Plexica development environment
# This script sets up everything you need to start developing with Plexica

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Print colored output
print_header() {
    echo -e "\n${MAGENTA}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${MAGENTA}║${NC}  ${CYAN}$1${NC}"
    echo -e "${MAGENTA}╚════════════════════════════════════════════════════════════╝${NC}\n"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_step() {
    echo -e "${CYAN}▶️  $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"
    
    local missing_deps=0
    
    # Check for Node.js
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node --version)
        print_success "Node.js $NODE_VERSION installed"
    else
        print_error "Node.js is not installed"
        missing_deps=1
    fi
    
    # Check for pnpm
    if command -v pnpm >/dev/null 2>&1; then
        PNPM_VERSION=$(pnpm --version)
        print_success "pnpm $PNPM_VERSION installed"
    else
        print_error "pnpm is not installed. Install with: npm install -g pnpm"
        missing_deps=1
    fi
    
    # Check for Docker
    if command -v docker >/dev/null 2>&1; then
        DOCKER_VERSION=$(docker --version | cut -d ' ' -f3 | sed 's/,//')
        print_success "Docker $DOCKER_VERSION installed"
    else
        print_error "Docker is not installed"
        missing_deps=1
    fi
    
    # Check for Docker Compose
    if command -v docker compose >/dev/null 2>&1; then
        print_success "Docker Compose installed"
    else
        print_error "Docker Compose is not installed"
        missing_deps=1
    fi
    
    if [ $missing_deps -eq 1 ]; then
        print_error "Missing required dependencies. Please install them and try again."
        exit 1
    fi
    
    print_success "All prerequisites met!"
}

# Install dependencies
install_dependencies() {
    print_header "Installing Dependencies"
    
    cd "$PROJECT_ROOT"
    
    if [ -d "node_modules" ]; then
        print_info "node_modules exists. Skipping installation..."
        print_info "Run 'pnpm install' manually if you need to reinstall"
    else
        print_step "Running pnpm install..."
        pnpm install
        print_success "Dependencies installed successfully"
    fi
}

# Setup environment files
setup_environment() {
    print_header "Setting Up Environment Files"
    
    # Check for root .env
    if [ ! -f "$PROJECT_ROOT/.env" ]; then
        if [ -f "$PROJECT_ROOT/.env.example" ]; then
            print_step "Copying .env.example to .env"
            cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
            print_success "Created .env file"
            print_warning "Please review and update .env with your settings"
        else
            print_warning ".env.example not found. Skipping environment setup."
        fi
    else
        print_info ".env file already exists. Skipping."
    fi
    
    # Check for database .env
    DB_ENV="$PROJECT_ROOT/packages/database/.env"
    if [ ! -f "$DB_ENV" ]; then
        if [ -f "$DB_ENV.example" ]; then
            print_step "Copying database .env.example to .env"
            cp "$DB_ENV.example" "$DB_ENV"
            print_success "Created database .env file"
        fi
    else
        print_info "Database .env file already exists. Skipping."
    fi
}

# Start Docker services
start_services() {
    print_header "Starting Docker Services"
    
    cd "$PROJECT_ROOT"
    
    print_step "Starting PostgreSQL, Redis, Keycloak, MinIO..."
    
    # Check if docker-compose.test.yml exists
    if [ -f "test-infrastructure/docker/docker-compose.test.yml" ]; then
        docker compose -f test-infrastructure/docker/docker-compose.test.yml up -d
        print_success "Docker services started successfully"
    else
        print_error "docker-compose.test.yml not found"
        exit 1
    fi
    
    print_info "Waiting for services to be healthy (this may take 30-60 seconds)..."
    sleep 10
    
    # Wait for PostgreSQL
    print_step "Waiting for PostgreSQL..."
    timeout 60 bash -c 'until docker exec plexica-postgres-test pg_isready -U plexica > /dev/null 2>&1; do sleep 2; done' && print_success "PostgreSQL is ready" || print_warning "PostgreSQL health check timed out"
    
    # Wait for Redis
    print_step "Waiting for Redis..."
    timeout 30 bash -c 'until docker exec plexica-redis-test redis-cli ping > /dev/null 2>&1; do sleep 2; done' && print_success "Redis is ready" || print_warning "Redis health check timed out"
    
    # Wait for MinIO
    print_step "Waiting for MinIO..."
    timeout 30 bash -c 'until curl -sf http://localhost:9000/minio/health/live > /dev/null 2>&1; do sleep 2; done' && print_success "MinIO is ready" || print_warning "MinIO health check timed out"
    
    # Wait for Keycloak (takes longer)
    print_step "Waiting for Keycloak (this takes ~90 seconds)..."
    timeout 120 bash -c 'until curl -sf http://localhost:8080/health/ready > /dev/null 2>&1; do sleep 3; done' && print_success "Keycloak is ready" || print_warning "Keycloak health check timed out"
}

# Run database migrations
run_migrations() {
    print_header "Running Database Migrations"
    
    cd "$PROJECT_ROOT"
    
    print_step "Generating Prisma client..."
    pnpm --filter @plexica/database db:generate
    print_success "Prisma client generated"
    
    print_step "Running migrations..."
    pnpm --filter @plexica/database db:migrate:deploy
    print_success "Migrations completed"
}

# Seed database with quickstart data
seed_database() {
    print_header "Seeding Database with Quickstart Data"
    
    cd "$PROJECT_ROOT/packages/database"
    
    print_step "Running quickstart seed script..."
    pnpm tsx prisma/seed.quickstart.ts
    print_success "Database seeded successfully"
}

# Display final instructions
show_completion() {
    print_header "🎉 Quickstart Setup Complete! 🎉"
    
    echo -e "${CYAN}╭─────────────────────────────────────────────────────────────╮${NC}"
    echo -e "${CYAN}│${NC}  ${GREEN}Your Plexica development environment is ready!${NC}           ${CYAN}│${NC}"
    echo -e "${CYAN}╰─────────────────────────────────────────────────────────────╯${NC}\n"
    
    echo -e "${YELLOW}📊 What was created:${NC}"
    echo -e "   • ${GREEN}Tenant:${NC}     quickstart-demo"
    echo -e "   • ${GREEN}Plugins:${NC}    2 demo plugins (CRM + Dashboard)"
    echo -e "   • ${GREEN}Users:${NC}      2 users (Admin + Member)"
    echo -e "   • ${GREEN}Workspace:${NC}  1 default workspace"
    echo ""
    
    echo -e "${YELLOW}🔐 Login Credentials:${NC}"
    echo -e "   • ${CYAN}Admin:${NC}   admin@quickstart-demo.com"
    echo -e "   • ${CYAN}Member:${NC}  member@quickstart-demo.com"
    echo -e "   ${BLUE}(Configure passwords in Keycloak)${NC}"
    echo ""
    
    echo -e "${YELLOW}🚀 Next Steps:${NC}"
    echo -e "   1. Start the dev server:  ${CYAN}pnpm dev${NC}"
    echo -e "   2. Open your browser:     ${CYAN}http://localhost:3000${NC}"
    echo -e "   3. Login with admin credentials"
    echo -e "   4. Explore the plugins and marketplace!"
    echo ""
    
    echo -e "${YELLOW}📚 Useful Commands:${NC}"
    echo -e "   • ${CYAN}pnpm dev${NC}              - Start development server"
    echo -e "   • ${CYAN}pnpm test${NC}             - Run all tests"
    echo -e "   • ${CYAN}pnpm infra:status${NC}     - Check Docker services status"
    echo -e "   • ${CYAN}pnpm infra:stop${NC}       - Stop Docker services"
    echo -e "   • ${CYAN}pnpm db:studio${NC}        - Open Prisma Studio"
    echo ""
    
    echo -e "${YELLOW}📖 Documentation:${NC}"
    echo -e "   • Quickstart Guide:  ${CYAN}./QUICKSTART_GUIDE.md${NC}"
    echo -e "   • API Docs:          ${CYAN}https://docs.plexica.io${NC}"
    echo -e "   • Plugin Dev:        ${CYAN}https://docs.plexica.io/plugins${NC}"
    echo ""
    
    echo -e "${GREEN}Happy coding! 🎉${NC}\n"
}

# Cleanup function for errors
cleanup_on_error() {
    print_error "Setup failed! Cleaning up..."
    cd "$PROJECT_ROOT"
    docker compose -f test-infrastructure/docker/docker-compose.test.yml down 2>/dev/null || true
}

# Main execution
main() {
    # Set trap for errors
    trap cleanup_on_error ERR
    
    echo -e "${MAGENTA}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                                                               ║"
    echo "║        🚀 PLEXICA QUICKSTART SETUP SCRIPT 🚀                 ║"
    echo "║                                                               ║"
    echo "║   This script will set up your complete development          ║"
    echo "║   environment in just a few minutes!                          ║"
    echo "║                                                               ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}\n"
    
    # Execute setup steps
    check_prerequisites
    install_dependencies
    setup_environment
    start_services
    run_migrations
    seed_database
    show_completion
}

# Run main function
main "$@"
