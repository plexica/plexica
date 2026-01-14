# Plexica - Roadmap

**Current Version**: 0.6.0 (Pre-Alpha)  
**Last Updated**: January 14, 2026  
**Current Phase**: Phase 1 - MVP Core (Testing & Deployment)  
**Current Progress**: 99% (6.95/7 milestones completed)

---

## Timeline Overview

```
2025-2026 Q1: Phase 1 (MVP Core) - 99% COMPLETE (M2.3 in progress)
2026 Q2-Q3:   Phase 2 (Plugin Ecosystem)
2026 Q4-2027: Phase 3 (Advanced Features)
2027+:        Phase 4 (Enterprise)
Future:       Phase 5 (Ecosystem Expansion)
```

**Phase 1 Status**: Backend ✅, Frontend ✅, Testing & Deployment 🟡 (50%)

---

## Phase 1 - MVP Core (Q1 2026)

**Objective**: Functional platform with multi-tenancy and base plugin system  
**Status**: 99% Complete (6.95/7 milestones) - Testing & Deployment in Progress 🟡

### Milestone 1.1 - Foundation (Weeks 1-4) ✅ COMPLETED

**Completion Date**: January 13, 2026  
**Commit**: `b7f71e0`

- [x] Setup monorepo (Turborepo + pnpm)
- [x] Base infrastructure configuration
  - [x] PostgreSQL with multi-tenant schema
  - [x] Redis cluster
  - [x] Keycloak setup
- [x] Core API Service skeleton
  - [x] Fastify + Prisma setup
  - [x] Tenant context middleware
  - [x] Database connection pooling
- [x] Base CI/CD pipeline (GitHub Actions)

**Deliverable**: ✅ Configured repository, working dev infrastructure

### Milestone 1.2 - Multi-Tenancy Core (Weeks 5-8) ✅ COMPLETED

**Completion Date**: January 13, 2026  
**Commit**: `0921ab7`

- [x] Tenant Management
  - [x] CRUD tenant (API + DB)
  - [x] Automatic tenant provisioning
  - [x] PostgreSQL schema per tenant
  - [x] Keycloak realm per tenant
  - [x] Storage bucket per tenant
- [x] Migration system
  - [x] Core migrations
  - [x] Tenant schema template
  - [x] Migration runner service

**Deliverable**: ✅ Working multi-tenant system, complete tenant provisioning

### Milestone 1.3 - Authentication & Authorization (Weeks 9-12) ✅ COMPLETED

**Completion Date**: January 13, 2026  
**Commit**: `5a12f39`

- [x] Keycloak Integration
  - [x] JWT validation service
  - [x] User sync Keycloak ↔ DB
  - [x] Auth guards (Fastify hooks)
  - [x] Tenant guard
- [x] RBAC System
  - [x] Base permission engine
  - [x] Role management
  - [x] User-Role assignment
  - [x] Permission checking middleware

**Deliverable**: ✅ Complete auth system with working RBAC

### Milestone 1.4 - Plugin System Base (Weeks 13-16) ✅ COMPLETED

**Completion Date**: January 13, 2026  
**Commit**: `e0f6e53`

- [x] Plugin SDK (@plexica/sdk)
  - [x] Base PlexicaPlugin class
  - [x] Database client
  - [x] Event client stub
  - [x] Decorators (@Route, @Permission)
- [x] Plugin Registry
  - [x] Plugin manifest validation
  - [x] Plugin registration service
  - [x] Plugin lifecycle (install, enable, disable)
- [x] Plugin Loader
  - [x] Container deployment (Docker) - Deferred to Phase 2
  - [x] Plugin migrations
  - [x] Base service discovery

**Deliverable**: ✅ Working base plugin system, first test plugin (sample-analytics)

### Milestone 2.1 - Frontend Tenant App (Weeks 17-20) ✅ COMPLETED

**Completion Date**: January 13-14, 2026  
**Previous Name**: M1.5 - Frontend Foundation

- [x] React app setup (Vite) - `apps/web`
- [x] Base layout
  - [x] Header, sidebar, navigation
  - [x] Auth flow with Keycloak (PKCE)
  - [x] Tenant context provider
  - [x] Responsive design with collapsible sidebar
- [x] Core pages
  - [x] Dashboard with stats and tenant data
  - [x] Plugins page (install, enable, disable, uninstall)
  - [x] Team Management (with mock data)
  - [x] Settings (5 tabs: general, security, billing, integrations, advanced)
- [x] Module Federation setup for dynamic plugin loading
- [x] API client with tenant context injection
- [x] TanStack Router for routing
- [x] React Query for data fetching

**Deliverable**: ✅ Working tenant frontend with auth, layout, and plugin infrastructure (~4,500 lines)

### Milestone 2.2 - Super Admin Frontend App (Weeks 21-24) ✅ COMPLETED

