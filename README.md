# Plexica

Cloud-native multi-tenant SaaS platform with extensible plugin architecture.

**Version**: 0.6.0-alpha  
**Status**: Phase 1 MVP - Backend ✅ | Frontend ✅ | Testing 🟡 | Workspaces ⏳  
**Last Updated**: January 14, 2026

---

## 📊 Project Status

**Current Phase**: Phase 1 - MVP Core (88% complete)  
**Completed Milestones**: M1.1-M1.4 (Backend) + M2.1-M2.2 (Frontend) ✅  
**In Progress**: M2.3 (Testing & Deployment - 50%), M2.4 (Workspaces - Pending)  
**Next**: Complete testing and integrate workspaces

👉 **See [STATUS.md](./STATUS.md) for detailed progress tracking**

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 8.0.0
- **Docker** and Docker Compose
- **Git**

### Installation

```bash
# 1. Clone repository
git clone https://github.com/[org]/plexica.git
cd plexica

# 2. Install dependencies
pnpm install

# 3. Setup environment variables
cp .env.example .env
# Edit .env with your configuration

# 4. Start infrastructure (PostgreSQL, Redis, Keycloak, Redpanda, MinIO)
docker-compose up -d

# 5. Wait for services to be healthy
pnpm infra:status

# 6. Generate Prisma Client (Prisma 7 with PostgreSQL adapter)
pnpm db:generate

# 7. Run database migrations
pnpm db:migrate

# 8. Start development server
pnpm dev
```

The Core API will be available at:

- **API**: http://localhost:3000
- **API Docs (Swagger)**: http://localhost:3000/docs
- **Health Check**: http://localhost:3000/health

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   PLEXICA PLATFORM                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐│
│  │  API Gateway │  │   Keycloak    │  │  Frontend    ││
│  │  (Kong/      │  │  (Auth/IdP)   │  │   Web        ││
│  │   Traefik)   │  │               │  │  (React)     ││
│  └──────┬───────┘  └───────┬───────┘  └──────────────┘│
│         │                   │                           │
│  ┌──────┴───────────────────┴────────────────────────┐ │
│  │              Core API Service (Fastify)          │ │
│  │  ✅ Tenant Management    ✅ Plugin Orchestration │ │
│  │  ✅ User Management      ✅ Permission Engine    │ │
│  │  ✅ RBAC/ABAC           ✅ Event Hooks           │ │
│  └───────────────────┬──────────────────────────────┘ │
│                      │                                 │
│  ┌───────────────────┴──────────────────────────────┐ │
│  │              Plugin Ecosystem                    │ │
│  │  ┌────────┐  ┌─────────┐  ┌──────────────────┐  │ │
│  │  │Sample  │  │ Future  │  │  Future         │  │ │
│  │  │Analyt. │  │ CRM     │  │  Billing ...    │  │ │
│  │  └────────┘  └─────────┘  └──────────────────┘  │ │
│  └──────────────────────────────────────────────────┘ │
│                      │                                 │
│  ┌───────────────────┴──────────────────────────────┐ │
│  │         Infrastructure Layer                     │ │
│  │  ┌──────────┐  ┌───────┐  ┌──────────────────┐  │ │
│  │  │PostgreSQL│  │ Redis │  │ Redpanda/Kafka   │  │ │
│  │  │    15    │  │   7   │  │  (Events)        │  │ │
│  │  └──────────┘  └───────┘  └──────────────────┘  │ │
│  │  ┌──────────────────────────────────────────┐   │ │
│  │  │      Object Storage (MinIO/S3)           │   │ │
│  │  └──────────────────────────────────────────┘   │ │
│  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 Key Features

### ✅ Multi-Tenancy

- Schema-per-tenant on PostgreSQL for complete data isolation
- Automatic tenant provisioning with Keycloak realm creation
- Tenant lifecycle management (create, suspend, delete)
- Per-tenant storage buckets in MinIO

### ✅ Authentication & Authorization

- Keycloak for Identity & Access Management
- Separate realms per tenant for isolation
- JWT token validation with JWKS
- RBAC with default roles and permission-based access control

### ✅ Plugin System

