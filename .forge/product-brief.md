# Plexica v2 — Product Brief

**Date**: March 2026
**Status**: Approved
**Type**: Clean rewrite of Plexica v1

---

## What is Plexica?

Plexica is a **multi-tenant SaaS platform** that enables organizations to
build and deploy tenant-isolated applications with plugin-based extensibility.

Each tenant (organization) gets:
- Complete data isolation (own database schema, own auth realm)
- Workspaces with hierarchical structure and granular permissions
- A plugin marketplace to extend functionality
- Customizable branding (logo, colors, dark mode)

The platform is managed by a super admin who provisions tenants, manages the
plugin catalog, and monitors system health.

## Why a Rewrite?

Plexica v1 reached a point where **incremental investment no longer produces
proportional value**. Five critical problems:

1. **4000+ tests that don't verify the real system** — tests use mocks,
   fake auth tokens (`isTestToken`), and a separate `test-app.ts` that
   diverges from production. High coverage, zero confidence.

2. **Unusable UX** — monospace font, no brand colors, 3 data fetching
   patterns, 3 form patterns, 2 auth stores, emoji as icons, route
   files over 1000 lines.

3. **Plugin system too complex for anyone to use** — SDK with 6 classes,
   exposed Module Federation config, 7 lifecycle states, container
   orchestration via Dockerode. No real plugin ever worked end-to-end.

4. **Over-engineering** — 33 ADRs, 19 specs, 9-article constitution,
   dual-model AI review. Most features never implemented.

5. **Lost project control** — more governance artifacts than working
   software. The documentation-to-code ratio is inverted.

**Decision**: Clean rewrite in a new repository. Cherry-pick good ideas
from v1 (not code). Every feature verified by E2E tests before being
considered "done".

## Target Users

### Super Admin (Platform Operator)
- Provisions and manages tenants (create, suspend, delete)
- Manages plugin catalog (marketplace)
- Monitors system health (metrics, logs, alerts)
- Daily use, high technical level

### Tenant Admin (Organization Administrator)
- Configures their tenant (branding, settings, auth)
- Manages users, roles, and permissions
- Installs and configures plugins
- Manages workspaces and access control
- Weekly use, medium technical level

### Tenant User (End User)
- Navigates assigned workspaces
- Uses plugin-provided functionality
- Manages their profile, receives notifications
- Daily use, low-medium technical level

### Plugin Developer
- Creates plugins with UI and backend in half a day
- Needs clear documentation with step-by-step tutorials
- Subscribes to events and extends core entities
- Development-time use, high technical level

## Scope — Feature Parity

The v2 is **not an MVP**. It implements all features specified in the v1
design documents, done correctly this time:

| Area | Key Features |
|------|-------------|
| **Multi-tenancy** | Schema-per-tenant, provisioning, suspension, deletion (GDPR), branding |
| **Authentication** | Keycloak multi-realm, SSO, social login, MFA, JWT RS256 |
| **Authorization** | RBAC + ABAC tree-walk, workspace hierarchy isolation |
| **Workspaces** | CRUD, hierarchy (parent/child), members, templates, settings |
| **Plugin System** | Module Federation UI, backend proxy, Kafka events, data persistence, marketplace, CLI scaffolding |
| **Super Admin** | Tenant management, plugin catalog, system health, Kafka monitoring |
| **Notifications** | SSE real-time, email, notification center, per-user preferences |
| **i18n** | English + Italian, plugin translations, tenant overrides |
| **Observability** | Health checks, Prometheus metrics, Grafana, structured logging, OpenTelemetry |
| **UX** | Design system (Inter, Radix UI), dark mode, responsive, WCAG 2.1 AA |

## Architecture Decisions (confirmed, non-negotiable)