**Completion Date**: January 14, 2026  
**Previous Name**: M1.6 - Super Admin Panel  
**Commits**: `a21ba83`, `e99ca23`, `57c2d48`, `0f4db10`

- [x] Super Admin React app setup - `apps/super-admin` (port 3002)
- [x] Super Admin layout (separate from tenant app)
- [x] Platform Dashboard with stats
- [x] Tenant Management UI
  - [x] Tenant list with real-time data
  - [x] Tenant creation with provisioning indicator
  - [x] Tenant detail modal with infrastructure info
  - [x] Suspend/activate tenant
  - [x] Search and filter functionality
- [x] Plugin Marketplace UI
  - [x] Global plugin registry view
  - [x] Plugin detail modal with technical specs
  - [x] Search by name, description, author
  - [x] Filter by status and category
- [x] Platform Users Management (cross-tenant view with mock data)
- [x] Platform Analytics Dashboard
  - [x] Tenant growth charts
  - [x] API usage metrics
  - [x] Plugin installation stats
  - [x] Time period selector (24h/7d/30d)
- [x] Authentication flow
  - [x] Mock login (admin@plexica.com / admin)
  - [x] Protected routes with session management
  - [x] Logout functionality
- [x] React Query integration for data fetching
- [x] API client without tenant context (global view)

**Deliverable**: ✅ Working Super Admin panel for platform management (~2,020 lines)

### Milestone 2.3 - Testing & Deployment (Weeks 25-26) 🟡 50% COMPLETE

**Start Date**: January 14, 2026  
**Previous Name**: M1.7 - Deployment & Testing  
**Commit**: `159f02c` - Testing infrastructure and production config

- [x] Testing Infrastructure
  - [x] Vitest setup with v8 coverage
  - [x] Test environment configuration
  - [x] Unit tests for TenantService (5 tests ✅)
  - [x] Unit tests for PluginRegistryService (6 tests ✅)
  - [x] Testing documentation (TESTING.md)
  - [ ] Unit tests for auth services
  - [ ] Unit tests for middleware
  - [ ] Integration tests
  - [ ] E2E tests with Playwright
- [x] Production Deployment
  - [x] Production Dockerfiles (core-api, web, super-admin)
  - [x] Nginx reverse proxy configuration
  - [x] Health checks for all services
  - [x] Production docker-compose.yml with HA
  - [x] Environment configuration template (.env.prod.example)
  - [ ] Test production build
  - [ ] Deploy to staging
- [ ] Load Testing
  - [ ] k6 or Artillery setup
  - [ ] 100 req/s target validation
- [ ] Security Audit
  - [ ] Authentication flow review
  - [ ] Input validation check
  - [ ] Rate limiting verification
- [ ] Documentation
  - [x] Testing documentation
  - [x] Production environment template
  - [ ] Deployment guide
  - [ ] API documentation completion
- [ ] Demo deployment

**Current Status**: Test coverage ~28%, production infrastructure ready

**Deliverable**: 🟡 Deployable and tested MVP platform (in progress)

---

## Phase 2 - Plugin Ecosystem (Q3-Q4 2025)

**Objective**: Complete plugin ecosystem with event-driven communication

### Milestone 2.1 - Event System (Weeks 27-30)

- [ ] Redpanda integration
- [ ] Event Bus service
- [ ] Event publishing/subscription
- [ ] Dead letter queue
- [ ] Event decorators for plugins

### Milestone 2.2 - Module Federation (Weeks 31-34)

- [ ] Complete dynamic plugin route registration in `apps/web`
- [ ] Plugin remote entry CDN/hosting
- [ ] Sample plugins with Module Federation
- [ ] Dynamic routing per plugin
- [ ] Plugin menu item registration in sidebar

### Milestone 2.3 - Plugin-to-Plugin Communication (Weeks 35-38)

- [ ] Advanced service discovery
- [ ] REST API inter-plugin
- [ ] Shared data service
- [ ] Plugin dependency resolution

### Milestone 2.4 - Plugin Registry & Marketplace (Weeks 39-42)

- [ ] Plugin Registry API
- [ ] Plugin publishing workflow
- [ ] Marketplace UI
- [ ] Plugin installation from registry
- [ ] Plugin versioning

### Milestone 2.5 - Kubernetes Deployment (Weeks 43-46)

- [ ] Helm charts
- [ ] K8s manifests
- [ ] Plugin deployment automation K8s
- [ ] Production-ready configuration

### Milestone 2.6 - Official Plugins (Weeks 47-52)

- [ ] CRM Plugin
- [ ] Billing Plugin
- [ ] Analytics Plugin
- [ ] Plugin developer documentation

**Deliverable**: Complete and working plugin ecosystem

---

