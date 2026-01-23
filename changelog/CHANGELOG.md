# Changelog

All notable changes to the Plexica project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Next - M2.4 Plugin Registry & Marketplace

#### Planning

- Plugin publishing workflow
- Marketplace UI (Super Admin + Tenant)
- Installation wizard
- Review and rating system

---

## [0.7.0] - 2026-01-23 - Comprehensive Testing & Deployment Complete

### Milestone 2.3 - Testing & Deployment ✅

#### Added

- **Comprehensive Test Suite** (1047 tests, 100% passing)
  - 29 dedicated test files covering core functionality
  - 80.00% lines coverage achieved (target: ≥80%)
  - 82.04% functions coverage
  - 80.01% statements coverage
  - 68.71% branches coverage

- **JWT Utilities Tests** (35 tests, 418 lines)
  - Bearer token extraction (edge cases, whitespace, case sensitivity)
  - Role checking with null handling and multiple roles
  - Client role checking for missing/multiple clients
  - User info extraction for complete/minimal/error cases
  - Internal token generation and verification
  - Token expiration and error handling
  - Coverage: jwt.ts improved 30.35% → 83.92%

- **Keycloak JWT Tests** (14 tests, 289 lines)
  - Keycloak token verification with mocked JWKS client
  - Token tenant extraction from custom claims
  - Tenant extraction from issuer URL parsing
  - Error handling for missing kid headers
  - Null token decoding
  - Network error handling
  - Multi-realm support

- **Tenant Context Helpers Tests** (22 tests, 262 lines)
  - AsyncLocalStorage context retrieval and mutation
  - Schema name and workspace ID extraction
  - User ID management with error handling
  - Prisma schema execution with rollback
  - Invalid/valid schema name validation
  - Coverage: tenant-context.ts improved 51.78% → 100%

- **Integration Tests** (Multiple files)
  - API endpoint testing with full request/response
  - Database operation testing
  - Middleware chain testing
  - Multi-tenant isolation verification
  - Error handling and edge cases
  - Keycloak integration scenarios

#### Testing Infrastructure

- **Vitest Configuration** (v8 provider for coverage)
  - Coverage include/exclude patterns optimized
  - Min coverage thresholds: 80% lines/functions/statements
  - Isolated test environment with proper cleanup
  - Mock strategy with spyOn and vi.fn()

- **Test Patterns Established**
  - Unit tests with mocked dependencies
  - Integration tests with full service chains
  - Error case testing for each function
  - Edge case coverage (null, empty, special characters)

#### Metrics

- **Total Tests**: 1,047 (100% passing) 🎯
- **Test Files**: 29 organized files
- **Coverage Lines**: 80.00% ✅ (GOAL ACHIEVED)
- **Execution Time**: ~15 seconds
- **Critical Improvements**:
  - jwt.ts: 30.35% → 83.92% (+53.57%)
  - tenant-context.ts: 51.78% → 100% (+48.22%)
  - middleware: 75% → 100% (+25%)

---

## [0.3.0] - 2026-01-22 - Plugin-to-Plugin Communication Complete

### Milestone 2.3 - Plugin-to-Plugin Communication ✅

#### Added

- **Service Registry** (359 lines)
  - Service registration and discovery with Redis caching
  - Health check and availability tracking
  - Fast service lookup (<1ms cached)
  - Automatic service deregistration on plugin deactivation

- **Dependency Resolution Service** (411 lines)
  - Topological sorting for dependency order validation
  - Circular dependency detection and prevention
  - Required vs optional dependency support
  - Conflict detection and resolution

- **Shared Data Service** (340 lines)
  - Cross-plugin state management with TTL
  - JSON data storage with validation
  - Namespace-based access control
  - Automatic cleanup of expired data

- **Plugin API Gateway** (278 lines)
  - Inter-plugin HTTP request routing
  - Request/response proxying with tenant context
  - Service discovery integration
  - Low overhead (5-20ms) communication layer

- **Plugin Manifest Schema** (271 lines)
  - Zod-based validation for plugin.json
  - Service declaration support (provides/consumes)
  - Dependency specification with semver
  - Comprehensive validation error messages

