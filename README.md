# Plexica

Cloud-native multi-tenant SaaS platform with extensible plugin architecture.

**Version**: 0.1.0-alpha  
**Status**: Backend MVP Complete | Frontend In Planning  
**Last Updated**: January 13, 2026

---

## 📊 Project Status

**Current Phase**: Phase 1 - MVP Core (57% complete)  
**Completed Milestones**: M1.1-M1.4 (Foundation + Multi-tenancy + Auth + Plugins) ✅  
**Next Milestone**: M2.1 - Frontend Foundation

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

# 6. Generate Prisma Client
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

### ✅ Multi-Tenancy (Completed)
- **Schema-per-tenant** on PostgreSQL for complete data isolation
- **Automatic tenant provisioning** with Keycloak realm creation
- **Tenant lifecycle management** (create, suspend, delete)
- **Per-tenant storage** buckets in MinIO
- **4 test tenants** currently active

### ✅ Authentication & Authorization (Completed)
- **Keycloak** for Identity & Access Management
- **Separate realms** per tenant for isolation
- **JWT token** validation with JWKS
- **RBAC** (Role-Based Access Control) with default roles
- **Middleware** for auth, role, and permission checking
- **REST API** for login, logout, refresh, user info

### ✅ Plugin System (Completed)
- **Modular architecture** with lifecycle management
- **Plugin registry** (global catalog)
- **Lifecycle operations**: install → activate → deactivate → uninstall
- **Configuration validation** per plugin manifest
- **Dependency checking** (required/optional/conflicts)
- **Hook/event system** for extensibility
- **Module Federation** support (ready for frontend)
- **Sample analytics plugin** included

### ⚪ Frontend (Planned - M2.1)
- React 18 + Vite + TypeScript
- Module Federation for dynamic plugin loading
- TanStack Router + Query
- Tailwind CSS + shadcn/ui
- Authentication integration

---

## 📁 Project Structure

```
plexica/
├── apps/
│   ├── core-api/              # ✅ Core API Service (Fastify)
│   ├── web/                   # ⚪ Frontend Web App (React) - Planned
│   ├── super-admin/           # ⚪ Super Admin Panel - Planned
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
├── infrastructure/
│   ├── docker/                # ✅ Docker Compose for development
│   ├── helm/                  # ⚪ Helm charts - Planned
│   ├── terraform/             # ⚪ Infrastructure as Code - Planned
│   └── k8s/                   # ⚪ Kubernetes manifests - Planned
│
├── docs/                      # ✅ Documentation
├── specs/                     # ✅ Technical specifications
├── planning/                  # ✅ Roadmap and milestones
├── changelog/                 # ✅ Version history
├── templates/                 # ✅ Document templates
└── tools/                     # CLI and utilities (future)
```

**Legend**: ✅ Complete | ⚪ Planned

---

## 🛠️ Technology Stack

### Backend (✅ Complete)
| Category | Technology | Version | Status |
|----------|------------|---------|--------|
| Runtime | Node.js | 20 LTS | ✅ |
| Language | TypeScript | 5.x | ✅ |
| Framework | Fastify | 4.x | ✅ |
| ORM | Prisma | 5.x | ✅ |
| Validation | Zod | 3.x | ✅ |
| Testing | Vitest | 1.x | 📋 Configured |

### Infrastructure (✅ Complete)
| Service | Version | Port | Status |
|---------|---------|------|--------|
| PostgreSQL | 15 | 5432 | ✅ Running |
| Redis | 7 | 6379 | ✅ Running |
| Keycloak | 23 | 8080 | ✅ Running |
| Redpanda | Latest | 9092 | ✅ Running |
| MinIO | Latest | 9000/9001 | ✅ Running |

### Frontend (⚪ Planned)
- Framework: React 18+
- Build Tool: Vite 5.x
- Routing: TanStack Router
- State: TanStack Query + Zustand
- UI: Tailwind CSS + shadcn/ui
- Forms: React Hook Form 7.x
- i18n: i18next 23.x

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
# Generate Prisma Client
pnpm db:generate

# Run migrations
pnpm db:migrate

# Create new migration
pnpm db:migrate:dev --name "migration_name"

# Open Prisma Studio (database GUI)
pnpm db:studio

# Reset database (WARNING: deletes all data)
pnpm db:reset
```

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
- **[Contributing](./docs/CONTRIBUTING.md)** - Contribution guidelines
- **[Agent Guidelines](./AGENTS.md)** - For AI coding agents

### API
- **[OpenAPI/Swagger](http://localhost:3000/docs)** - Interactive API documentation
- **Health Check**: http://localhost:3000/health

---

## 🧪 Testing Strategy

### Unit Tests (Planned)
- Framework: Vitest
- Coverage target: >80%
- Location: `*.test.ts` files alongside source

### Integration Tests (Planned)
- Test API endpoints
- Test database operations
- Test Keycloak integration

### E2E Tests (Planned)
- Framework: Playwright
- Test complete user workflows
- Test plugin lifecycle

### Load Tests (Planned)
- Tool: k6 or Artillery
- Test API performance
- Test multi-tenant scalability

---

## 🚀 Deployment

### Development
```bash
# Already running with:
docker-compose up -d
pnpm dev
```

### Production (Planned - M2.3)
- **Platform**: Kubernetes (Helm charts)
- **Container Registry**: Docker Hub / GHCR
- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus + Grafana
- **Logging**: ELK Stack / Loki
- **Secrets**: Vault / Kubernetes Secrets

---

## 🎯 Completed Features

### Backend MVP ✅
- [x] Monorepo with Turborepo + pnpm
- [x] Core API with Fastify
- [x] PostgreSQL with schema-per-tenant
- [x] Keycloak authentication
- [x] JWT token validation
- [x] RBAC system with permissions
- [x] Multi-tenancy system
- [x] Tenant provisioning (DB + Keycloak + Storage)
- [x] Plugin system (registry + lifecycle + hooks)
- [x] Sample analytics plugin
- [x] REST API with Swagger docs
- [x] Docker Compose infrastructure
- [x] Health checks and monitoring endpoints
- [x] Database migrations with Prisma

---

## 📈 What's Next

### M2.1 - Frontend Foundation (Next - 4 weeks)
- [ ] React 18 application with Vite
- [ ] TanStack Router + Query setup
- [ ] Module Federation configuration
- [ ] Authentication UI (login/logout)
- [ ] Base layout with navigation
- [ ] Tenant switcher component
- [ ] Dynamic plugin loading

### M2.2 - Frontend Auth & Layout (3 weeks)
- [ ] Protected routes
- [ ] User profile management
- [ ] Tenant management UI
- [ ] Plugin marketplace UI
- [ ] Admin panel basics

### M2.3 - Testing & Deployment (2 weeks)
- [ ] Unit tests (backend + frontend)
- [ ] Integration tests
- [ ] E2E tests with Playwright
- [ ] Production deployment
- [ ] CI/CD pipeline improvements
- [ ] Monitoring and logging

---

## 🔗 Useful Links

- **Repository**: https://github.com/[org]/plexica
- **Documentation**: https://docs.plexica.io (future)
- **API Docs**: http://localhost:3000/docs (dev)
- **Issue Tracker**: GitHub Issues
- **Changelog**: [CHANGELOG.md](./changelog/CHANGELOG.md)

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

**Plexica v0.1.0-alpha** | Built with ❤️ by Plexica Engineering Team  
*Last updated: January 13, 2026*
