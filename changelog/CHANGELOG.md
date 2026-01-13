# Changelog

All notable changes to the Plexica project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planning
- Created specs repository structure
- Defined functional and technical specifications
- Created Phase 1-5 roadmap
- Defined detailed development plan

---

## [0.1.0] - TBD

### Milestone 1.1 - Foundation

#### Added
- Monorepo setup with Turborepo + pnpm
- PostgreSQL multi-schema configuration
- Redis cluster setup
- Keycloak integration
- Core API skeleton (Fastify)
- Base CI/CD pipeline (GitHub Actions)

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

*Plexica Changelog*  
*Last updated: January 2025*
