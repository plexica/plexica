# Plexica

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI](https://github.com/plexica/plexica/actions/workflows/ci.yml/badge.svg)](https://github.com/plexica/plexica/actions/workflows/ci.yml)
[![GitHub issues](https://img.shields.io/github/issues/plexica/plexica)](https://github.com/plexica/plexica/issues)
[![GitHub stars](https://img.shields.io/github/stars/plexica/plexica)](https://github.com/plexica/plexica/stargazers)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](docs/CONTRIBUTING.md)
[![Code of Conduct](https://img.shields.io/badge/code%20of%20conduct-contributor%20covenant-purple.svg)](CODE_OF_CONDUCT.md)

Cloud-native multi-tenant SaaS platform with extensible plugin architecture.

**Version**: 0.11.0  
**Status**: Phase 3 — Plugin Observability (Spec 012 in progress) 🟡  
**Last Updated**: March 7, 2026

---

## 📊 Project Status

| Area                         | Status                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------- |
| **Backend MVP**              | ✅ **100% Complete** — Core, Auth OAuth 2.0, Multi-tenancy, Plugins, Admin       |
| **Frontend MVP**             | ✅ **100% Complete** — Tenant App + Super Admin + Error Boundaries + Theming     |
| **Plugin System**            | ✅ **100% Complete** — Lifecycle, Container, Hooks, EventBus (Spec 004)          |
| **Admin Interfaces**         | ✅ **100% Complete** — Super Admin + Tenant Admin, all screens + a11y (Spec 008) |
| **Workspace Management**     | ✅ **100% Complete** — Hierarchy, Templates, Plugin Hooks (Spec 009 + 011)       |
| **i18n System**              | ✅ **100% Complete** — Backend + Frontend + content-hashed URLs (Spec 006)       |
| **Core Services**            | ✅ **100% Complete** — Jobs, Search, Notifications/SSE (Spec 007)                |
| **Plugin Observability**     | 🟡 **Planned** — OTel + Prometheus + Loki + Grafana dashboards (Spec 012)        |
| **Total Tests**              | 🟢 **2,400+** across all packages                                                |
| **Core-API Coverage**        | 🟡 **~76.5%** (target: 80%)                                                      |
| **Frontend Coverage**        | ✅ **~80%** (Spec 010 Phase 4 complete)                                          |
| **Security Vulnerabilities** | ✅ **0 known**                                                                   |
| **Active Sprint**            | Sprint 007 — Spec 012 Phase 1+2 (61 pts, Mar 8–21)                               |

👉 **Full progress tracking**: [planning/PROJECT_STATUS.md](./planning/PROJECT_STATUS.md)

---

## 🚀 Quick Start

**Want to get started in 5 minutes?** → See **[docs/QUICKSTART.md](./docs/QUICKSTART.md)**

### One-Command Setup

```bash
# 1. Clone repository
git clone https://github.com/plexica/plexica.git
cd plexica

# 2. Install dependencies
pnpm install

# 3. Initialize everything (Docker, DB, Keycloak, sample data)
pnpm run init
```

The initialization script will:

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

| Service     | URL                          | Credentials                                                         |
| ----------- | ---------------------------- | ------------------------------------------------------------------- |
| Tenant App  | http://localhost:3001        | See `.env` / `test-infrastructure/scripts/test-setup.sh`            |
| Super Admin | http://localhost:3002        | ⚠️ Dev default — **MUST CHANGE IN PRODUCTION** (see `.env.example`) |
| Core API    | http://localhost:3000        | —                                                                   |
| API Health  | http://localhost:3000/health | —                                                                   |
| Keycloak    | http://localhost:8080        | ⚠️ Dev default `admin/admin` — **MUST CHANGE IN PRODUCTION**        |

> **Security Notice**: Default credentials above are for local development only.
> Never deploy with these defaults. Set strong credentials via environment
> variables before any non-local deployment. See [Security Guidelines](./docs/SECURITY.md).

---

## 🏗️ Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                      PLEXICA PLATFORM                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐  │
│  │  API Gateway │  │   Keycloak    │  │    Frontend      │  │
│  │  (Traefik)   │  │  (Auth/IdP)   │  │  apps/web        │  │
│  └──────┬───────┘  └───────┬───────┘  │  apps/super-admin│  │
│         │                  │          └──────────────────┘  │
│  ┌──────┴──────────────────┴───────────────────────────────┐ │
│  │              Core API Service (Fastify 5)               │ │
│  │  ✅ Tenant Management     ✅ Plugin Orchestration        │ │
│  │  ✅ OAuth 2.0 / PKCE      ✅ Admin Interfaces (SA + TA) │ │
│  │  ✅ RBAC + Keycloak       ✅ Event Hooks + Job Queue     │ │
│  │  ✅ i18n / Translations   ✅ Workspace Hierarchy         │ │
│  │  ✅ Notifications (SSE)   🟡 Plugin Observability (S012)│ │
│  └────────────────────┬────────────────────────────────────┘ │
│                       │                                      │
│  ┌────────────────────┴────────────────────────────────────┐ │
│  │                  Plugin Ecosystem                       │ │
│  │  ┌──────────┐  ┌────────────┐  ┌───────────────────┐   │ │
│  │  │ Lifecycle│  │ Module Fed │  │   Plugin Hooks    │   │ │
│  │  │ Manager  │  │ (Frontend) │  │   + EventBus      │   │ │
│  │  └──────────┘  └────────────┘  └───────────────────┘   │ │
│  └─────────────────────────────────────────────────────────┘ │
│                       │                                      │
│  ┌────────────────────┴────────────────────────────────────┐ │
│  │                 Infrastructure Layer                    │ │
│  │  PostgreSQL 15 (schema-per-tenant)  │  Redis 7          │ │
│  │  Redpanda (KafkaJS)  │  MinIO (S3)  │  Keycloak 26+     │ │
│  │  Prometheus + Grafana + Tempo + Loki  ← Spec 012 🟡     │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## 🎯 Key Features

### ✅ Multi-Tenancy

- Schema-per-tenant on PostgreSQL for complete data isolation
- Automatic tenant provisioning with Keycloak realm creation
- Tenant lifecycle management (create, suspend, delete)
- Per-tenant storage buckets in MinIO

### ✅ Authentication & Authorization (OAuth 2.0)

- Keycloak for Identity & Access Management (realm-per-tenant)
- OAuth 2.0 + PKCE flow, JWT validation with JWKS
- RBAC with fine-grained permission-based access control
- Token refresh, session management, MFA support

### ✅ Internationalization (i18n)

- Full i18n backend API with translation override management
- React frontend integration (`IntlContext`, `useTranslations`, `LanguageSelector`)
- Admin UI for managing per-tenant translation overrides
- Content-hashed translation URLs with immutable caching
- Redis-cached translations for performance

### ✅ Plugin System

- Lifecycle management: install → activate → deactivate → uninstall
- Container-based plugin isolation via Docker (`ContainerAdapter` pattern)
- Plugin registry (global catalog) with configuration validation
- Dependency checking, event hook system, plugin-to-plugin communication
- Module Federation for frontend plugin loading
- Workspace-scoped plugin configuration and cascade management

### ✅ Workspace Hierarchy & Templates

- Unlimited-depth workspace hierarchy via materialised path (ADR-013)
- Template system for rapid workspace provisioning (transactional apply)
- Plugin hooks: `before_create` (sequential, can-reject) and `created`/`deleted` (parallel fire-and-forget)
- Aggregated member/plugin counts with Redis caching

### ✅ Admin Interfaces

- **Super Admin Panel** — tenant management, platform users, plugin registry, system config, audit logs, health dashboard
- **Tenant Admin Panel** — user management, teams, roles, workspace plugins, settings, audit log export
- Full RBAC enforcement (`TeamAuthGuard`, Keycloak realm roles)
- Async CSV/JSON audit log export via job queue + MinIO signed URLs
- WCAG 2.1 AA compliant (axe-core verified)

### ✅ Core Services

- **Job Queue** — async background tasks with MinIO signed URL delivery
- **Full-Text Search** — cross-workspace search with tenant isolation
- **Notifications** — real-time badge updates and job status via SSE (ADR-023)

### ✅ Frontend Production Readiness

- `PluginErrorBoundary` — plugin crashes isolated, shell never crashes
- `ThemeContext` — per-tenant branding (logo, colors, fonts via self-hosted WOFF2)
- Widget system — plugins expose reusable UI components via Module Federation
- Frontend test coverage ≥80%, WCAG 2.1 AA across all screens

### 🟡 Plugin Observability (Spec 012 — In Progress)

- OpenTelemetry distributed tracing → Grafana Tempo (ADR-026)
- Platform metrics via `prom-client` → Prometheus (ADR-027)
- Structured log aggregation via Promtail → Loki (ADR-028)
- Per-plugin Prometheus metrics at `GET /api/v1/plugins/:id/metrics` (ADR-030)
- Observability dashboards in Super Admin (recharts, ADR-029)
- Alert engine with in-app SSE delivery

---

## 📁 Project Structure

```
plexica/
├── apps/
│   ├── core-api/          # ✅ Core API Service (Fastify 5)
│   ├── web/               # ✅ Tenant Web App (React 19 + Vite)
│   └── super-admin/       # ✅ Super Admin Panel
│
├── packages/
│   ├── database/          # ✅ Prisma schema & migrations (PostgreSQL 15)
│   ├── i18n/              # ✅ Internationalization package
│   ├── ui/                # ✅ Shared UI components (@plexica/ui)
│   ├── event-bus/         # ✅ Plugin event system (KafkaJS / Redpanda)
│   ├── sdk/               # ✅ Plugin SDK
│   ├── api-client/        # ✅ Frontend API client
│   ├── types/             # ✅ Shared TypeScript types
│   └── config/            # ✅ Shared ESLint/TS configs
│
├── plugins/
│   └── sample-analytics/  # ✅ Example plugin
│
├── .forge/                # FORGE methodology (specs, sprints, ADRs, constitution)
│   ├── specs/             # 12 specs (001–012)
│   ├── sprints/           # Sprint 001–007 (active)
│   └── knowledge/         # ADR-001..030, decision log
├── docs/                  # Developer guides
├── specs/                 # Functional & technical specifications
└── planning/              # Roadmap, milestones, PROJECT_STATUS.md
```

**Legend**: ✅ Complete | 🟡 In Progress | 🔴 Not Started

---

## 🛠️ Technology Stack

| Layer          | Technology                                          |
| -------------- | --------------------------------------------------- |
| **Backend**    | Node.js 20, TypeScript 5.9, Fastify 5.7, Prisma 6.8 |
| **Database**   | PostgreSQL 15 (schema-per-tenant), Redis 7          |
| **Auth**       | Keycloak 26+ (realm-per-tenant, OAuth 2.0 / PKCE)   |
| **Events**     | Redpanda + KafkaJS 2.2                              |
| **Storage**    | MinIO 8+ (S3-compatible)                            |
| **Frontend**   | React 19, Vite, TanStack Router, TailwindCSS        |
| **i18n**       | react-intl + custom `@plexica/i18n` package         |
| **Testing**    | Vitest 4, Playwright — 2,400+ tests                 |
| **Logging**    | Pino (backend + browser, ADR-021)                   |
| **A11y**       | vitest-axe + @axe-core/playwright (ADR-022)         |
| **Tracing**    | OpenTelemetry SDK + Grafana Tempo (ADR-026) 🟡      |
| **Metrics**    | prom-client + Prometheus (ADR-027) 🟡               |
| **Logs**       | Promtail + Grafana Loki (ADR-028) 🟡                |
| **Monorepo**   | pnpm workspaces + Turborepo                         |
| **Deployment** | Docker Compose (dev), Kubernetes (planned)          |

Full rationale and version constraints: [`.forge/constitution.md`](./.forge/constitution.md#article-2-technology-stack)

---

## 📋 Development Commands

```bash
# Install dependencies
pnpm install

# Start development servers (all packages)
pnpm dev

# Build all packages
pnpm build

# Lint and format
pnpm lint
pnpm format
```

### Testing

```bash
cd apps/core-api

pnpm test              # All tests (~3-5 min)
pnpm test:unit         # Unit tests only (~30s)
pnpm test:integration  # Integration tests (~90s)
pnpm test:e2e          # E2E tests (~2 min)
pnpm test:coverage     # Coverage report
```

Full command reference: [AGENTS.md](AGENTS.md#quick-start---essential-commands)

---

## 🔌 Plugin Development

### Plugin Manifest Example

```json
{
  "id": "sample-analytics",
  "name": "Sample Analytics Plugin",
  "version": "1.0.0",
  "category": "analytics",
  "permissions": [{ "resource": "analytics", "action": "read" }],
  "backend": {
    "hooks": [{ "name": "user.login", "description": "Track user logins" }]
  }
}
```

### Plugin API

```bash
POST   /api/plugins                                   # Register plugin (super_admin)
GET    /api/plugins                                   # List all plugins
POST   /api/tenants/:id/plugins/:pluginId/install     # Install for tenant
POST   /api/tenants/:id/plugins/:pluginId/activate    # Activate
POST   /api/tenants/:id/plugins/:pluginId/deactivate  # Deactivate
DELETE /api/tenants/:id/plugins/:pluginId             # Uninstall
GET    /api/tenants/:id/plugins                       # List tenant plugins
```

---

## 📚 Documentation

### Specifications (FORGE)

- **[Spec 002 — Authentication](./.forge/specs/002-authentication/)** ✅ OAuth 2.0
- **[Spec 004 — Plugin System](./.forge/specs/004-plugin-system/)** ✅ Lifecycle + Container
- **[Spec 006 — i18n System](./.forge/specs/006-i18n/)** ✅ Backend + Frontend
- **[Spec 007 — Core Services](./.forge/specs/007-core-services/)** ✅ Jobs + Search + Notifications
- **[Spec 008 — Admin Interfaces](./.forge/specs/008-admin-interfaces/)** ✅ Super Admin + Tenant Admin
- **[Spec 009 — Workspace Management](./.forge/specs/009-workspace-management/)** ✅ Complete
- **[Spec 010 — Frontend Production Readiness](./.forge/specs/010-frontend-production-readiness/)** ✅ Complete
- **[Spec 011 — Workspace Hierarchy & Templates](./.forge/specs/011-workspace-hierarchy-templates/)** ✅ Complete
- **[Spec 012 — Plugin Observability](./.forge/specs/012-plugin-observability/)** 🟡 In progress

### Planning

- **[Project Status](./planning/PROJECT_STATUS.md)** — Current milestones and sprint velocity
- **[Roadmap](./planning/ROADMAP.md)** — Phase 1–5 timeline
- **[Decisions](./planning/DECISIONS.md)** — Architectural Decision Records (ADRs)

### Guides

- **[Quick Start](./docs/QUICKSTART.md)** — 5-minute setup
- **[Frontend Architecture](./docs/ARCHITECTURE.md)** — Full frontend overview
- **[i18n Usage Guide](./apps/web/docs/I18N_USAGE.md)** — Internationalization developer guide
- **[Security Guidelines](./docs/SECURITY.md)** 🔒 — MANDATORY for all contributors
- **[Contributing](./docs/CONTRIBUTING.md)** — Contribution guidelines
- **[Agent Guidelines](./AGENTS.md)** — For AI coding agents

### Testing

- **[Testing Overview](./docs/TESTING.md)** — Strategy, stats, and coverage
- **[Backend Testing](./docs/testing/BACKEND_TESTING.md)** — API & integration tests
- **[Frontend Testing](./docs/testing/FRONTEND_TESTING.md)** — React component tests
- **[E2E Testing](./docs/testing/E2E_TESTING.md)** — End-to-end workflows

---

## 🧪 Testing

**2,400+ tests** across all packages:

| Package                 | Tests  | Coverage     |
| ----------------------- | ------ | ------------ |
| `apps/core-api`         | 1,900+ | ~76.5% lines |
| `packages/i18n`         | 263    | ~95% average |
| `apps/web` (Vitest)     | 941+   | ~80%         |
| `apps/web` (Playwright) | 64 E2E | —            |
| `apps/super-admin`      | 267+   | ~85%         |
| Other packages          | ~220+  | Varies       |

Coverage targets: 80% overall, 85% for auth/tenant/workspace modules (Constitution Art. 4.1).

### Test Infrastructure

```bash
# Start test services (PostgreSQL, Keycloak, Redis, MinIO)
cd test-infrastructure
./scripts/test-setup.sh
./scripts/test-check.sh   # Verify services
./scripts/test-reset.sh   # Reset test data
./scripts/test-teardown.sh
```

---

## 🚀 Deployment

### Deployment

```bash
docker-compose up -d
pnpm dev
```

### Production (Planned)

- Container orchestration: Kubernetes (Helm charts)
- CI/CD: GitHub Actions
- Monitoring: Prometheus + Grafana + Tempo + Loki (Spec 012 🟡)

See **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** for detailed instructions.

---

## 📞 Support & Community

- **Issues**: [GitHub Issues](https://github.com/plexica/plexica/issues)
- **Discussions**: [GitHub Discussions](https://github.com/plexica/plexica/discussions)
- **Security**: [security@plexica.dev](mailto:security@plexica.dev)
- **Code of Conduct**: [conduct@plexica.dev](mailto:conduct@plexica.dev)

---

## 🤝 Contributing

We welcome contributions! Please read:

1. **[Security Guidelines](./docs/SECURITY.md)** 🔒 — SQL injection prevention, RBAC, tenant isolation
2. **[Agent Guidelines](./AGENTS.md)** — Code style, test requirements, naming conventions
3. **[Contributing Guide](./docs/CONTRIBUTING.md)** — Workflow, PR policy, commit style
4. **[Code of Conduct](./CODE_OF_CONDUCT.md)**

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests first (TDD — required per [AGENTS.md](./AGENTS.md))
4. Implement the feature
5. Run tests (`pnpm test`) and lint (`pnpm lint`)
6. Commit (`git commit -m 'feat: add amazing feature'`)
7. Push and open a Pull Request

> **Note**: PRs without tests or with coverage below 80% will be rejected by CI.

---

## 📜 License

Licensed under the [Apache License 2.0](LICENSE).

✅ Commercial use allowed | ✅ Modification and distribution allowed  
✅ Must include original copyright | ✅ Patent protection included

---

## 🙏 Acknowledgments

Built with:
[Fastify](https://fastify.io/) ·
[Prisma](https://prisma.io/) ·
[Keycloak](https://www.keycloak.org/) ·
[React](https://react.dev/) ·
[Vite](https://vitejs.dev/) ·
[Turborepo](https://turbo.build/) ·
[Vitest](https://vitest.dev/)

---

**Plexica v0.11.0** | Built with ❤️ by Plexica Engineering Team  
_Last updated: March 7, 2026_
