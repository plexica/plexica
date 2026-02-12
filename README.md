# Plexica

Cloud-native multi-tenant SaaS platform with extensible plugin architecture.

**Version**: 0.9.0  
**Status**: Phase 2 - Plugin Ecosystem (67% Complete - M2.1, M2.2, M2.3 ✅, M2.4 in progress) | Frontend Consolidation ✅ Complete | M2.4 Plugin Registry & Marketplace  
**Last Updated**: February 11, 2026

---

## 📊 Project Status

**Current Phase**: Phase 2 - Plugin Ecosystem (67% complete)  
**Current Milestone**: M2.4 - Plugin Registry & Marketplace (20% complete)  
**Last Updated**: February 11, 2026

**Recent Achievements:**

- ✅ Phase 1 MVP Complete (97.5%) + Frontend Consolidation (A-D5)
- ✅ M2.3: Plugin-to-Plugin Communication with 80% Code Coverage
- ✅ 1,855+ tests (1,047 backend, 808 frontend) with 63% overall coverage

👉 **For detailed progress tracking, see [planning/PROJECT_STATUS.md](./planning/PROJECT_STATUS.md)**

---

## 🚀 Quick Start

**Want to get started in 5 minutes?** → See **[docs/QUICKSTART.md](./docs/QUICKSTART.md)** for the fastest setup!

### One-Command Setup (Recommended)

```bash
# 1. Clone repository
git clone https://github.com/[org]/plexica.git
cd plexica

# 2. Install dependencies
pnpm install

# 3. Initialize everything (Docker, DB, Keycloak, sample data)
pnpm run init
```

That's it! The initialization script will:

- ✅ Start Docker infrastructure
- ✅ Create database schema
- ✅ Seed sample data (3 tenants, 3 plugins, 7 users)
- ✅ Create Keycloak realms
- ✅ Configure all services

### Start Applications

```bash
# Terminal 1: Backend API
cd apps/core-api && pnpm dev

# Terminal 2: Tenant App (Frontend)
cd apps/web && pnpm dev

# Terminal 3: Super Admin App (Frontend)
cd apps/super-admin && pnpm dev
```

### Access Points

- **Tenant App**: http://localhost:3001 (Login: `admin@acme-corp.com` / `Admin123!`)
- **Super Admin**: http://localhost:3002 (Login: `admin@plexica.com` / `admin`)
- **Core API**: http://localhost:3000
- **API Health**: http://localhost:3000/health
- **Keycloak**: http://localhost:8080 (Login: `admin` / `admin`)

📖 **For detailed setup, troubleshooting, and more → See [docs/QUICKSTART.md](./docs/QUICKSTART.md)**

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

**For detailed architecture documentation:**

- **Backend/System Architecture**: See [`specs/TECHNICAL_SPECIFICATIONS.md`](specs/TECHNICAL_SPECIFICATIONS.md)
- **Frontend Architecture**: See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

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

### Frontend (✅ Complete - M1.5, M1.6)

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

**Quick Overview**:

| Layer          | Key Technologies                                             |
| -------------- | ------------------------------------------------------------ |
| **Backend**    | Node.js 20, TypeScript 5.9, Fastify 5.7, Prisma 7.2          |
| **Database**   | PostgreSQL 15 (multi-schema), Redis 7                        |
| **Auth**       | Keycloak 23 (realm-per-tenant)                               |
| **Events**     | Redpanda (Kafka-compatible)                                  |
| **Storage**    | MinIO (S3-compatible)                                        |
| **Frontend**   | React 18, Vite 5, Module Federation, TailwindCSS v4, Zustand |
| **Testing**    | Vitest 1.x (~1,855 tests, 63% coverage)                      |
| **Deployment** | Docker Compose (dev), Kubernetes (planned)                   |

**For complete technology stack details, rationale, and versions**: See [`specs/TECHNICAL_SPECIFICATIONS.md#12-detailed-technology-stack`](specs/TECHNICAL_SPECIFICATIONS.md#12-detailed-technology-stack)

---

## 📋 Development Commands

For complete command reference and development guidelines, see **[AGENTS.md](AGENTS.md#quick-start---essential-commands)**.

### Most Common Commands

```bash
# Install dependencies
pnpm install

# Start development servers
pnpm dev

# Run tests
pnpm test

# Build all packages
pnpm build

# Lint and format
pnpm lint
pnpm format
```

### Quick Links

- **Full Command Reference**: [AGENTS.md](AGENTS.md#quick-start---essential-commands)
- **Testing Commands**: [TESTING.md](docs/TESTING.md#quick-start-5-minutes)
- **Database Operations**: [Database Package README](packages/database/README.md)
- **Infrastructure Setup**: [Quick Start Guide](docs/QUICKSTART.md)

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

- **[Project Status](./planning/PROJECT_STATUS.md)** - Current milestones and progress
- **[Roadmap](./planning/ROADMAP.md)** - Phase 1-5 timeline
- **[Milestones](./planning/MILESTONES.md)** - Detailed milestone tracking
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

Plexica has comprehensive testing documentation to ensure quality and reliability with **1,047+ tests** across all packages.

**Test Statistics**:

- **Backend (core-api)**: 1,047 unit/integration/E2E tests
- **Frontend (web)**: 64 Playwright E2E tests
- **Super-Admin**: 105 Playwright E2E tests
- **UI Components (@plexica/ui)**: 495 component tests
- **SDK (@plexica/sdk)**: 65 tests
- **API Client (@plexica/api-client)**: 79 tests
- **Total**: ~1,855 tests
- **Coverage**: 63% lines (target: 80%)

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

### Production

- Platform: Kubernetes (Helm charts)
- CI/CD: GitHub Actions
- Monitoring: Prometheus + Grafana
- Container Registry: Docker Hub / GHCR

See **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** for detailed deployment instructions.

---

## 📈 Next Steps

See **[planning/PROJECT_STATUS.md](./planning/PROJECT_STATUS.md)** for detailed milestone tracking, completion status, and upcoming tasks.

---

## 🔗 Resources

- **API Docs**: http://localhost:3000/docs (dev)
- **Health Check**: http://localhost:3000/health (dev)
- **Status**: [planning/PROJECT_STATUS.md](./planning/PROJECT_STATUS.md) - Detailed project progress and milestones

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

**Plexica v0.7.0** | Built with ❤️ by Plexica Engineering Team  
_Last updated: February 3, 2026_