- Modular architecture with lifecycle management (install → activate → deactivate → uninstall)
- Plugin registry (global catalog) with configuration validation
- Dependency checking and hook/event system
- Module Federation support for frontend
- Sample analytics plugin included

### ⏳ Workspaces (88% Complete - M2.4)

- Organizational layer within tenants for better resource management
- Workspace hierarchy: Tenant → Workspace → Team
- Role-based access control (ADMIN, MEMBER, VIEWER)
- Workspace-scoped resources, teams, and member management
- Workspace switching UI in frontend
- Default workspace for backward compatibility

See **[specs/WORKSPACE_SPECIFICATIONS.md](./specs/WORKSPACE_SPECIFICATIONS.md)** for complete specification.

### Frontend (✅ Complete - M2.1, M2.2)

**Tenant Web App** (`apps/web` - port 3001):

- React 18 + Vite + TypeScript + TanStack Router/Query
- Tailwind CSS + shadcn/ui components
- Keycloak authentication (PKCE flow)
- Dashboard, plugin management, team management, settings
- Module Federation for dynamic plugin loading
- Responsive design with collapsible sidebar

**Super-Admin Panel** (`apps/super-admin` - port 3002):

- Platform management interface
- Tenant/plugin/user administration
- Analytics dashboard with charts
- Mock authentication for development

See **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** for detailed frontend architecture.

---

## 📁 Project Structure

```
plexica/
├── apps/
│   ├── core-api/              # ✅ Core API Service (Fastify)
│   ├── web/                   # ✅ Frontend Web App (React)
│   ├── super-admin/           # ✅ Super Admin Panel
│   └── plugins/               # Internal plugins (future)
│
├── packages/
│   ├── database/              # ✅ Prisma schema & migrations
│   ├── sdk/                   # ⚪ Plugin SDK - Planned
│   ├── types/                 # ⚪ Shared TypeScript types - Planned
│   ├── api-client/            # ⚪ Frontend API client - Planned
│   ├── ui/                    # ⚪ Shared UI components - Planned
│   └── config/                # ✅ Shared configs
│
├── plugins/                   # Example external plugins
│   └── sample-analytics/      # ✅ Sample analytics plugin
│
├── docs/                      # ✅ Documentation & guides
├── specs/                     # ✅ Technical specifications
├── planning/                  # ✅ Roadmap and milestones
└── infrastructure/            # ⚪ Docker, Helm, K8s (planned)
```

**Legend**: ✅ Complete | ⚪ Planned

See **[specs/PROJECT_STRUCTURE.md](./specs/PROJECT_STRUCTURE.md)** for detailed information.

---

## 🛠️ Technology Stack

### Backend (✅ Complete)

| Category   | Technology | Version | Status        |
| ---------- | ---------- | ------- | ------------- |
| Runtime    | Node.js    | 20 LTS  | ✅            |
| Language   | TypeScript | 5.9.3   | ✅            |
| Framework  | Fastify    | 5.7.1   | ✅            |
| ORM        | Prisma     | 7.2.0   | ✅            |
| Validation | Zod        | 3.x     | ✅            |
| Testing    | Vitest     | 1.x     | 📋 Configured |

### Infrastructure (✅ Complete)

| Service    | Version | Port      | Status     |
| ---------- | ------- | --------- | ---------- |
| PostgreSQL | 15      | 5432      | ✅ Running |
| Redis      | 7       | 6379      | ✅ Running |
| Keycloak   | 23      | 8080      | ✅ Running |
| Redpanda   | Latest  | 9092      | ✅ Running |
| MinIO      | Latest  | 9000/9001 | ✅ Running |

### Frontend (⚪ Planned)

- Framework: React 18+
- Build Tool: Vite 5.x
- Routing: TanStack Router
- State: TanStack Query + Zustand
- UI: Tailwind CSS + shadcn/ui
- Forms: React Hook Form 7.x

---

## 📋 Available Commands

### Development

```bash
# Start all apps in development mode
pnpm dev

# Start specific app
pnpm dev --filter @plexica/core-api
pnpm dev --filter @plexica/web        # When frontend is ready

# Build everything
pnpm build

# Build specific package
pnpm build --filter @plexica/core-api
```

