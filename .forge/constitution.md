# Plexica v2 — Project Constitution

> Non-negotiable principles, technology constraints, and quality standards.
> All code, decisions, and reviews must comply with this document.

**Version**: 1.0
**Date**: March 2026
**Status**: Active

---

## The 6 Rules

These are absolute. No exceptions, no workarounds.

1. **Every feature has an E2E test.** Playwright tests run in CI and block merge. If a user can interact with it, there is an E2E test for it.

2. **No merge without green CI.** Unit, integration, and E2E suites must all pass. No skip flags, no "will fix later."

3. **One pattern per operation type.** One way to fetch data (TanStack Query). One way to build forms (react-hook-form + Zod). One auth store (Zustand). No competing patterns.

4. **No file above 200 lines.** If a file exceeds 200 lines, decompose it. Services, components, utilities — all subject to this limit.

5. **Significant architectural decisions have an ADR.** Data model changes, auth changes, infrastructure changes, new core dependencies — document the decision before implementing.

6. **All commit messages must be written in English.** Every part of a commit — type, scope, subject line, body, and footer — must be in English. No exceptions for any contributor, agent, or automated tool. A commit written in any other language must be rejected and rewritten before merge.

---

## Technology Stack

### Backend

| Layer           | Technology        | Version   |
| --------------- | ----------------- | --------- |
| Runtime         | Node.js           | >= 20     |
| Language        | TypeScript        | ^5.9      |
| Framework       | Fastify           | ^5        |
| Database        | PostgreSQL        | 15+       |
| ORM             | Prisma            | ^6        |
| Cache           | Redis (ioredis)   | ^5        |
| Object Storage  | MinIO             | ^8        |
| Event Bus       | Kafka / Redpanda  | KafkaJS ^2|
| Auth            | Keycloak          | 26+       |

### Frontend

| Layer           | Technology                  | Version   |
| --------------- | --------------------------- | --------- |
| UI Framework    | React                       | ^19       |
| Build           | Vite                        | latest    |
| Micro-frontends | Module Federation           | —         |
| Routing         | TanStack Router             | latest    |
| Data Fetching   | TanStack Query              | latest    |
| State           | Zustand                     | latest    |
| Styling         | Tailwind CSS                | latest    |
| Forms           | react-hook-form + Zod       | latest    |
| i18n            | react-intl                  | latest    |
| Primitives      | Radix UI                    | latest    |

### Tooling

| Purpose         | Tool              | Version   |
| --------------- | ----------------- | --------- |
| Package Manager | pnpm              | >= 8      |
| Monorepo        | pnpm workspaces   | —         |
| E2E Testing     | Playwright        | latest    |
| Unit/Int Testing| Vitest            | ^4        |
| CI/CD           | GitHub Actions    | —         |

New dependencies require an ADR.

---

## Architecture

**Backend**: Fastify monolith. Not microservices. One deployable, feature modules inside.

**Multi-tenancy**: Schema-per-tenant PostgreSQL. Each tenant gets its own schema (`tenant_<slug>`). Core shared tables live in a `core` schema. This is the GDPR isolation boundary.

**Authentication**: Keycloak multi-realm. One realm per tenant. All endpoints require authentication unless explicitly marked `public`.

**Authorization**: ABAC tree-walk for workspace-level permissions within a tenant.

**Plugins**: Module Federation for plugin UI, simplified with a CLI and Vite preset. Plugin data tables live inside the tenant schema (e.g., `tenant_acme.crm_contacts`). Plugins bring their own Prisma migrations; the core platform executes them. Plugin backends can be TypeScript, Rust, or Python — communication via HTTP contract.

**Events**: Kafka/Redpanda event bus. Plugins subscribe to domain events. Core publishes; plugins consume.

---

## Quality Standards

### Testing

- **Coverage**: >= 80% line coverage overall
- **E2E**: Every user-facing feature has Playwright tests. CI blocks merge on failure.
- **Unit/Integration**: Vitest. Services, utilities, and API routes covered.

### Performance

- P95 API response time: < 200ms
- Page load: < 2s on 3G

### Accessibility

- WCAG 2.1 AA compliance on all user interfaces

### File Size

- No file exceeds 200 lines. Enforced in CI via lint rule.

### Code Review

- Human review required on all PRs. One approval minimum.

---

## Security

These are non-negotiable. Violations block release.

1. **Tenant isolation**: Schema-per-tenant at database level. Cross-tenant data leakage is a critical security incident.
2. **Authentication**: Keycloak on every endpoint. Public endpoints are explicitly opted in and documented.
3. **SQL injection prevention**: Parameterized queries only. No string interpolation in SQL. Ever.
4. **Input validation**: Zod schemas on all external input.
5. **Secrets**: Never committed to git. Environment variables only.
6. **PII**: Never in logs, error messages, or client-side error responses.

---

## Governance

- **Workflow**: Kanban — Todo, In Progress, Done.
- **Specs**: Lightweight feature specs before implementation. Not the 19-spec heavy process from v1.
- **ADRs**: Only for significant decisions — data model, auth, infrastructure, core dependencies.
- **Phases**: 7 sprint-based phases, 20-28 weeks total.
- **Reviews**: Human code review on all PRs.

---

## Amendments

Changes to this constitution are recorded below. Do not edit articles directly — add an amendment entry, then update the article text.

| Date | Article | Change | Rationale |
| ---- | ------- | ------ | --------- |
| March 2026 | All | Initial constitution | Project kickoff |
| March 2026 | The Rules | Added Rule 6: commit messages must be in English | Enforces a single language for all git history, making it unambiguous for all contributors, agents, and automated tools. Non-English commits must be rejected and rewritten before merge. |
