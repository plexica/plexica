# Changelog

All notable changes to the Plexica project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### In Progress - M2.3 Testing & Deployment (50%)

#### Added

- Vitest testing infrastructure with v8 coverage
- Unit tests for TenantService (5 tests, all passing)
- Unit tests for PluginRegistryService (6 tests, all passing)
- Testing documentation (TESTING.md)
- Production-ready Dockerfiles for all services
  - Enhanced core-api with health checks and dumb-init
  - Web app with Nginx multi-stage build
  - Super-admin app with Nginx
- Nginx reverse proxy configuration
  - Subdomain-based routing
  - Rate limiting (API: 100 req/s, Auth: 10 req/s)
  - Static asset caching
  - Security headers
- Production docker-compose.yml with HA support
- Comprehensive .env.prod.example template

#### Changed

- Upgraded vitest to v4.0.17
- Enhanced Dockerfile with security best practices

### Planning

- Created specs repository structure
- Defined functional and technical specifications
- Created Phase 1-5 roadmap
- Defined detailed development plan

---

## [0.6.0] - 2026-01-14 - Super Admin App Complete

### Milestone 2.2 - Super Admin App ✅

#### Added

- Separate Super Admin React app (apps/super-admin) on port 3002
- Global tenant management UI with real-time data
  - Create, suspend, activate tenants
  - Search and filter functionality
  - Tenant detail modal with infrastructure info
- Plugin marketplace UI
  - Global plugin registry view
  - Search by name, description, author
  - Filter by status and category
  - Plugin detail modal with technical specs
- Platform analytics dashboard
  - Tenant growth charts
  - API usage metrics
  - Plugin installation stats
  - Time period selector (24h/7d/30d)
- Users management across tenants
  - Cross-tenant user list (mock data)
  - Search and filter capabilities
  - User detail modal
- Authentication flow
  - Mock login (admin@plexica.com / admin)
  - Protected routes with session management
  - Logout functionality
- React Query integration for data fetching
- API client without tenant context for global view

**Commits**:

- `a21ba83` Initial setup
- `e99ca23` React Query integration (80%)
- `57c2d48` Search/filters and modals (95%)
- `0f4db10` Complete implementation (100%)

**Total Code**: ~2,020 lines

---

## [0.5.0] - 2026-01-13 - Frontend Tenant App Complete

### Milestone 2.1 - Frontend Tenant App ✅

#### Added

- React tenant app (apps/web) with Vite + TypeScript + Tailwind
- Authentication with Keycloak (PKCE flow)
- Tenant context management
- Module Federation infrastructure
- Professional dashboard UI with stats
- Plugin management page (install, enable, disable, uninstall)
- Team member management page (with mock data)
- Settings page with 5 tabs:
  - General (workspace name, description, timezone)
  - Security (2FA, sessions, password policy)
  - Billing (plan, usage, payment method)
  - Integrations (webhooks, API keys, external services)
  - Advanced (data export, danger zone)
- Base layout components (Sidebar, Header, AppLayout)
- API client with auto tenant header injection
- TanStack Router for routing
- React Query for data fetching
- Responsive design with collapsible sidebar

**Commit**: Multiple commits during development

**Total Code**: ~4,500 lines

---

## [0.1.0] - 2026-01-13 - Foundation Complete

### Milestone 1.1 - Foundation ✅

#### Added

- Monorepo setup with Turborepo + pnpm workspaces
- Docker Compose infrastructure with all services:
  - PostgreSQL with multi-schema support
  - Redis for caching and sessions
  - Keycloak for authentication
  - Redpanda (Kafka-compatible) for events
  - MinIO for object storage
- Core API skeleton with Fastify
- Prisma ORM with core database schema
- Health check endpoints
- Swagger/OpenAPI documentation
- CI/CD pipeline skeleton (GitHub Actions)
- Development documentation

**Commit**: `b7f71e0` - "feat: initial commit - monorepo setup with infrastructure"

---

## [0.2.0] - 2026-01-13 - Multi-Tenancy Complete

### Milestone 1.2 - Multi-Tenancy Core ✅

#### Added

- Keycloak Integration Service (252 lines)
  - Create/delete realms per tenant
  - Manage realm configurations
- Tenant Provisioning Service (372 lines)
  - Automated tenant creation workflow
  - PostgreSQL schema creation per tenant
  - Keycloak realm setup per tenant
  - Rollback on provisioning errors
  - Lifecycle states (PROVISIONING → ACTIVE)
- Tenant Management REST API (398 lines)
  - CRUD operations for tenants
  - List with pagination and filtering
  - Suspend/activate functionality
- Tenant Context Middleware (149 lines)
  - Automatic tenant detection from headers
  - Request context injection
- Schema-per-tenant isolation
- Initial tenant creation: acme-corp, globex-inc, demo-company

**Commit**: `0921ab7` - "feat: implement multi-tenancy core (M1.2)"

**Test Results**: All 3 test tenants created successfully with isolated schemas and realms

---

## [0.3.0] - 2026-01-13 - Authentication & Authorization Complete

### Milestone 1.3 - Authentication & Authorization ✅

#### Added

- JWT Verification Utilities (253 lines)
  - Token validation with Keycloak public keys
  - Redis caching for performance
  - Token refresh handling