| Decision | Rationale | ADR |
|----------|-----------|-----|
| Schema-per-tenant PostgreSQL | GDPR data isolation, per-tenant backup/delete | ADR-001 |
| Keycloak multi-realm | Per-tenant auth mechanisms (SAML, OIDC, social) | ADR-002 |
| ABAC tree-walk | Workspace-level data isolation within tenant | ADR-003 |
| Kafka/Redpanda event bus | Plugin event subscription, polyglot consumers | ADR-004 |
| Module Federation for plugin UI | Runtime loading, shared deps, no iframe | ADR-005 |
| Plugin tables in tenant schema | Automatic isolation, GDPR deletion | ADR-006 |
| Plugin-brings-migrations, core-executes | Plugin autonomy, core security perimeter | ADR-007 |
| TypeScript core, polyglot plugin backends | Dev speed + ecosystem for core, freedom for plugins | ADR-008 |
| Keycloak over Better Auth | Circular dependency with schema-per-tenant, enterprise maturity | ADR-009 |

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js ≥20, TypeScript, Fastify, Prisma, PostgreSQL 15+ |
| Frontend | React 19, Vite, TanStack Router/Query, Zustand, Tailwind CSS, Radix UI |
| Auth | Keycloak 26+ (realm-per-tenant) |
| Events | Kafka/Redpanda (single-node dev, cluster prod) |
| Storage | Redis (cache/sessions), MinIO (object storage) |
| Testing | Playwright (E2E), Vitest (unit/integration) |
| Infra | pnpm monorepo, Docker Compose, GitHub Actions |

## Timeline

7 phases, 20-27 weeks (~5-7 months) with 1 developer full-time:

| Phase | Duration | Delivers |
|-------|----------|----------|
| 0 — Infrastructure | 1-2 weeks | Monorepo, Docker Compose, CI, design system base |
| 1 — Foundations | 3-4 weeks | Auth, multi-tenancy, frontend shell |
| 2 — Core Features | 4-5 weeks | Workspaces, users, roles, ABAC, tenant settings |
| 3 — Plugin System | 5-6 weeks | MF UI, Kafka events, backend proxy, CRM plugin, marketplace, CLI |
| 4 — Super Admin | 2-3 weeks | Platform management UI |
| 5 — Cross-Cutting | 3-4 weeks | Notifications, i18n, profile, observability |
| 6 — Consolidation | 2-3 weeks | Performance, security, accessibility, docs, stress test |

Each phase produces independent value. If the project stops at Phase 2,
you still have a working multi-tenant platform.

## What We Keep from v1 (Ideas, Not Code)

- Schema-per-tenant with `SET search_path` + AsyncLocalStorage
- Keycloak multi-realm auth flow
- ABAC tree-walk engine logic
- Kafka event bus patterns
- Security patterns (rate limiting, Zod validation, CSRF, CSP)
- Prisma schema core entities (tenant, workspace, user)
- Docker Compose infrastructure (adapted for single-node Redpanda)
- i18n package architecture

## What We Eliminate from v1

- `isTestToken` and `test-app.ts` (zero test-production divergence)
- 2 auth stores, 3 fetch patterns, 3 form patterns (one pattern per type)
- SDK 6 classes → 1 class
- 7 plugin lifecycle states → 3
- 5 extension tables → manifest + 1 visibility table
- Service Registry, container orchestration (YAGNI)
- Font JetBrains Mono, emoji icons, `window.confirm()`, `console.log`
- Heavy governance (33 ADRs, 19 specs, dual-model review, 9-article constitution)

## Success Criteria

1. Every feature has a passing E2E test (Playwright, real stack)
2. A real CRM plugin works end-to-end (UI + backend + events + data)
3. A new developer can create a working plugin in half a day
4. UX is professional (design system, dark mode, responsive, accessible)
5. API P95 < 200ms, page load < 2s on 3G
6. Zero cross-tenant data leakage
7. ≥80% test coverage with meaningful tests (not mock assertions)

## Governance

Five rules, not nine articles:

1. Every feature has an E2E test — no exception, CI blocking
2. No merge without green CI — unit, integration, and E2E must pass
3. One pattern per operation type — one way to fetch data, one way to build forms, one auth store
4. No file above 200 lines — decompose if needed
5. Significant architectural decisions get an ADR

Kanban board (Todo → In Progress → Done), human code review, lightweight specs.

---

*This brief is derived from five design documents in `docs/` (01-SPECIFICHE, 02-ARCHITETTURA,
03-PROGETTO, 04-COMPARAZIONE-TECNOLOGICA, 05-VALUTAZIONE-BETTER-AUTH) written
in Italian, which contain the full analysis, requirements, and technical details.*
