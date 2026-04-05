# ADR-012: Rate Limiting via @fastify/rate-limit

> Architectural Decision Record documenting the adoption of `@fastify/rate-limit`
> as the standard rate-limiting solution for `services/core-api`.

| Field    | Value                                               |
| -------- | --------------------------------------------------- |
| Status   | Accepted                                            |
| Author   | forge-orchestrator                                  |
| Date     | 2026-04-05                                          |
| Deciders | Platform team                                       |
| Spec     | 002 (Multi-Tenancy), TD-002                         |
| Related  | ADR-002 (Keycloak Multi-Realm), decision-log TD-002 |

---

## Context

`services/core-api` exposes two categories of authenticated endpoints that
currently have no rate limiting:

1. **`POST /api/admin/tenants`** — super-admin endpoint that provisions a new
   tenant (Keycloak realm, PostgreSQL schema, database migration). Plan §3.3
   specifies 5 req/min. Documented as **TD-002** in the decision log since Spec
   002 implementation.

2. **Tenant-scoped user routes** — registered under the `tenantScope` in
   `src/index.ts`, protected by `authMiddleware` + `tenantContextMiddleware`.
   No per-user or per-tenant limit is currently enforced.

Both gaps were flagged as **CodeQL code-scanning alerts #3 and #4**
(`js/missing-rate-limiting`, severity: warning / security_severity: high).

A rate-limiting solution is a **new core dependency** and therefore requires an
ADR per the project constitution (Rule 5).

---

## Decision

Adopt **`@fastify/rate-limit`** (the official Fastify rate-limit plugin) as the
sole rate-limiting mechanism for `services/core-api`.

- **No competing solution** will be introduced (Constitution Rule 3: one pattern
  per operation type).
- Rate-limit state is stored in **Redis** (`REDIS_URL`) — already a declared
  infrastructure dependency. This ensures limits are enforced correctly across
  multiple Node.js processes (horizontal scaling) and survive process restarts.
- `@fastify/rate-limit` supports per-route overrides, which allows the strict
  5 req/min admin limit and a more generous user-routes limit to coexist.

---

## Alternatives Considered

### A. `express-rate-limit` + adapter

Rejected. Designed for Express; requires an adapter shim for Fastify. Introduces
unnecessary complexity and a non-idiomatic integration path.

### B. Custom Redis Lua script middleware

Rejected. Significant implementation and maintenance burden. `@fastify/rate-limit`
with Redis backend is functionally equivalent and battle-tested.

### C. External gateway rate limiting (nginx / AWS API Gateway)

Deferred to post-v1.0 as an infrastructure-layer complement, not a replacement.
Application-level rate limiting is still needed to protect against misconfigured
or absent gateway layers. This option is not mutually exclusive with the chosen
approach.

### D. No rate limiting until public launch

Rejected based on CodeQL security findings. Even with authenticated endpoints,
a compromised super-admin token could trigger resource exhaustion on the tenant
provisioning path. The risk is low but the fix is trivial.

---

## Consequences

### Positive

- Closes CodeQL alerts #3 and #4 (`js/missing-rate-limiting`).
- Eliminates TD-002 from the technical debt register.
- Plan §3.3 spec requirement (5 req/min on admin endpoint) is satisfied.
- Redis-backed state is horizontally scalable.
- `@fastify/rate-limit` is the official Fastify ecosystem solution — no shims,
  good TypeScript support, lifecycle hooks for testing.

### Negative / Trade-offs

- Adds one new `devDependency`-level runtime dependency to `services/core-api`.
- Rate-limit errors (HTTP 429) must be handled gracefully by the frontend.
- Redis availability becomes a soft dependency for rate limiting. If Redis is
  unavailable, `@fastify/rate-limit` can be configured to fail open (allow
  traffic) or fail closed (reject traffic) — **fail open** is the default and
  the correct choice for this service.

---

## Implementation Plan

### 1. Install dependency

```bash
pnpm --filter services/core-api add @fastify/rate-limit
```

### 2. Register global plugin with Redis store

In `services/core-api/src/index.ts`, register once before route plugins:

```typescript
import rateLimit from '@fastify/rate-limit';
import { createClient } from 'ioredis'; // already a declared dependency

await server.register(rateLimit, {
  global: true,
  max: 100, // default: 100 req per 1 min per IP
  timeWindow: '1 minute',
  redis: redisClient, // shared ioredis instance from lib/redis.ts
  keyGenerator: (request) => request.user?.sub ?? request.ip, // per-user limit when authenticated
  errorResponseBuilder: (_request, context) => ({
    code: 'RATE_LIMIT_EXCEEDED',
    message: `Rate limit exceeded. Retry after ${context.after}.`,
    retryAfter: context.after,
  }),
});
```

### 3. Override limit for admin endpoint

In `tenant-routes.ts`, annotate the admin route with a stricter limit:

```typescript
adminScope.post(
  '/api/admin/tenants',
  {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
      },
    },
  },
  async (request, reply) => {
    // ... existing handler
  }
);
```

### 4. Update tests

- Vitest integration tests: use `server.inject()` — rate limit headers will be
  present in responses. Tests should assert `x-ratelimit-remaining` > 0 for
  normal flows.
- Vitest integration test for 429: send 6 consecutive `POST /api/admin/tenants`
  and assert the 6th returns HTTP 429 with `RATE_LIMIT_EXCEEDED`.

### 5. Remove TD-002 from decision log

After implementation is merged, remove the TD-002 entry from
`.forge/knowledge/decision-log.md`.

---

## Rate Limit Configuration Table

| Scope          | Endpoint                              | Max | Window | Key        |
| -------------- | ------------------------------------- | --- | ------ | ---------- |
| Global default | All authenticated endpoints           | 100 | 1 min  | user sub   |
| Admin override | `POST /api/admin/tenants`             | 5   | 1 min  | user sub   |
| Admin override | `POST /api/admin/tenants/migrate-all` | 2   | 5 min  | user sub   |
| Public         | `GET /api/tenants/resolve`            | 30  | 1 min  | IP address |

> The `GET /api/tenants/resolve` public endpoint is currently unlimited and
> also benefits from a rate limit to prevent tenant enumeration at scale.
> This is not flagged by CodeQL (it has no auth middleware) but should be
> included in the same implementation task.