- **REST API** (573 lines - 15 endpoints)
  - POST /api/plugin-gateway/services/register
  - DELETE /api/plugin-gateway/services/:serviceId
  - GET /api/plugin-gateway/services
  - GET /api/plugin-gateway/services/:serviceId
  - POST /api/plugin-gateway/dependencies/validate
  - GET /api/plugin-gateway/dependencies/:pluginId
  - POST /api/plugin-gateway/shared-data
  - GET /api/plugin-gateway/shared-data
  - GET /api/plugin-gateway/shared-data/:key
  - DELETE /api/plugin-gateway/shared-data/:key
  - POST /api/plugin-gateway/call/:serviceId/:endpoint
  - GET /api/plugin-gateway/call/:serviceId/:endpoint
  - PUT /api/plugin-gateway/call/:serviceId/:endpoint
  - DELETE /api/plugin-gateway/call/:serviceId/:endpoint
  - POST /api/plugin-gateway/manifest/validate

- **Database Migration** (4 new tables)
  - `plugin_services` - Service registry with metadata
  - `plugin_service_endpoints` - HTTP endpoint definitions
  - `plugin_dependencies` - Dependency graph storage
  - `shared_plugin_data` - Cross-plugin state with TTL

- **Example Plugins** (2 working plugins)
  - **CRM Plugin** (port 3100):
    - Exposes `crm.contacts` and `crm.deals` services
    - 15 REST endpoints for contact/deal management
    - In-memory data storage
    - Complete plugin.json manifest
  - **Analytics Plugin** (port 3200):
    - Consumes CRM services via API Gateway
    - Generates reports from CRM data
    - HTTP client for inter-plugin communication
    - Declares dependencies in manifest

- **Testing Suite** (111 tests, 100% passing)
  - Service Registry: 14 tests (76.56% coverage)
  - Dependency Resolution: 15 tests (92.18% coverage)
  - Shared Data: 23 tests (83.33% coverage)
  - API Gateway: 18 tests (93.33% coverage)
  - Manifest Schema: 30 tests (92.85% coverage)
  - Integration: 11 tests (full workflow coverage)
  - Average coverage: 87.65% ✅

- **E2E Test Script** (scripts/test-plugin-to-plugin.sh)
  - Service registration verification
  - Dependency validation tests
  - Shared data operations
  - Inter-plugin API calls
  - All 7 tests passing ✅

- **Comprehensive Documentation** (~3,600 lines)
  - **API Reference** (docs/api/plugin-communication-api.md - 700 lines)
    - All 15 endpoints documented
    - Request/response examples with cURL
    - Error codes and handling
  - **Plugin Developer Guide** (docs/guides/plugin-development.md - 1,000 lines)
    - Quick start tutorial
    - Service exposure patterns
    - Service consumption patterns
    - Shared data usage
    - Best practices
  - **Architecture Documentation** (docs/architecture/plugin-ecosystem.md - 800 lines)
    - System overview with diagrams
    - Service Registry architecture
    - Dependency Resolution algorithm
    - API Gateway design
    - Performance & scalability
  - **Example Integration** (docs/examples/crm-analytics-integration.md - 600 lines)
    - Complete CRM ↔ Analytics walkthrough
    - Real code references
    - Testing instructions
  - **Migration Guide** (docs/guides/plugin-migration.md - 500 lines)
    - Step-by-step upgrade instructions
    - Before/after examples
    - Troubleshooting guide

**Commits**:

- `8f90b46` - feat(m2.3): complete plugin-to-plugin communication with comprehensive documentation
- Merge commit `446b2c0` - Merge M2.3 Plugin-to-Plugin Communication (100% complete)

**Total Code**: ~9,500 lines

- Production code: ~1,660 lines (4 services)
- Test code: ~2,753 lines (111 tests)
- Documentation: ~3,600 lines (5 documents)
- Example plugins: ~1,500 lines (2 plugins)

**Performance Achievements**:

- Service discovery (cached): <1ms ✅
- API Gateway overhead: 5-20ms ✅
- Test coverage: 87.65% ✅ (exceeds 80% target)

**Phase 2 Progress**: 50% (3/6 milestones complete)

---

## [0.2.0] - 2026-01-20 - Module Federation & CDN Complete

### Milestone 2.2 - Module Federation & CDN ✅

#### Added

- MinIO CDN infrastructure for plugin storage
- Plugin upload API with validation
- Module Federation configuration
- Frontend plugin loading system
- Plugin hot-reloading support

---

## [0.1.0] - 2026-01-18 - Event System Complete

### Milestone 2.1 - Event System & Message Bus ✅

#### Added

- Redpanda integration for event streaming
- Event Bus service with publish/subscribe
- Dead Letter Queue (DLQ) handling
- Event metrics and monitoring
- Plugin event client

---

## [Unreleased - Old]

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
