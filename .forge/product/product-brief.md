# Product Brief: Plexica Platform

> Product overview, vision, and current state of the Plexica multi-tenant SaaS platform.

**Version**: 1.0  
**Last Updated**: February 13, 2026  
**Status**: Active  
**Owner**: Product Team  
**FORGE Track**: Product

---

## 1. Product Vision

Plexica is a cloud-native platform that serves as a foundation for developing enterprise applications through a modular plugin system. The platform natively manages multi-tenancy, granular permissions (RBAC/ABAC), and offers a scalable architecture deployable on both Kubernetes and Docker Compose.

## 2. Problem Statement

Organizations building multi-tenant SaaS applications face recurring challenges:

- **Tenant isolation complexity**: Implementing secure data isolation at the database, storage, and authentication layers is error-prone and time-consuming.
- **Plugin extensibility**: Adding modular, independently deployable features requires significant architectural investment.
- **Permission granularity**: Enterprise customers need flexible authorization (RBAC + ABAC) that goes beyond simple role checks.
- **Deployment flexibility**: Supporting both container orchestration (Kubernetes) and simpler deployments (Docker Compose) without duplicating infrastructure code.

Plexica solves these by providing a battle-tested foundation with multi-tenancy, plugin architecture, and granular permissions built in from day one.

## 3. Main Objectives

- Provide a solid foundation for multi-tenant SaaS applications
- Enable rapid feature development through modular plugins
- Ensure complete data isolation and security between tenants
- Support flexible deployment (Kubernetes and Docker Compose)
- Scale from hundreds to hundreds of thousands of users

## 4. Target Users

| Persona               | Description                                            | Primary Goal                                          |
| --------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| **Platform Operator** | Deploys and manages the Plexica platform (Super Admin) | Manage tenants, plugins, and platform health          |
| **Tenant Admin**      | Administers a single tenant organization               | Manage users, teams, roles, plugins, and settings     |
| **End User**          | Uses plugins within a tenant workspace                 | Access workspace features via installed plugins       |
| **Plugin Developer**  | Builds plugins using the Plexica SDK                   | Develop, test, and publish plugins to the marketplace |

## 5. Technology Stack

| Component          | Technology         | Version |
| ------------------ | ------------------ | ------- |
| Runtime            | Node.js            | ≥20.0.0 |
| Language           | TypeScript         | ^5.9    |
| Package Manager    | pnpm               | ≥8.0    |
| Backend Framework  | Fastify            | ^5.7    |
| Frontend Framework | React              | ^19.2   |
| Frontend Routing   | TanStack Router    | Latest  |
| Frontend Build     | Vite               | Latest  |
| Database           | PostgreSQL         | 15+     |
| ORM                | Prisma             | ^6.8    |
| Auth Provider      | Keycloak           | 26+     |
| Cache              | Redis / ioredis    | ^5.9    |
| Object Storage     | MinIO              | ^8.0    |
| Event Bus          | KafkaJS (Redpanda) | ^2.2    |
| Testing            | Vitest             | ^4.0    |
| E2E Testing        | Playwright         | Latest  |
| CI/CD              | GitHub Actions     | N/A     |

## 6. Current State (as of February 2026)

### 6.1 Version

**v0.9.0 (Alpha)**

### 6.2 Phase Status

| Phase                         | Status        | Completion |
| ----------------------------- | ------------- | ---------- |
| Phase 1 — MVP Core            | Near Complete | 97.5%      |
| Phase 2 — Plugin Ecosystem    | In Progress   | 67%        |
| Phase 3 — Advanced Features   | Not Started   | 0%         |
| Phase 4 — Enterprise          | Not Started   | 0%         |
| Phase 5 — Ecosystem Expansion | Future        | 0%         |

### 6.3 Key Metrics

| Metric                    | Value                                       |
| ------------------------- | ------------------------------------------- |
| TypeScript source files   | 1,435                                       |
| Total tests               | 1,855+                                      |
| Test coverage             | 63% (target: 80%)                           |
| Backend tests             | ~870                                        |
| Frontend E2E tests        | 169                                         |
| Frontend component tests  | 495                                         |
| Production code delivered | ~8,000 lines (Frontend Consolidation alone) |

### 6.4 Completed Milestones

