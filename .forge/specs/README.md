# FORGE Specifications

This directory contains the official FORGE specifications for Plexica.

## Specification Index

| Spec ID | Feature                   | Status      | Lines | Last Updated |
| ------- | ------------------------- | ----------- | ----- | ------------ |
| 001     | Multi-Tenancy             | ✅ Approved | 215   | 2026-02-13   |
| 002     | Authentication            | ✅ Approved | 208   | 2026-02-13   |
| 003     | Authorization (RBAC+ABAC) | ✅ Approved | 236   | 2026-02-13   |
| 004     | Plugin System             | ✅ Approved | 318   | 2026-02-13   |
| 005     | Frontend Architecture     | ✅ Approved | 251   | 2026-02-13   |
| 006     | i18n                      | ✅ Approved | 267   | 2026-02-13   |
| 007     | Core Services             | ✅ Approved | 189   | 2026-02-13   |
| 008     | Admin Interfaces          | ✅ Approved | 241   | 2026-02-13   |
| 009     | Workspace Management      | ✅ Approved | 2,953 | 2026-02-16   |

## Implementation Status

| Spec | Feature               | Completion | Status           | Implementation Location                                    |
| ---- | --------------------- | ---------- | ---------------- | ---------------------------------------------------------- |
| 001  | Multi-Tenancy         | 95% ✅     | Production-ready | `apps/core-api/src/services/tenant.service.ts`             |
| 002  | Authentication        | 80% ✅     | Mostly complete  | `apps/core-api/src/middleware/auth.ts`                     |
| 003  | Authorization         | 60% ⚠️     | RBAC only        | `apps/core-api/src/services/permission.service.ts`         |
| 004  | Plugin System         | 85% ✅     | Core complete    | `apps/core-api/src/services/plugin.service.ts`             |
| 005  | Frontend Architecture | 70% ✅     | Functional       | `apps/web/src/`                                            |
| 006  | i18n                  | 100% ✅    | **Complete**     | `packages/i18n/`, `apps/core-api/src/modules/i18n/`        |
| 007  | Core Services         | 0% ❌      | **Not started**  | -                                                          |
| 008  | Admin Interfaces      | 75% ✅     | Core UI exists   | `apps/super-admin/`, `apps/web/src/routes/settings/`       |
| 009  | Workspace Management  | 85% ✅     | Mostly complete  | `apps/core-api/src/modules/workspace/workspace.service.ts` |

**Overall Completion:** 76%

---

## 🔴 Critical Gaps

### 1. Spec 007 - Core Services (0% implemented)

**All 4 services are missing:**

- ❌ Storage Service (upload/download files, signed URLs)
- ❌ Notification Service (email, push, in-app notifications)
- ❌ Job Queue Service (async tasks, cron scheduling)
- ❌ Search Service (full-text search with tenant isolation)

**Impact:** Plugins cannot use essential infrastructure services. **Critical blocker** for plugin ecosystem.

**Priority:** P0 - Must implement before production

---

### 2. Spec 003 - ABAC System (missing)

**Current state:**

- ✅ RBAC fully implemented (role-based permissions)
- ❌ ABAC completely absent (attribute-based policies)

**Spec requires:** Hybrid RBAC + ABAC model

**Impact:** Cannot implement fine-grained authorization (e.g., "Sales team can only view their own deals")

**Priority:** P0 - Constitutional requirement (Article 1.2)

---

### 3. Spec 002 - User Sync (missing)

**Current state:**

- ✅ JWT authentication working
- ❌ No Keycloak → Plexica user synchronization

**Impact:** User data (email, display name, avatar) is out-of-sync between Keycloak and internal database

**Priority:** P1 - Data quality issue

---

## 📋 Implementation Roadmap

### Sprint 1: Core Services (2 weeks)

- [ ] Storage Service (MinIO wrapper)
- [ ] Notification Service (email + in-app)
- [ ] Job Queue Service (BullMQ or Redpanda)
- [ ] Search Service (Elasticsearch or MeiliSearch)
- [ ] Documentation: `docs/CORE_SERVICES.md`

### Sprint 2: ABAC System (1 week)

- [ ] Database schema: `policies` table
- [ ] PolicyEngine implementation
- [ ] Authorization flow: RBAC → ABAC → Decision
- [ ] Plugin permission auto-registration
- [ ] Documentation: `docs/AUTHORIZATION.md`

### Sprint 3: User Sync (3 days)

- [ ] KeycloakEventConsumer
- [ ] Webhook endpoint `/api/v1/auth/sync`
- [ ] Event processing (create, update, delete)
- [ ] Documentation: Update `docs/AUTHENTICATION.md`

---

## 📖 How to Read Specs

Each spec follows the FORGE format:

1. **Overview** - High-level description
2. **Problem Statement** - What problem does this solve?
3. **User Stories** - Who needs what and why?
4. **Functional Requirements** - What must the system do?
5. **Non-Functional Requirements** - Performance, security, scalability targets
6. **Edge Cases** - Error scenarios and handling
7. **Success Metrics** - How do we measure completion?

---

## 🔗 Related Documents

- **Gap Analysis:** [`.forge/knowledge/gap-analysis-2026-02-16.md`](../knowledge/gap-analysis-2026-02-16.md) - Detailed comparison of specs vs implementation
- **Constitution:** [`.forge/constitution.md`](../constitution.md) - Non-negotiable principles and standards
- **Architecture:** [`.forge/architecture/`](../architecture/) - System design documents
- **Decisions:** [`.forge/knowledge/decision-log.md`](../knowledge/decision-log.md) - Technical decisions and rationale

---

## 📊 Metrics

### Specification Coverage

```
User Stories:       85 total (64 implemented, 21 missing)
Functional Reqs:    182 total (136 implemented, 46 missing)
Non-Functional Reqs: 60 total (41 met, 19 not yet measured)
```

### Test Coverage by Spec

```
Spec 001 (Multi-Tenancy):       87% (145 tests)
Spec 002 (Authentication):      82% (118 tests)
Spec 003 (Authorization):       65% (89 tests)   ⚠️ ABAC missing
Spec 004 (Plugin System):       88% (167 tests)
Spec 005 (Frontend Arch):       71% (134 tests)
Spec 006 (i18n):               95% (263 tests)   ✅
Spec 007 (Core Services):       0% (0 tests)     ❌
Spec 008 (Admin Interfaces):   68% (92 tests)
Spec 009 (Workspace Mgmt):      65% (255 tests)  ⚠️ Target: 85%
```

---

## 🎯 Success Criteria

A spec is considered **complete** when:

- ✅ All user stories have acceptance criteria met
- ✅ All "Must" functional requirements implemented
- ✅ All non-functional requirements measured and met
- ✅ Test coverage ≥ 80% for spec-related code
- ✅ Documentation complete in `docs/`
- ✅ Adversarial review passed (`/forge-review`)

---

**Last Updated:** February 16, 2026  
**Review Cycle:** Every milestone completion  
**Next Review:** After Spec 007 implementation
