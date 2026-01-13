# Plexica

Cloud-native multi-tenant platform with plugin architecture.

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Docker and Docker Compose
- PostgreSQL 15+
- Redis 7+
- Keycloak 23+

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Setup environment variables

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Start infrastructure

```bash
docker-compose up -d
```

### 4. Run database migrations

```bash
pnpm db:migrate
```

### 5. Start development servers

```bash
pnpm dev
```

## Project Structure

```
plexica/
├── apps/
│   ├── core-api/              # Core API Service (Fastify)
│   ├── web/                   # Frontend Web App (React)
│   ├── super-admin/           # Super Admin Panel
│   └── plugins/               # Internal plugins
│       ├── crm/
│       ├── billing/
│       └── analytics/
│
├── packages/
│   ├── sdk/                   # Plugin SDK (@plexica/sdk)
│   ├── types/                 # Shared TypeScript types
│   ├── api-client/            # Frontend API client
│   ├── ui/                    # Shared UI components
│   ├── config/                # Shared configs
│   └── database/              # Prisma schema & migrations
│
├── infrastructure/
│   ├── helm/                  # Helm charts for K8s
│   ├── terraform/             # Infrastructure as Code
│   ├── docker/                # Dockerfiles
│   └── k8s/                   # Kubernetes manifests
│
├── docs/                      # Documentation
└── tools/                     # CLI and utilities
```

## Available Commands

```bash
# Development
pnpm dev                       # Start all apps in dev mode
pnpm dev --filter core-api     # Start only core-api
pnpm dev --filter web          # Start only frontend

# Build
pnpm build                     # Build all packages
pnpm build --filter core-api   # Build specific package

# Database
pnpm db:migrate                # Run Prisma migrations
pnpm db:studio                 # Open Prisma Studio
pnpm db:generate               # Generate Prisma Client

# Testing
pnpm test                      # Run all tests
pnpm test --filter core-api    # Run tests for specific package

# Linting & Formatting
pnpm lint                      # Lint all packages
pnpm format                    # Format all files with Prettier

# Cleanup
pnpm clean                     # Clean all build artifacts
```

## Documentation

- [Functional Specifications](../plexica-specs/specs/FUNCTIONAL_SPECIFICATIONS.md)
- [Technical Specifications](../plexica-specs/specs/TECHNICAL_SPECIFICATIONS.md)
- [Project Structure](../plexica-specs/specs/PROJECT_STRUCTURE.md)
- [Plugin Strategy](../plexica-specs/specs/PLUGIN_STRATEGY.md)
- [Development Plan](../plexica-specs/planning/DEVELOPMENT_PLAN.md)

## License

TBD

---

**Plexica v0.1.0-alpha** | Built with ❤️ by Plexica Engineering Team