| Milestone              | Description                                      | Completed       |
| ---------------------- | ------------------------------------------------ | --------------- |
| M1.1                   | Foundation (monorepo, infra, CI/CD)              | Jan 13, 2026    |
| M1.2                   | Multi-Tenancy Core (schema-per-tenant)           | Jan 13, 2026    |
| M1.3                   | Authentication & Authorization (Keycloak + RBAC) | Jan 13, 2026    |
| M1.4                   | Plugin System Base (SDK, registry, lifecycle)    | Jan 13, 2026    |
| M2.1                   | Frontend Tenant App (web app)                    | Jan 13-14, 2026 |
| M2.2                   | Super Admin Frontend                             | Jan 14, 2026    |
| M2.4                   | Workspaces                                       | Jan 15, 2026    |
| Frontend Consolidation | SDK, Design System, API Client, E2E              | Feb 11, 2026    |
| M2.1 (P2)              | Event System (Redpanda)                          | Jan 23, 2026    |
| M2.2 (P2)              | Module Federation                                | Jan 22, 2026    |
| M2.3 (P2)              | Plugin-to-Plugin Communication                   | Jan 23, 2026    |

### 6.5 In Progress

- **M2.3 (P1)**: Testing & Deployment (50% complete — test coverage at 63%, production infra ready)
- **M2.4 (P2)**: Plugin Registry & Marketplace (20% complete)

## 7. Core Features

### 7.1 Multi-Tenancy

- Schema-per-tenant isolation on PostgreSQL
- Separate Keycloak realms per tenant
- Separate storage buckets per tenant (MinIO)
- Redis key prefixing per tenant
- Tenant lifecycle: PROVISIONING → ACTIVE → SUSPENDED → PENDING_DELETION → DELETED

### 7.2 Authentication & Authorization

- Keycloak integration for identity management
- JWT validation with tenant context extraction
- RBAC with predefined roles (super_admin, tenant_admin, team_admin, user)
- ABAC policy engine (Phase 3) for attribute-based access control
- Plugin-contributed permissions

### 7.3 Workspaces

- Hierarchical organization: Tenant → Workspace → Team → User
- Workspace roles: ADMIN, MEMBER, VIEWER
- Cross-workspace resource sharing
- Workspace-scoped teams and resources

### 7.4 Plugin System

- Plugin SDK (`@plexica/sdk`) with lifecycle hooks
- Plugin manifest schema for capability declaration
- Plugin lifecycle: REGISTERED → INSTALLING → INSTALLED → ACTIVE ↔ DISABLED → UNINSTALLED
- Event-driven communication via Redpanda
- REST API inter-plugin calls via service registry
- Shared data service for cross-plugin state
- Module Federation for frontend plugin loading

### 7.5 Frontend

- React + Vite web application with TanStack Router
- Super Admin panel (separate app)
- Design system: `@plexica/ui` with 31+ components
- TailwindCSS v4 semantic tokens for per-tenant theming
- Module Federation for dynamic plugin UI loading
- API client: `@plexica/api-client` with tenant context

### 7.6 Core Services

- Storage Service (MinIO, per-tenant buckets)
- Notification Service (email, push, in-app) — Phase 3
- Job Queue Service — Phase 3
- Search Service — Phase 3

## 8. Glossary

| Term      | Definition                                             |
| --------- | ------------------------------------------------------ |
| Tenant    | Isolated customer organization in the platform         |
| Plugin    | Extensible module that adds functionality              |
| Realm     | Isolated Keycloak instance for a tenant                |
| Workspace | Logical organizational unit within a tenant            |
| Team      | Collaboration group within a workspace                 |
| Policy    | ABAC rule for attribute-based access control           |
| Manifest  | Plugin configuration/capability declaration file       |
| Web App   | Main frontend tenant application                       |
| Remote    | Dynamically loaded frontend module (Module Federation) |
| SDK       | Software Development Kit for plugin development        |

---

## Cross-References

| Document                  | Path                                    |
| ------------------------- | --------------------------------------- |
| Constitution              | `.forge/constitution.md`                |
| Brownfield Analysis       | `.forge/product/brownfield-analysis.md` |
| Roadmap                   | `.forge/product/roadmap.md`             |
| ADR Index                 | `.forge/knowledge/adr/README.md`        |
| Decision Log              | `.forge/knowledge/decision-log.md`      |
| Functional Specs (source) | `specs/FUNCTIONAL_SPECIFICATIONS.md`    |
| Technical Specs (source)  | `specs/TECHNICAL_SPECIFICATIONS.md`     |
| Project Status (source)   | `planning/PROJECT_STATUS.md`            |

---

_Derived from `specs/FUNCTIONAL_SPECIFICATIONS.md` Section 1, `planning/PROJECT_STATUS.md`, and `planning/ROADMAP.md`._