### Infrastructure Management

```bash
# Start all services
pnpm infra:start
# or
docker-compose up -d

# Stop all services
pnpm infra:stop
# or
docker-compose down

# Check service status
pnpm infra:status

# View logs for specific service
pnpm infra:logs postgres
pnpm infra:logs keycloak
pnpm infra:logs core-api
```

### Database Operations

```bash
# Generate Prisma Client (Prisma 7 - uses npx due to pnpm security policy)
pnpm db:generate
# Or manually:
cd packages/database && npx --yes prisma@7.2.0 generate --config ./prisma/prisma.config.ts

# Run migrations
pnpm db:migrate
# Or manually:
cd packages/database && npx prisma migrate dev --config ./prisma/prisma.config.ts

# Create new migration
pnpm db:migrate:dev --name "migration_name"
# Or manually:
cd packages/database && npx prisma migrate dev --name "migration_name" --config ./prisma/prisma.config.ts

# Open Prisma Studio (database GUI)
pnpm db:studio
# Or manually:
cd packages/database && npx prisma studio --config ./prisma/prisma.config.ts

# Reset database (WARNING: deletes all data)
pnpm db:reset

# Check migration status
cd packages/database && npx prisma migrate status --config ./prisma/prisma.config.ts
```

**⚠️ Important - Prisma 7 Notes:**

- Plexica uses **Prisma 7.2.0** with PostgreSQL adapter (`@prisma/adapter-pg`)
- Due to pnpm 10+ security policy, Prisma client generation uses `npx` instead of `pnpm exec`
- The `prisma.config.ts` file manages database connection and environment variables
- Always use `--config ./prisma/prisma.config.ts` flag when running Prisma CLI commands manually
- See `packages/database/README.md` for detailed Prisma 7 documentation

### Testing

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm test --filter @plexica/core-api

# Run tests in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage
```

### Code Quality

```bash
# Lint all packages
pnpm lint

# Fix linting issues
pnpm lint:fix

# Format code with Prettier
pnpm format

# Type check
pnpm typecheck
```

### Cleanup

```bash
# Clean build artifacts
pnpm clean

# Clean and reinstall dependencies
pnpm clean:all
pnpm install
```

---

## 🔌 Plugin Development

### Sample Plugin Structure

```
plugins/sample-analytics/
├── plugin.json              # Plugin manifest
├── README.md               # Documentation
└── src/
    ├── index.ts            # Entry point
    ├── hooks.ts            # Event handlers
    └── config.ts           # Configuration schema
```

### Plugin Manifest Example

```json
{
  "id": "sample-analytics",
  "name": "Sample Analytics Plugin",
  "version": "1.0.0",
  "category": "analytics",
  "config": [
    {
      "key": "apiKey",
      "type": "string",
      "required": true,
      "validation": {
        "minLength": 10,
        "pattern": "^[a-zA-Z0-9_-]+$"
      }
    }
  ],
  "permissions": [
    {
      "resource": "analytics",
      "action": "read"
    }
  ],
  "backend": {
    "hooks": [
      {
        "name": "user.login",
        "description": "Track user logins"
      }
    ]
  }
}
```

### Plugin API

```bash
# Register plugin (super_admin only)
POST /api/plugins

# List all available plugins
GET /api/plugins

# Install plugin for tenant
POST /api/tenants/:id/plugins/:pluginId/install

# Activate plugin
POST /api/tenants/:id/plugins/:pluginId/activate

# Deactivate plugin
POST /api/tenants/:id/plugins/:pluginId/deactivate

# Uninstall plugin
DELETE /api/tenants/:id/plugins/:pluginId