- Authentication Middleware (223 lines)
  - JWT validation on protected routes
  - User context injection
  - Tenant context propagation
- RBAC Permission System (363 lines)
  - Role-based access control
  - Permission checking engine
  - Default roles: admin, user, guest
  - Permission-based guards
- Authentication REST API (292 lines)
  - Login/logout flows
  - Token refresh endpoint
  - User profile management
- User sync between Keycloak and database

**Commit**: `5a12f39` - "feat: implement authentication and authorization system (M1.3)"

---

## [0.4.0] - 2026-01-13 - Plugin System Complete

### Milestone 1.4 - Plugin System Base ✅

#### Added

- Plugin Type Definitions (218 lines)
  - Complete TypeScript interfaces
  - Manifest schema
  - Lifecycle hooks
  - Configuration types
- Plugin Registry Service (585 lines)
  - Global plugin registry
  - Plugin registration and validation
  - Version management
  - Plugin statistics
- Plugin Lifecycle Service
  - Install/uninstall per tenant
  - Activate/deactivate functionality
  - Configuration management
  - Dependency checking
  - Conflict resolution
- Plugin REST API (572 lines, 9 endpoints)
  - List available plugins
  - Register new plugins
  - Install/uninstall for tenants
  - Enable/disable functionality
  - Configuration updates
- Plugin Hook System (196 lines)
  - Extensibility points
  - Lifecycle hooks (install, activate, deactivate, uninstall)
- Sample Analytics Plugin
  - Complete manifest
  - Basic implementation
  - Example configuration

**Commit**: `e0f6e53` - "feat: implement complete plugin system with lifecycle management (M1.4)"

**Total Lines Added**: 2,062

**Test Results**:

- Plugin registration ✅
- Plugin installation for tenant ✅
- Plugin activation/deactivation ✅
- Plugin uninstallation ✅
- List installed plugins ✅

**Architecture Features**:

- Module Federation support for frontend plugins
- Backend hooks for extensibility
- Custom API endpoints per plugin
- Permission-based access control
- Plugin dependencies and conflicts
- Configuration validation per manifest

---

## [0.2.0] - TBD

### Milestone 1.2 - Multi-Tenancy Core

#### Added

- Tenant CRUD API
- Automatic tenant provisioning
- PostgreSQL schema per tenant
- Keycloak realm per tenant
- Storage bucket per tenant (MinIO)
- Migration system per tenant

---

## [0.3.0] - TBD

### Milestone 1.3 - Authentication & Authorization

#### Added

- JWT validation service
- Complete Keycloak integration
- User sync Keycloak ↔ Database
- RBAC system (Role-Based Access Control)
- Permission engine
- Auth guards and decorators

---

## [0.4.0] - TBD

### Milestone 1.4 - Plugin System Base

#### Added

- Plugin SDK (`@plexica/sdk` v0.1.0)
- Plugin registry service
- Plugin loader with Docker deployment
- Plugin migration system
- First working test plugin

---

## [0.5.0] - TBD

### Milestone 1.5 - Frontend Web App

#### Added

- React web app with Vite
- Auth flow with Keycloak
- Base layout (header, sidebar, navigation)
- Dashboard page
- Settings page
- Profile page
- API client (`@plexica/api-client`)

---

## [0.6.0] - TBD

### Milestone 1.6 - Super Admin Panel

#### Added

- Super Admin React app
- Tenant management UI
- Plugin management UI (base)
- Tenant provisioning progress tracking

---

## [1.0.0] - TBD (MVP Release)

### Milestone 1.7 - Testing & Deployment

#### Added

- Test coverage >80%
- Production-ready Docker Compose
- Load testing setup (k6)
- Base security testing
- API documentation (OpenAPI/Swagger)
- Setup and deployment guide

#### Changed

- Core API performance optimization

#### Fixed

- Various bugs from post-testing

---

## [2.0.0] - TBD

### Phase 2 - Plugin Ecosystem

#### Added

- Event system (Redpanda integration)
- Module Federation for frontend
- Plugin-to-plugin communication
- Plugin Registry & Marketplace
- Kubernetes deployment (Helm charts)
- Official plugins: CRM, Billing, Analytics

---

## [3.0.0] - TBD

### Phase 3 - Advanced Features

#### Added

- ABAC policy engine
- Advanced theming system
- Complete i18n with namespaces
- Core services: Storage, Notifications, Job Queue, Search
- Resource limits per tenant

---

## [4.0.0] - TBD

### Phase 4 - Enterprise

#### Added

- Complete observability (logging, tracing, metrics)
- Self-service tenant provisioning
- Per-tenant SSO (SAML, OIDC)
- Advanced analytics
- Disaster recovery procedures

---

## Template for New Releases

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added

- New features

### Changed

- Changes to existing features

### Deprecated

- Features marked as deprecated

### Removed

- Removed features

### Fixed

- Bug fixes

### Security

- Security fixes
```

---

**Notes**:

- Versions `0.x.x`: Pre-release, API may change
- Version `1.0.0`: First stable release (MVP)
- Versions `X.0.0`: Major release with breaking changes
- Versions `X.Y.0`: Minor release with new features (backward compatible)
- Versions `X.Y.Z`: Patch release with bug fixes

---

_Plexica Changelog_  
_Last updated: January 14, 2026_  
_Current Version: 0.6.0 (M2.3 in progress - 50%)_
