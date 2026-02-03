# Plexica - Project Structure

**Last Updated**: 2025-02-03  
**Status**: Complete  
**Owner**: DevOps & Architecture Team  
**Document Type**: Technical Specifications

## Recommendation: Monorepo

**Decision**: A **monorepo** approach is recommended for the Plexica project.

### Rationale

**Advantages of Monorepo for Plexica:**

1. **Facilitated code sharing**: Core, plugins, and frontend share types, utilities, and SDK
2. **Atomic versioning**: Synchronized deployment of core + plugins + frontend
3. **Cross-package refactoring**: API changes reflected immediately
4. **Developer experience**: Single clone, unified tooling, consistent linting
5. **Simplified CI/CD**: Build and test orchestrated in a single pipeline
6. **End-to-end type safety**: TypeScript types shared between backend and frontend

**Managing complexity:**

- Tool: **Turborepo** or **Nx** for build caching and task orchestration
- Package manager: **pnpm** for workspace efficiency
- Approximately 8-12 total packages (manageable)

---

## Monorepo Structure

```
plexica/
├── apps/
│   ├── core-api/                 # Core API Service (Fastify + Prisma)
│   ├── web/                      # Frontend Web App (React + Vite)
│   ├── super-admin/              # Super Admin Panel (React + Vite)
│   └── plugins/
│       ├── crm/                  # CRM Plugin
│       ├── billing/              # Billing Plugin
│       └── analytics/            # Analytics Plugin
│
├── packages/
│   ├── sdk/                      # Plugin SDK (@plexica/sdk)
│   ├── types/                    # Shared TypeScript types
│   ├── api-client/               # Frontend API client
│   ├── ui/                       # Shared UI components
│   ├── config/                   # Shared configs (eslint, tsconfig, vite)
│   └── database/                 # Prisma schema and migrations
│
├── infrastructure/
│   ├── helm/                     # Helm charts for Kubernetes
│   ├── terraform/                # Infrastructure as Code
│   ├── docker/                   # Dockerfiles and compose
│   └── k8s/                      # Kubernetes manifests
│
├── docs/
│   ├── specs/                    # Functional and technical specifications
│   ├── api/                      # API documentation (OpenAPI)
│   └── guides/                   # Developer guides
│
├── tools/
│   └── cli/                      # Plexica CLI for developers
│
├── .github/
│   └── workflows/                # GitHub Actions CI/CD
│
├── package.json                  # Root package.json
├── pnpm-workspace.yaml           # Workspace configuration
├── turbo.json                    # Turborepo configuration
├── .eslintrc.js                  # Root ESLint config
├── tsconfig.json                 # Root TypeScript config
└── README.md
```

---

## Apps Detail

### 1. Core API (`apps/core-api/`)

```
apps/core-api/
├── src/
│   ├── modules/
│   │   ├── tenant/
│   │   │   ├── tenant.controller.ts
│   │   │   ├── tenant.service.ts
│   │   │   ├── tenant.repository.ts
│   │   │   ├── tenant.schema.ts       # Zod schemas
│   │   │   └── tenant.module.ts
│   │   ├── user/
│   │   ├── team/
│   │   ├── permission/
│   │   ├── plugin/
│   │   └── auth/
│   │
│   ├── shared/
│   │   ├── database/
│   │   │   ├── prisma.service.ts
│   │   │   └── tenant-context.ts
│   │   ├── cache/
│   │   │   └── redis.service.ts
│   │   ├── events/
│   │   │   └── event-bus.service.ts
│   │   ├── storage/
│   │   │   └── storage.service.ts
│   │   ├── guards/
│   │   │   ├── auth.guard.ts
│   │   │   ├── tenant.guard.ts
│   │   │   └── permission.guard.ts
│   │   ├── decorators/
│   │   ├── interceptors/
│   │   ├── filters/
│   │   └── utils/
│   │
│   ├── plugins/
│   │   ├── plugin-loader.ts
│   │   ├── plugin-registry.ts
│   │   ├── plugin-proxy.ts
│   │   └── plugin-migration.ts
│   │
│   ├── config/
│   │   ├── configuration.ts
│   │   ├── database.config.ts
│   │   ├── redis.config.ts
│   │   └── keycloak.config.ts
│   │
│   └── main.ts
│
├── test/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── prisma/                        # Symlink to packages/database
├── Dockerfile
├── package.json
└── tsconfig.json
```

### 2. Frontend Web App (`apps/web/`)