# List tenant's installed plugins
GET /api/tenants/:id/plugins
```

---

## 📚 Documentation

### Specifications

- **[Functional Specifications](./specs/FUNCTIONAL_SPECIFICATIONS.md)** - Business requirements and features
- **[Technical Specifications](./specs/TECHNICAL_SPECIFICATIONS.md)** - Detailed architecture and implementation
- **[Project Structure](./specs/PROJECT_STRUCTURE.md)** - Monorepo organization
- **[Plugin Strategy](./specs/PLUGIN_STRATEGY.md)** - Plugin system design

### Planning

- **[Roadmap](./planning/ROADMAP.md)** - Phase 1-5 timeline
- **[Development Plan](./planning/DEVELOPMENT_PLAN.md)** - Detailed MVP plan
- **[Milestones](./planning/MILESTONES.md)** - Milestone tracking
- **[Decisions](./planning/DECISIONS.md)** - Architectural Decision Records (ADR)

### Guides

- **[Getting Started](./docs/GETTING_STARTED.md)** - Setup and first steps
- **[Frontend Architecture](./docs/ARCHITECTURE.md)** - Complete frontend architecture overview
- **[Prisma 7 Migration Guide](./docs/PRISMA_7_MIGRATION.md)** - Troubleshooting and best practices
- **[Contributing](./docs/CONTRIBUTING.md)** - Contribution guidelines
- **[Agent Guidelines](./AGENTS.md)** - For AI coding agents

### Testing

- **[Testing Overview](./docs/testing/README.md)** - Complete testing strategy
- **[Quick Test Guide](./docs/testing/QUICK_TEST.md)** - 5-minute smoke test
- **[Frontend Testing](./docs/testing/FRONTEND_TESTING.md)** - React component tests
- **[E2E Testing](./docs/testing/E2E_TESTING.md)** - End-to-end workflows
- **[Backend Testing](./docs/testing/BACKEND_TESTING.md)** - API integration tests

### API

- **[OpenAPI/Swagger](http://localhost:3000/docs)** - Interactive API documentation
- **Health Check**: http://localhost:3000/health

---

## 🧪 Testing

Plexica has comprehensive testing documentation to ensure quality and reliability.

### Quick Testing Guides

- **[Quick Test Guide](./docs/testing/QUICK_TEST.md)** - 5-minute smoke test for essential functionality
- **[Frontend Testing](./docs/testing/FRONTEND_TESTING.md)** - React component and authentication testing
- **[E2E Testing](./docs/testing/E2E_TESTING.md)** - Complete user workflows and manual testing checklist
- **[Backend Testing](./docs/testing/BACKEND_TESTING.md)** - API and integration tests

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm test --filter @plexica/core-api

# Run tests in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage
```

---

## 🚀 Deployment

### Development

```bash
# Start infrastructure and development server
docker-compose up -d
pnpm dev
```

### Production (Planned - M2.3)

- Platform: Kubernetes (Helm charts)
- CI/CD: GitHub Actions
- Monitoring: Prometheus + Grafana
- Container Registry: Docker Hub / GHCR

See **[STATUS.md](./STATUS.md)** for deployment milestone details.

---

## 📈 Next Steps

See **[STATUS.md](./STATUS.md)** for detailed milestone tracking, completion status, and upcoming tasks.

---

## 🔗 Resources

- **API Docs**: http://localhost:3000/docs (dev)
- **Health Check**: http://localhost:3000/health (dev)
- **Changelog**: [CHANGELOG.md](./changelog/CHANGELOG.md)
- **Status**: [STATUS.md](./STATUS.md) - Detailed project progress

---

## 📞 Support & Community

- **Issues**: [GitHub Issues](https://github.com/[org]/plexica/issues)
- **Discussions**: [GitHub Discussions](https://github.com/[org]/plexica/discussions)
- **Discord**: TBD
- **Email**: TBD

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./docs/CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`pnpm test`)
5. Commit your changes (`git commit -m 'feat: add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

---

## 📜 License

TBD

---

## 🙏 Acknowledgments

Built with:

- [Fastify](https://fastify.io/) - Fast and low overhead web framework
- [Prisma](https://prisma.io/) - Next-generation ORM
- [Keycloak](https://www.keycloak.org/) - Open Source Identity and Access Management
- [Redpanda](https://redpanda.com/) - Kafka-compatible streaming platform
- [Turborepo](https://turbo.build/) - High-performance build system for monorepos

---

**Plexica v0.6.0-alpha** | Built with ❤️ by Plexica Engineering Team  
_Last updated: January 21, 2026_
