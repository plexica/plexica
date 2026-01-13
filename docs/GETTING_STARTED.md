# Plexica - Getting Started Guide

This guide will help you set up the Plexica development environment on your local machine.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** >= 20.0.0 ([Download](https://nodejs.org/))
- **pnpm** >= 8.0.0 (install with `npm install -g pnpm`)
- **Docker Desktop** ([Download](https://www.docker.com/products/docker-desktop))
- **Git** ([Download](https://git-scm.com/downloads))

Verify installations:
```bash
node --version    # Should be v20.x.x or higher
pnpm --version    # Should be 8.x.x or higher
docker --version  # Should be 24.x.x or higher
git --version
```

## Quick Setup (5 minutes)

### 1. Clone the repository

```bash
git clone <repository-url> plexica
cd plexica
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Start infrastructure services

```bash
pnpm infra:start
```

This will start:
- PostgreSQL (port 5432)
- Redis (port 6379)
- Keycloak (port 8080)
- Redpanda (port 9092)
- MinIO (port 9000, 9001)

Wait for all services to be healthy (~2 minutes).

### 4. Run database migrations

```bash
pnpm db:migrate
```

### 5. Start development servers

```bash
pnpm dev
```

The Core API will be available at: **http://localhost:3000**

API Documentation: **http://localhost:3000/docs**

## Detailed Setup

### Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

The default values work for local development. For production, you'll need to change:
- `JWT_SECRET`
- `KEYCLOAK_ADMIN_PASSWORD`
- Database credentials
- Storage credentials

### Infrastructure Services

#### Starting services

```bash
pnpm infra:start
```

#### Checking status

```bash
pnpm infra:status
```

#### Viewing logs

```bash
# All services
pnpm infra:logs

# Specific service
pnpm infra:logs postgres
pnpm infra:logs keycloak
```

#### Stopping services

```bash
pnpm infra:stop
```

#### Cleaning up (removes all data!)

```bash
pnpm infra:clean
```

### Database Management

#### Running migrations

```bash
# Development (creates migration if schema changed)
pnpm db:migrate

# Production (applies existing migrations)
pnpm db:migrate:deploy
```

#### Generating Prisma Client

```bash
pnpm db:generate
```

#### Opening Prisma Studio (Database GUI)

```bash
pnpm db:studio
```

Access at: **http://localhost:5555**

### Development Workflow

#### Running specific apps

```bash
# Core API only
pnpm dev --filter @plexica/core-api

# Web app only (when available)
pnpm dev --filter @plexica/web

# Multiple apps
pnpm dev --filter @plexica/core-api --filter @plexica/web
```

#### Building

```bash
# Build all
pnpm build

# Build specific app
pnpm build --filter @plexica/core-api
```

#### Testing

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm test --filter @plexica/core-api

# Run tests in watch mode
pnpm test --filter @plexica/core-api -- --watch
```

#### Linting and formatting

```bash
# Lint all packages
pnpm lint

# Format all files
pnpm format
```

## Project Structure

```
plexica/
├── apps/
│   ├── core-api/              # Core API Service (Fastify)
│   ├── web/                   # Frontend Web App (React) [TODO]
│   ├── super-admin/           # Super Admin Panel [TODO]
│   └── plugins/               # Internal plugins [TODO]
│
├── packages/
│   ├── database/              # Prisma schema & client
│   ├── sdk/                   # Plugin SDK [TODO]
│   ├── types/                 # Shared TypeScript types [TODO]
│   └── ...
│
├── infrastructure/
│   ├── docker/                # Docker configurations
│   └── helm/                  # Kubernetes Helm charts [TODO]
│
├── scripts/
│   └── infra.sh              # Infrastructure management script
│
└── docs/                      # Documentation
```

## Common Tasks

### Creating a new migration

1. Edit `packages/database/prisma/schema.prisma`
2. Run `pnpm db:migrate --name your_migration_name`
3. Review the generated SQL in `packages/database/prisma/migrations/`

### Resetting the database

```bash
# Stop and remove database
pnpm infra:clean

# Start fresh
pnpm infra:start
pnpm db:migrate
```

### Accessing services

| Service | URL | Credentials |
|---------|-----|-------------|
| Core API | http://localhost:3000 | - |
| API Docs | http://localhost:3000/docs | - |
| Keycloak | http://localhost:8080 | admin/admin |
| Prisma Studio | http://localhost:5555 | - |
| Redpanda Console | http://localhost:8090 | - |
| MinIO Console | http://localhost:9001 | minioadmin/minioadmin |

## Troubleshooting

### Port already in use

If you see errors about ports being in use:

```bash
# Check what's using a port (e.g., 3000)
lsof -i :3000

# Kill the process
kill -9 <PID>
```

### Docker issues

```bash
# Restart Docker Desktop

# Or clean up Docker
docker system prune -a
docker volume prune
```

### Database connection issues

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check logs
pnpm infra:logs postgres

# Reset database
pnpm infra:clean
pnpm infra:start
```

### Prisma issues

```bash
# Regenerate Prisma Client
pnpm db:generate

# Clear Prisma cache
rm -rf node_modules/.prisma
pnpm install
```

## Next Steps

- [ ] Read the [Architecture Overview](../../plexica-specs/specs/FUNCTIONAL_SPECIFICATIONS.md)
- [ ] Review the [Technical Specifications](../../plexica-specs/specs/TECHNICAL_SPECIFICATIONS.md)
- [ ] Check the [Development Plan](../../plexica-specs/planning/DEVELOPMENT_PLAN.md)
- [ ] Look at [Open Issues](https://github.com/your-org/plexica/issues)

## Getting Help

- Check the [Documentation](../README.md)
- Review [Common Issues](./TROUBLESHOOTING.md)
- Ask in the team chat
- Create an issue on GitHub

---

**Happy coding!** 🚀
