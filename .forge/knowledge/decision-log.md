# Decision Log — Plexica v2

> This is the decision log for the Plexica v2 rewrite. It tracks architectural
> decisions, technical debt, deferred decisions, and open questions.
>
> For lessons learned from the v1 codebase, see
> [lessons-learned.md](./lessons-learned.md).

**Last Updated**: April 2026

---

## Active Decisions

All foundational ADRs were accepted during the v2 bootstrap phase:

| ADR     | Title                                    | Status   | Date       |
| ------- | ---------------------------------------- | -------- | ---------- |
| ADR-001 | Monorepo with pnpm Workspaces            | Accepted | March 2026 |
| ADR-002 | Schema-per-Tenant with Shared Core       | Accepted | March 2026 |
| ADR-003 | Fastify with Modular Plugin Architecture | Accepted | March 2026 |
| ADR-004 | Redpanda for Event Bus                   | Accepted | March 2026 |
| ADR-005 | Keycloak for Identity and Access         | Accepted | March 2026 |
| ADR-006 | React + Vite + TanStack Router Frontend  | Accepted | March 2026 |
| ADR-007 | Prisma as ORM with Raw SQL Escape Hatch  | Accepted | March 2026 |
| ADR-008 | TypeScript-First with Rust Escape Hatch  | Accepted | March 2026 |
| ADR-009 | Plugin SDK and Lifecycle Model           | Accepted | March 2026 |

---

## Implementation Decisions (Spec 002)

| ID     | Decision                                                                      | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Spec | Date       |
| ------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------- |
| ID-001 | `$queryRawUnsafe` for `SET search_path` — controlled exception                | PostgreSQL does not support parameterized DDL/session statements; `SET search_path` cannot use `$queryRaw` with placeholders. The schema name is derived from the tenant slug, which is validated against `/^[a-z][a-z0-9-]{1,62}$/` before reaching this call. This regex enforces PostgreSQL identifier rules and blocks injection. This is a **documented, intentional exception** to Constitution Rule §Security-3 ("no string interpolation in SQL"). Any future change to this validation must be reviewed for security impact. | 002  | April 2026 |
| ID-002 | Generic `INVALID_TENANT_CONTEXT` error code for EC-01 and EC-02               | Using distinct error codes (`TENANT_REQUIRED` vs `UNKNOWN_TENANT`) allows an unauthenticated caller to enumerate valid tenant slugs via the error response. A single generic code prevents this. The public `GET /api/tenants/resolve` endpoint returns `{ exists: true/false }` with HTTP 200 for the same anti-enumeration reason.                                                                                                                                                                                                  | 002  | April 2026 |
| ID-004 | `requireSuperAdmin()` enforces master realm issuer check                      | Keycloak tokens can claim any role name. Without an issuer check, a tenant admin who creates a `super_admin` role in their own realm could call `POST /api/admin/tenants`. The fix enforces `request.user.realm === config.KEYCLOAK_MASTER_REALM`. Only tokens issued by the Keycloak master realm are accepted for admin endpoints.                                                                                                                                                                                                  | 002  | April 2026 |
| ID-005 | Short access token TTL (60s) as the logout token invalidation strategy (AC-3) | Backchannel logout revokes the refresh token immediately but cannot invalidate a stateless JWT. Three options were evaluated: (a) Redis blacklist — strongest but adds per-request latency; (b) token introspection — similar overhead; (c) short TTL — access token set to 60s, frontend refreshes silently every 55s. Option (c) was chosen: the post-logout exposure window is bounded to ≤60s with no added infrastructure.                                                                                                       | 002  | April 2026 |

---

## Technical Debt

| ID     | Description                                                                                                                                                                                                                                                                                                                                                                  | Impact                                                                                                                                                                                  | Severity | Target         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------- |
| TD-001 | `ErrorFallback` component has no error-reporting integration (Sentry or equivalent). Errors caught by React error boundaries are silently discarded — no stack trace is forwarded to an error tracking service. The `_error` prop is intentionally not displayed to users (avoids leaking implementation details) but must be forwarded to error tracking before production. | All frontend exceptions invisible in production; regression detection blind.                                                                                                            | Medium   | Pre-production |
| TD-002 | `POST /api/admin/tenants` has no rate limiting. Plan §3.3 specifies 5 req/min. `@fastify/rate-limit` is not installed — adding it requires an ADR as a new core dependency.                                                                                                                                                                                                  | An unauthenticated caller cannot reach this endpoint (auth required), but a compromised super-admin token could trigger resource exhaustion. Low urgency; enforce before public launch. | Low      | Pre-production |

---

## Deferred Decisions

| ID     | Decision                                       | Reason Deferred                                                                                                          | Revisit   |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| DD-001 | GraphQL API layer                              | Focus on REST first; evaluate after v1.0 when plugin API consumption patterns are clear.                                 | Post-v1.0 |
| DD-002 | Rust services for performance-critical paths   | Evaluate after the TypeScript core is stable and profiled. ADR-008 reserves the option for a hybrid TS/Rust approach.    | Post-v1.0 |
| DD-003 | Additional plugin SDK languages (Python, Rust) | TypeScript SDK is the primary target. Other languages deferred until the plugin ecosystem matures and demand is evident. | Post-v1.0 |

---

## Questions & Clarifications

_No open questions._

---

_This document is living. Update it as decisions are made or deferred.
For significant architectural decisions, create a full ADR in `adr/`._
