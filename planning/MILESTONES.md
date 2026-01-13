# Plexica - Milestones

Tracking of project's main milestones with target dates and completion criteria.

---

## Phase 1 - MVP Core

### M1.1 - Foundation ✅ Target: Week 4

**Status**: 🔴 Not Started  
**Owner**: DevOps + Backend Lead  
**Dates**: TBD

**Objectives**:
- [x] Working monorepo
- [ ] Local dev infrastructure
- [ ] Core API skeleton
- [ ] Base CI/CD

**Completion Criteria**:
- [ ] `pnpm dev` starts everything without errors
- [ ] PostgreSQL accessible and working
- [ ] Keycloak up and reachable
- [ ] Core API responds to `/health` with 200
- [ ] CI passes on every commit

**Blockers**: None

---

### M1.2 - Multi-Tenancy Core ✅ Target: Week 8

**Status**: 🔴 Not Started  
**Owner**: Backend Team  
**Dates**: TBD

**Objectives**:
- [ ] Tenant CRUD API
- [ ] Automatic tenant provisioning
- [ ] PostgreSQL schema per tenant
- [ ] Keycloak realm per tenant

**Completion Criteria**:
- [ ] POST /api/tenants creates complete tenant in <30s
- [ ] Tenant has dedicated DB schema
- [ ] Tenant has Keycloak realm
- [ ] Tenant has storage bucket
- [ ] Rollback works on error
- [ ] Integration tests pass

**Dependencies**: M1.1

---

### M1.3 - Authentication & Authorization ✅ Target: Week 12

**Status**: 🔴 Not Started  
**Owner**: Backend Team  
**Dates**: TBD

**Objectives**:
- [ ] JWT validation
- [ ] User sync Keycloak ↔ DB
- [ ] RBAC system
- [ ] Permission engine

**Completion Criteria**:
- [ ] Working end-to-end login flow
- [ ] JWT validation with Redis cache
- [ ] Tenant context propagated correctly
- [ ] Permission check < 10ms (with cache)
- [ ] Guards applicable via decorators
- [ ] Complete auth integration tests

**Dependencies**: M1.2

**Blockers**: None

---

### M1.4 - Plugin System Base ✅ Target: Week 16

**Status**: 🔴 Not Started  
**Owner**: Backend Team + SDK  
**Dates**: TBD

**Objectives**:
- [ ] Published Plugin SDK
- [ ] Plugin registry
- [ ] Plugin loader
- [ ] First test plugin

**Completion Criteria**:
- [ ] @plexica/sdk@0.1.0 published on npm
- [ ] Plugin install/enable/disable working
- [ ] Plugin container deployed correctly
- [ ] Plugin migrations applied
- [ ] Test plugin responds to requests
- [ ] Complete SDK documentation

**Dependencies**: M1.3

**Risks**:
- Container orchestration complexity
- Plugin communication performance

---

### M1.5 - Frontend Web App ✅ Target: Week 20

**Status**: 🔴 Not Started  
**Owner**: Frontend Team  
**Dates**: TBD

**Objectives**:
- [ ] React app with auth
- [ ] Base layout
- [ ] Core pages (dashboard, settings, profile)
- [ ] API client

**Completion Criteria**:
- [ ] Working Keycloak login redirect
- [ ] Secure token storage
- [ ] Responsive layout
- [ ] Dashboard displays tenant data
- [ ] Settings allow theme modification
- [ ] Core flows E2E tests pass

**Dependencies**: M1.3

**Blockers**: None

---

### M1.6 - Super Admin Panel ✅ Target: Week 24

**Status**: 🔴 Not Started  
**Owner**: Frontend Team  
**Dates**: TBD

**Objectives**:
- [ ] Super Admin app
- [ ] Tenant management UI
- [ ] Base Plugin management UI

**Completion Criteria**:
- [ ] Super Admin can create tenant from UI
- [ ] Working provisioning progress indicator
- [ ] Tenant list with filters and search
- [ ] Tenant detail shows all info
- [ ] Plugin list shows registry
- [ ] Complete tenant creation E2E test

**Dependencies**: M1.5, M1.4

---

### M1.7 - Testing & Deployment ✅ Target: Week 26

**Status**: 🔴 Not Started  
**Owner**: Whole team  
**Dates**: TBD

**Objectives**:
- [ ] Test coverage >80%
- [ ] Production-ready Docker Compose
- [ ] Complete documentation
- [ ] Demo deployment

**Completion Criteria**:
- [ ] Coverage >80% on core services
- [ ] Load test: 100 req/s without degradation
- [ ] Base security audit passed
- [ ] Docker Compose deploy on staging OK
- [ ] Documentation published
- [ ] Demo publicly accessible

**Dependencies**: M1.6

**Blockers**: None

---

## Phase 2 - Plugin Ecosystem

### M2.1 - Event System ✅ Target: Week 30

**Status**: 🔴 Not Started  
**Objectives**: Redpanda + Event Bus

### M2.2 - Module Federation ✅ Target: Week 34

**Status**: 🔴 Not Started  
**Objectives**: Dynamic frontend loading

### M2.3 - Plugin Communication ✅ Target: Week 38

**Status**: 🔴 Not Started  
**Objectives**: Advanced service discovery

### M2.4 - Plugin Registry & Marketplace ✅ Target: Week 42

**Status**: 🔴 Not Started  
**Objectives**: Plugin marketplace

### M2.5 - Kubernetes Deployment ✅ Target: Week 46

**Status**: 🔴 Not Started  
**Objectives**: Helm charts

### M2.6 - Official Plugins ✅ Target: Week 52

**Status**: 🔴 Not Started  
**Objectives**: CRM, Billing, Analytics

---

## Phase 3 - Advanced Features

_To be planned after Phase 2_

---

## Phase 4 - Enterprise

_To be planned after Phase 3_

---

## Legend

**Status**:
- 🔴 Not Started
- 🟡 In Progress
- 🟢 Completed
- ⏸️ Blocked
- ⚠️ At Risk

**Priority**:
- 🔥 Critical
- ⭐ High
- 📌 Medium
- 💡 Low

---

## Tracking Template

For each milestone, track:

```markdown
### M<phase>.<number> - <Name> ✅ Target: Week <N>

**Status**: 🔴 Not Started  
**Owner**: <Team/Person>  
**Start Date**: YYYY-MM-DD  
**End Date (estimated)**: YYYY-MM-DD  
**End Date (actual)**: YYYY-MM-DD

**Objectives**:
- [ ] Objective 1
- [ ] Objective 2

**Completion Criteria**:
- [ ] Criteria 1
- [ ] Criteria 2

**Dependencies**: M<X>.<Y>

**Blockers**: 
- Issue #123: Blocker description

**Risks**:
- Risk 1: Mitigation
- Risk 2: Mitigation

**Notes**:
Any additional notes
```

---

*Plexica Milestones v1.0*  
*Last Updated: January 2025*