```
apps/web/
├── src/
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Settings.tsx
│   │   └── Profile.tsx
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Layout.tsx
│   │   ├── common/
│   │   └── auth/
│   │
│   ├── context/
│   │   ├── PlexicaContext.tsx
│   │   ├── AuthContext.tsx
│   │   └── ThemeContext.tsx
│   │
│   ├── router/
│   │   ├── routes.tsx
│   │   └── dynamic-routes.tsx
│   │
│   ├── plugins/
│   │   ├── plugin-loader.ts
│   │   └── plugin-manager.ts
│   │
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useTenant.ts
│   │   └── usePermissions.ts
│   │
│   ├── services/
│   │   └── api.ts               # Uses @plexica/api-client
│   │
│   ├── styles/
│   │   └── theme.ts
│   │
│   ├── App.tsx
│   └── main.tsx
│
├── public/
├── index.html
├── vite.config.ts
├── package.json
└── tsconfig.json
```

### 3. Super Admin Panel (`apps/super-admin/`)

```
apps/super-admin/
├── src/
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Tenants/
│   │   │   ├── TenantList.tsx
│   │   │   ├── TenantCreate.tsx
│   │   │   └── TenantDetail.tsx
│   │   ├── Plugins/
│   │   ├── Users/
│   │   └── System/
│   │
│   ├── components/
│   ├── hooks/
│   ├── services/
│   └── main.tsx
│
├── vite.config.ts
├── package.json
└── tsconfig.json
```

### 4. Plugin Template (`apps/plugins/[plugin-name]/`)

```
apps/plugins/crm/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── contacts.controller.ts
│   │   │   └── deals.controller.ts
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── schemas/              # Zod validation schemas
│   │   ├── events/
│   │   │   └── contact.events.ts
│   │   └── main.ts
│   │
│   ├── migrations/
│   │   ├── 001_create_contacts.sql
│   │   └── 002_create_deals.sql
│   │
│   ├── Dockerfile
│   ├── package.json
│   └── plugin.manifest.json
│
└── frontend/
    ├── src/
    │   ├── pages/
    │   │   ├── ContactsPage.tsx
    │   │   └── DealsPage.tsx
    │   ├── components/
    │   └── widgets/
    │       └── ContactWidget.tsx
    │
    ├── vite.config.ts             # Module Federation config
    ├── package.json
    └── tsconfig.json
```

---

## Packages Detail

### 1. SDK (`packages/sdk/`)

```
packages/sdk/
├── src/
│   ├── plugin.ts                 # Base PlexicaPlugin class
│   ├── clients/
│   │   ├── database.client.ts
│   │   ├── cache.client.ts
│   │   ├── event.client.ts
│   │   └── storage.client.ts
│   ├── decorators/
│   │   ├── route.decorator.ts
│   │   └── permission.decorator.ts
│   ├── types/
│   │   └── plugin-manifest.ts
│   └── index.ts
│
├── package.json
└── tsconfig.json
```

### 2. Shared Types (`packages/types/`)

```
packages/types/
├── src/
│   ├── tenant.ts
│   ├── user.ts
│   ├── team.ts
│   ├── permission.ts
│   ├── plugin.ts
│   ├── event.ts
│   └── index.ts
│
├── package.json
└── tsconfig.json
```

### 3. API Client (`packages/api-client/`)

```
packages/api-client/
├── src/
│   ├── api-client.ts
│   ├── endpoints/
│   │   ├── tenants.ts
│   │   ├── users.ts
│   │   └── plugins.ts
│   ├── types.ts
│   └── index.ts
│
├── package.json
└── tsconfig.json
```

### 4. UI Components (`packages/ui/`)

```
packages/ui/
├── src/
│   ├── components/
│   │   ├── Button/
│   │   ├── Input/
│   │   ├── Card/
│   │   ├── Modal/
│   │   └── DataTable/
│   ├── hooks/
│   ├── utils/
│   └── index.ts
│
├── package.json
└── tsconfig.json
```

### 5. Database (`packages/database/`)

```
packages/database/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   │   ├── core/
│   │   └── tenant-template/
│   └── seeds/
│
├── src/
│   ├── client.ts
│   └── migrations.ts
│
├── package.json
└── tsconfig.json
```

### 6. Config (`packages/config/`)

```
packages/config/
├── eslint/
│   ├── base.js
│   ├── react.js
│   └── node.js
├── typescript/
│   ├── base.json
│   ├── react.json
│   └── node.json
├── vite/
│   └── base.ts
└── package.json
```

---

## Infrastructure