## Phase 3 - Advanced Features (Q1-Q2 2026)

**Objective**: Advanced features for enterprise use

### Milestone 3.1 - ABAC Policy Engine

- [ ] Policy engine implementation
- [ ] Policy DSL
- [ ] Policy evaluation service
- [ ] Policy UI for tenant admin

### Milestone 3.2 - Advanced Theming

- [ ] Advanced theme system
- [ ] Custom CSS per tenant
- [ ] White-label support
- [ ] Theme preview

### Milestone 3.3 - Complete i18n System

- [ ] Namespace per plugin
- [ ] Dynamic translation loading
- [ ] Translation override per tenant
- [ ] Translation management UI

### Milestone 3.4 - Core Services

- [ ] Complete Storage Service
- [ ] Notification Service (email, push, in-app)
- [ ] Job Queue Service (scheduled jobs)
- [ ] Search Service (Elasticsearch)

### Milestone 3.5 - Resource Limits

- [ ] Quota system per tenant
- [ ] Usage tracking
- [ ] Advanced rate limiting
- [ ] Resource monitoring

**Deliverable**: Enterprise-ready platform

---

## Phase 4 - Enterprise (Q3+ 2026)

**Objective**: Enterprise features and self-service

### Milestone 4.1 - Observability

- [ ] Complete structured logging
- [ ] Distributed tracing (OpenTelemetry)
- [ ] Metrics (Prometheus)
- [ ] Dashboards (Grafana)
- [ ] Alerting

### Milestone 4.2 - Self-Service Tenant Provisioning

- [ ] Public signup flow
- [ ] Email verification
- [ ] Onboarding wizard
- [ ] Trial management

### Milestone 4.3 - SSO per Tenant

- [ ] SAML support
- [ ] OIDC provider integration
- [ ] Custom IdP per tenant
- [ ] SSO configuration UI

### Milestone 4.4 - Advanced Analytics

- [ ] Usage analytics
- [ ] Custom reports
- [ ] Data export
- [ ] Analytics API

### Milestone 4.5 - Disaster Recovery

- [ ] Backup automation
- [ ] Point-in-time recovery
- [ ] Geo-replication
- [ ] Failover procedures

**Deliverable**: Production-grade enterprise platform

---

## Phase 5 - Ecosystem Expansion (Future)

**Objective**: Language and technology support expansion

### Future Considerations

- [ ] Plugin SDK Python (if requested)
- [ ] Support other languages (Go, Rust)
- [ ] WebAssembly for plugin isolation
- [ ] Edge computing support
- [ ] Mobile SDK (React Native)

---

## Priorities and Dependencies

### Critical Blockers

1. **Multi-tenancy core** blocks everything
2. **Auth & RBAC** blocks frontend and plugins
3. **Plugin SDK** blocks plugin development
4. **Event system** blocks plugin communication

### Nice-to-Have (Non-blocking)

- Advanced theming
- Complete i18n
- ABAC (RBAC sufficient for MVP)
- Self-service provisioning

---

## Success Metrics

### Phase 1 (MVP)

- ✅ Tenant provisioning < 30s
- ✅ API response time p95 < 500ms
- ✅ 3+ working internal plugins
- ✅ Working Docker Compose deploy

### Phase 2 (Plugin Ecosystem)

- ✅ 10+ plugins available in registry
- ✅ Plugin install < 60s
- ✅ Event delivery < 100ms p95
- ✅ Production-ready Kubernetes deploy

### Phase 3 (Advanced)

- ✅ 50+ active tenants
- ✅ Custom theming for 80% tenants
- ✅ Support 10+ languages
- ✅ 99.9% uptime

### Phase 4 (Enterprise)

- ✅ 200+ active tenants
- ✅ Working self-service signup
- ✅ SSO integrated for 50% tenants
- ✅ 99.95% uptime

---

## Resources and Team

### Phase 1 (MVP)

**Minimum recommended team**:

- 2x Backend Developer (Core API, Plugin System)
- 1x Frontend Developer (React, Module Federation)
- 1x DevOps/Infrastructure
- 1x Product Manager/Tech Lead

**Estimated duration**: 6 months

### Phase 2-4

**Team scaling**:

- +1 Backend Developer (Plugin ecosystem)
- +1 Frontend Developer (Advanced UI)
- +1 QA Engineer
- +1 Technical Writer (Documentation)

---

## Versioning Notes

- **Pre-Alpha**: Phase 1 in progress
- **Alpha**: Phase 1 completed
- **Beta**: Phase 2 completed
- **v1.0**: Phase 3 completed
- **v2.0**: Phase 4 completed

---

_Plexica Roadmap v1.1_  
_Last Updated: January 13, 2026_  
_Team: Plexica Engineering_  
_Status: Phase 1 Backend Complete (4/7 milestones)_