### Helm Charts (`infrastructure/helm/`)

```
infrastructure/helm/plexica/
├── Chart.yaml
├── values.yaml
├── values-prod.yaml
├── values-staging.yaml
└── templates/
    ├── core/
    │   ├── deployment.yaml
    │   ├── service.yaml
    │   └── ingress.yaml
    ├── plugins/
    │   └── _plugin-template.yaml
    ├── database/
    ├── cache/
    ├── messaging/
    └── gateway/
```

### Terraform (`infrastructure/terraform/`)

```
infrastructure/terraform/
├── modules/
│   ├── vpc/
│   ├── eks/
│   ├── rds/
│   ├── redis/
│   └── s3/
├── environments/
│   ├── dev/
│   ├── staging/
│   └── prod/
└── main.tf
```

### Docker (`infrastructure/docker/`)

```
infrastructure/docker/
├── Dockerfile.core-api
├── Dockerfile.frontend
├── Dockerfile.plugin-base
├── docker-compose.yml
├── docker-compose.dev.yml
└── docker-compose.prod.yml
```

---

## Tool Configuration Files

### Root Configuration

```
plexica/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── .eslintrc.js
├── .prettierrc
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── .dockerignore
├── .editorconfig
└── .nvmrc
```

### `pnpm-workspace.yaml`

```yaml
packages:
  - 'apps/*'
  - 'apps/plugins/*'
  - 'packages/*'
  - 'tools/*'
```

### `turbo.json`

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    },
    "dev": {
      "cache": false
    }
  }
}
```

---

## Common Scripts

### Root `package.json`

```json
{
  "name": "plexica-monorepo",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "format": "prettier --write \"**/*.{ts,tsx,md}\"",
    "clean": "turbo run clean && rm -rf node_modules",
    "db:migrate": "pnpm --filter @plexica/database migrate",
    "db:studio": "pnpm --filter @plexica/database studio",
    "plugin:create": "node tools/cli/create-plugin.js"
  },
  "devDependencies": {
    "turbo": "^1.10.0",
    "prettier": "^3.0.0",
    "eslint": "^8.50.0",
    "typescript": "^5.2.0"
  }
}
```

---

## Alternative: Multi-Repo (NOT Recommended)

If multi-repo were chosen, the structure would be:

```
Separate repositories:
├── plexica-core              # Core API
├── plexica-shell             # Frontend Shell
├── plexica-super-admin       # Super Admin Panel
├── plexica-sdk               # Plugin SDK (npm package)
├── plexica-plugin-crm        # CRM Plugin
├── plexica-plugin-billing    # Billing Plugin
├── plexica-infrastructure    # Helm, Terraform, Docker
└── plexica-docs              # Documentation
```

**Multi-Repo Disadvantages:**

- ❌ Type drift between repositories
- ❌ Complex versioning (8+ repos to synchronize)
- ❌ Difficult cross-repo refactoring
- ❌ Slower developer onboarding
- ❌ Separate CI/CD pipelines to coordinate
- ❌ Duplicate configurations

---

## Final Recommendations

### ✅ Adopt Monorepo with:

1. **Turborepo** for build orchestration and caching
2. **pnpm** for workspace management (faster than npm/yarn)
3. **Changesets** for versioning and changelogs
4. **Prettier + ESLint** with shared configs
5. **Vitest** for unified testing
6. **GitHub Actions** with matrix builds for apps/packages

### 📦 Package Dependencies

```
@plexica/core-api
  ├── @plexica/database
  ├── @plexica/types
  └── @plexica/sdk

@plexica/web
  ├── @plexica/api-client
  ├── @plexica/types
  └── @plexica/ui

@plexica/plugin-crm
  ├── @plexica/sdk
  ├── @plexica/types
  └── @plexica/ui

@plexica/api-client
  └── @plexica/types

@plexica/sdk
  └── @plexica/types
```

### 🚀 Developer Workflow

```bash
# Initial setup
git clone plexica-monorepo
pnpm install

# Local development
pnpm dev                    # Start everything in dev mode
pnpm dev --filter core-api  # Only core-api
pnpm dev --filter web       # Only frontend web

# Build
pnpm build                  # Build everything
pnpm build --filter core-api

# Test
pnpm test
pnpm test --filter @plexica/sdk

# Database
pnpm db:migrate
pnpm db:studio

# Lint & Format
pnpm lint
pnpm format

# Create new plugin
pnpm plugin:create my-plugin
```

---

_Plexica Document - Project Structure v1.0_  
_Last updated: January 2025_
