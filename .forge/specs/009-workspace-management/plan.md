# Plan: 009 - Workspace Management

> Technical implementation plan for closing the remaining 15% gaps in the
> Workspace Management system. This is a **BROWNFIELD** plan — 85% of the
> workspace system is already implemented. This plan covers only the 7 gap
> tasks (37 story points, 68–104 hours).
>
> Created by the `forge-architect` agent via `/forge-plan`.

| Field  | Value                                                   |
| ------ | ------------------------------------------------------- |
| Status | Draft                                                   |
| Author | forge-architect                                         |
| Date   | 2026-02-16                                              |
| Track  | Feature                                                 |
| Spec   | [Spec 009](spec.md) — Workspace Management (Brownfield) |

---

## 1. Overview

This plan addresses 7 implementation gaps identified in Spec 009 that prevent
full constitution compliance for the Workspace Management module:

| Task | Gap                     | Priority | Effort    | Spec Refs              |
| ---- | ----------------------- | -------- | --------- | ---------------------- |
| T1   | Event Publishing        | CRITICAL | 8–12 hrs  | FR-031, FR-032, FR-033 |
| T2   | Redis Caching           | HIGH     | 6–8 hrs   | FR-034, FR-035         |
| T6   | Error Format Migration  | HIGH     | 8–12 hrs  | Art. 6.2               |
| T7   | Rate Limiting           | HIGH     | 8–12 hrs  | Art. 9.2               |
| T4   | Workspace Settings      | MEDIUM   | 8–12 hrs  | FR-038, FR-039, FR-040 |
| T3   | Cross-Workspace Sharing | MEDIUM   | 24–40 hrs | FR-036, FR-037         |
| T5   | Test Coverage 65% → 85% | MEDIUM   | 12–16 hrs | NFR-004                |

**Approach**: No database schema changes are needed — all Prisma models
(Workspace, WorkspaceMember, WorkspaceResource, Team) are deployed. Work is
purely service-level, infrastructure integration, error standardization, and
test expansion.

**Key architectural decisions**:

- Event publishing uses `EventBusService` from `@plexica/event-bus` (ADR-005)
- Caching uses existing ioredis singleton from `apps/core-api/src/lib/redis.ts`
- Error format follows Constitution Art. 6.2 with a reusable formatter utility
- Rate limiting uses Redis sliding-window counters (Fastify `onRequest` hook)
- All work stays within the existing modular monolith pattern (ADR-001)

---

## 2. Data Model

### 2.1 New Tables

**None.** All required database tables are deployed and operational.

### 2.2 Existing Tables (Reference)

The following tables are already in production. No modifications are needed.

#### workspaces

| Column      | Type         | Constraints             | Notes                        |
| ----------- | ------------ | ----------------------- | ---------------------------- |
| id          | UUID         | PK                      | Auto-generated               |
| tenant_id   | UUID         | FK (logical)            | Schema-per-tenant isolation  |
| slug        | VARCHAR      | UNIQUE(tenant_id, slug) | 2–50 chars, `/^[a-z0-9-]+$/` |
| name        | VARCHAR      | NOT NULL                | 2–100 chars                  |
| description | TEXT         | NULLABLE                | Max 500 chars (Zod-enforced) |
| settings    | JSONB        | DEFAULT `{}`            | Typed via Zod schema (Gap 4) |
| created_at  | TIMESTAMP(3) | DEFAULT NOW()           | Immutable                    |
| updated_at  | TIMESTAMP(3) | DEFAULT NOW()           | Prisma @updatedAt            |

#### workspace_members

| Column       | Type         | Constraints                    | Notes                 |
| ------------ | ------------ | ------------------------------ | --------------------- |
| workspace_id | UUID         | PK (composite), FK → Workspace | ON DELETE CASCADE     |
| user_id      | UUID         | PK (composite), FK → User      | ON DELETE CASCADE     |
| role         | ENUM         | WorkspaceRole                  | ADMIN, MEMBER, VIEWER |
| invited_by   | UUID         | FK → User                      | Who added this member |
| joined_at    | TIMESTAMP(3) | DEFAULT NOW()                  | Immutable             |

#### workspace_resources

| Column        | Type         | Constraints                                      | Notes                    |
| ------------- | ------------ | ------------------------------------------------ | ------------------------ |
| id            | UUID         | PK                                               | Auto-generated           |
| workspace_id  | UUID         | FK → Workspace, ON DELETE CASCADE                | Owning workspace         |
| resource_type | VARCHAR      | UNIQUE(workspace_id, resource_type, resource_id) | e.g., 'plugin'           |
| resource_id   | UUID/VARCHAR | Part of unique constraint                        | ID of shared resource    |
| created_at    | TIMESTAMP(3) | DEFAULT NOW()                                    | When sharing was created |

### 2.3 Indexes

All indexes are deployed. No new indexes required.

| Table               | Index Name                       | Columns                                  | Type    |
| ------------------- | -------------------------------- | ---------------------------------------- | ------- |
| workspaces          | workspaces_pkey                  | id                                       | PRIMARY |
| workspaces          | workspaces_tenant_slug           | tenant_id, slug                          | UNIQUE  |
| workspaces          | idx_workspaces_tenant            | tenant_id                                | B-TREE  |
| workspace_members   | workspace_members_pkey           | workspace_id, user_id                    | PRIMARY |
| workspace_members   | idx_workspace_members_user       | user_id                                  | B-TREE  |
| workspace_members   | idx_workspace_members_ws         | workspace_id                             | B-TREE  |
| workspace_resources | workspace_resources_pkey         | id                                       | PRIMARY |
| workspace_resources | workspace_resources_unique       | workspace_id, resource_type, resource_id | UNIQUE  |
| workspace_resources | idx_workspace_resources_ws       | workspace_id                             | B-TREE  |
| workspace_resources | idx_workspace_resources_resource | resource_type, resource_id               | B-TREE  |

### 2.4 Migrations

**No new migrations required.** All models are deployed.

---

## 3. API Endpoints

### 3.1 Existing Endpoints (12 — Error Format + Rate Limiting)

All 12 existing endpoints receive two cross-cutting changes:

1. **Error format migration** (Task 6): Responses change from
   `{ error: "...", message: "..." }` to `{ error: { code, message, details? } }`
   per Constitution Art. 6.2.
2. **Rate limiting** (Task 7): Redis-based sliding-window rate limiter applied
   to all endpoints via Fastify `onRequest` hook.

**Rate Limit Tiers:**

| Tier               | Scope         | Limit | Window   | Endpoints                                 |
| ------------------ | ------------- | ----- | -------- | ----------------------------------------- |
| Workspace Creation | Per tenant    | 10    | 1 minute | POST /workspaces                          |
| Workspace Reads    | Per user      | 100   | 1 minute | GET /workspaces, GET /:id, GET /:id/teams |
| Member Management  | Per workspace | 50    | 1 minute | POST/PATCH/DELETE /:id/members/\*         |
| Resource Sharing   | Per workspace | 20    | 1 minute | POST/GET/DELETE /:id/resources/\*         |

**Error Codes (10 defined in Spec Section 6.5):**

| Code                       | HTTP | Description                                 |
| -------------------------- | ---- | ------------------------------------------- |
| `WORKSPACE_NOT_FOUND`      | 404  | Workspace does not exist in tenant          |
| `WORKSPACE_SLUG_CONFLICT`  | 409  | Slug already exists in tenant               |
| `WORKSPACE_HAS_TEAMS`      | 400  | Cannot delete workspace with existing teams |
| `MEMBER_NOT_FOUND`         | 404  | Membership does not exist                   |
| `MEMBER_ALREADY_EXISTS`    | 409  | User is already a member                    |
| `LAST_ADMIN_VIOLATION`     | 400  | Cannot remove/demote the last ADMIN         |
| `INSUFFICIENT_PERMISSIONS` | 403  | User lacks required workspace role          |
| `VALIDATION_ERROR`         | 400  | Request body validation failed              |
| `RESOURCE_ALREADY_SHARED`  | 409  | Resource already linked to workspace        |
| `SHARING_DISABLED`         | 403  | Cross-workspace sharing disabled            |

---

### 3.2 POST /api/workspaces/:workspaceId/resources/share (NEW — Task 3)

- **Description**: Share a resource (plugin) with this workspace
- **Auth**: Required — ADMIN role
- **Rate Limit**: 20/min per workspace
- **Request**:
  ```json
  {
    "resourceType": "plugin",
    "resourceId": "990e8400-e29b-41d4-a716-446655440000"
  }
  ```
- **Response (201)**:
  ```json
  {
    "id": "aaa-bbb-ccc",
    "workspaceId": "550e8400-...",
    "resourceType": "plugin",
    "resourceId": "990e8400-...",
    "createdAt": "2026-02-16T10:00:00.000Z"
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ------------------------- | ------------------------------------------- |
  | 400 | `VALIDATION_ERROR` | Invalid resourceType or resourceId format |
  | 403 | `SHARING_DISABLED` | `allowCrossWorkspaceSharing` is false |
  | 403 | `INSUFFICIENT_PERMISSIONS`| User is not workspace ADMIN |
  | 409 | `RESOURCE_ALREADY_SHARED` | Resource already shared with this workspace |

---

### 3.3 GET /api/workspaces/:workspaceId/resources (NEW — Task 3)

- **Description**: List resources shared with this workspace
- **Auth**: Required — any workspace member
- **Rate Limit**: 100/min per user (reads tier)
- **Query Parameters**:
  | Parameter | Type | Default | Constraints |
  | ------------ | ------- | ------- | --------------------- |
  | resourceType | string | — | Filter by type |
  | limit | integer | 50 | 1–100 |
  | offset | integer | 0 | ≥ 0 |
- **Response (200)**:
  ```json
  [
    {
      "id": "aaa-bbb-ccc",
      "workspaceId": "550e8400-...",
      "resourceType": "plugin",
      "resourceId": "990e8400-...",
      "createdAt": "2026-02-16T10:00:00.000Z"
    }
  ]
  ```

---

### 3.4 DELETE /api/workspaces/:workspaceId/resources/:resourceId (NEW — Task 3)

- **Description**: Remove a shared resource link from this workspace
- **Auth**: Required — ADMIN role
- **Rate Limit**: 20/min per workspace
- **Response (204)**: Empty body
- **Error Responses**:
  | Status | Code | When |
  | ------ | -------------------------- | ----------------------------------- |
  | 403 | `INSUFFICIENT_PERMISSIONS` | User is not workspace ADMIN |
  | 404 | `WORKSPACE_NOT_FOUND` | Resource link not found |

---

### 3.5 PATCH /api/workspaces/:workspaceId (ENHANCED — Task 4)

The existing `PATCH /api/workspaces/:workspaceId` endpoint already accepts a
`settings` JSON field. Task 4 enhances this with **Zod validation** of the
settings object using the `WorkspaceSettingsSchema` (Spec Appendix D).

- **Enhanced Request Body**:
  ```json
  {
    "settings": {
      "defaultTeamRole": "MEMBER",
      "allowCrossWorkspaceSharing": true,
      "maxMembers": 100,
      "isDiscoverable": true,
      "metadata": {
        "department": "engineering",
        "costCenter": 42
      }
    }
  }
  ```
- **Validation**: Settings field validated against `WorkspaceSettingsSchema`
  before persistence. Invalid settings return `VALIDATION_ERROR` with
  per-field error details.

---

## 4. Component Design

### 4.1 WorkspaceService (MODIFY)

- **Purpose**: Core workspace business logic — enhanced with event publishing,
  Redis caching, and structured logging
- **Location**: `apps/core-api/src/modules/workspace/workspace.service.ts`
- **Modifications**:
  - Constructor: add `EventBusService`, `Redis` (ioredis), `Logger` (Pino) as
    optional dependencies (backward-compatible)
  - 7 methods gain event publishing (try-catch non-blocking)
  - 3 methods gain cache-first membership queries
  - 3 methods gain cache invalidation on membership changes
- **Dependencies**:
  - `EventBusService` from `@plexica/event-bus`
  - `Redis` from `apps/core-api/src/lib/redis.ts`
  - `Logger` from `apps/core-api/src/lib/logger.ts`
- **Constructor Signature** (updated):
  ```typescript
  constructor(
    eventBus?: EventBusService,
    cache?: Redis,
    customLogger?: Logger
  ) {
    this.db = db;
    this.eventBus = eventBus || null;
    this.cache = cache || null;
    this.logger = customLogger || logger;
  }
  ```
- **Key Method Changes**:
  | Method | Change | Task |
  | ------------------------ | --------------------------------------------------------- | ---- |
  | `create()` | Add event publish after successful transaction | T1 |
  | `update()` | Add event publish after successful update | T1 |
  | `delete()` | Add event publish after successful deletion | T1 |
  | `addMember()` | Add event publish + cache invalidation | T1,T2|
  | `updateMemberRole()` | Add event publish + cache invalidation | T1,T2|
  | `removeMember()` | Add event publish + cache invalidation | T1,T2|
  | `createTeam()` | Add event publish | T1 |
  | `getMembership()` | Add cache-first pattern (GET → DB fallback → SET) | T2 |
  | `checkAccessAndGetMembership()` | Add cache-first pattern | T2 |
  | `addMember()` | Add maxMembers enforcement from workspace settings | T4 |

**Event Publishing Pattern** (non-blocking):

```typescript
private async publishEvent(
  eventType: string,
  aggregateId: string,
  tenantId: string,
  userId: string,
  data: Record<string, unknown>
): Promise<void> {
  if (!this.eventBus) return;
  try {
    await this.eventBus.publish(
      eventType,
      data,
      {
        tenantId,
        workspaceId: aggregateId,
        userId,
        source: 'core',
      }
    );
  } catch (error) {
    this.logger.warn(
      { eventType, aggregateId, tenantId, error },
      `Failed to publish ${eventType} event`
    );
  }
}
```

**Cache Pattern** (cache-first with fallback):

```typescript
private async getCachedMembership(
  workspaceId: string,
  userId: string,
  tenantId: string
): Promise<MembershipRow | null> {
  if (!this.cache) return null;
  const key = `tenant:${tenantId}:workspace:${workspaceId}:member:${userId}`;
  const cached = await this.cache.get(key);
  if (cached) return JSON.parse(cached);
  return null;
}

private async setCachedMembership(
  workspaceId: string,
  userId: string,
  tenantId: string,
  membership: MembershipRow
): Promise<void> {
  if (!this.cache) return;
  const key = `tenant:${tenantId}:workspace:${workspaceId}:member:${userId}`;
  await this.cache.set(key, JSON.stringify(membership), 'EX', 300);
}

private async invalidateMembershipCache(
  workspaceId: string,
  userId: string,
  tenantId: string
): Promise<void> {
  if (!this.cache) return;
  const key = `tenant:${tenantId}:workspace:${workspaceId}:member:${userId}`;
  await this.cache.del(key);
}
```

---

### 4.2 WorkspaceResourceService (CREATE — Task 3)

- **Purpose**: Cross-workspace resource sharing business logic
- **Location**: `apps/core-api/src/modules/workspace/workspace-resource.service.ts`
- **Responsibilities**:
  - Share a resource with a workspace (with settings policy enforcement)
  - List shared resources with pagination and type filtering
  - Remove a resource sharing link
  - Validate resource existence (for plugin type, verify TenantPlugin record)
- **Dependencies**:
  - `PrismaClient` from `apps/core-api/src/lib/db.ts`
  - `Logger` from `apps/core-api/src/lib/logger.ts`
  - `WorkspaceService` (to read workspace settings for sharing policy)
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | ------------------ | --------------------------------------------------------- | -------------------- | ----------------------------------------------- |
  | `shareResource()` | workspaceId, dto: ShareResourceDto, tenantCtx | WorkspaceResource | Create sharing link; enforce settings policy |
  | `listResources()` | workspaceId, options: { type?, limit, offset }, tenantCtx | WorkspaceResource[] | Paginated resource list with optional type filter|
  | `unshareResource()`| workspaceId, resourceId, tenantCtx | void | Remove sharing link |
  | `checkSharingPolicy()` | workspaceId, tenantCtx | boolean | Read settings.allowCrossWorkspaceSharing |

---

### 4.3 WorkspaceErrorFormatter (CREATE — Task 6)

- **Purpose**: Reusable error response formatter that transforms ad-hoc error
  strings into Constitution Art. 6.2 compliant responses
- **Location**: `apps/core-api/src/modules/workspace/utils/error-formatter.ts`
- **Responsibilities**:
  - Map workspace error conditions to standardized error codes
  - Format error responses as `{ error: { code, message, details? } }`
  - Provide a Fastify `errorHandler` function for workspace routes
- **Dependencies**: None (pure utility)
- **Key Exports**:
  | Export | Type | Description |
  | ------------------------ | -------- | ---------------------------------------------- |
  | `WorkspaceErrorCode` | Enum | 10 error codes from Spec Section 6.5 |
  | `workspaceError()` | Function | `(code, message, details?) → ErrorResponse` |
  | `mapServiceError()` | Function | Map service `throw new Error(...)` to code+HTTP|

**Implementation**:

```typescript
export enum WorkspaceErrorCode {
  WORKSPACE_NOT_FOUND = 'WORKSPACE_NOT_FOUND',
  WORKSPACE_SLUG_CONFLICT = 'WORKSPACE_SLUG_CONFLICT',
  WORKSPACE_HAS_TEAMS = 'WORKSPACE_HAS_TEAMS',
  MEMBER_NOT_FOUND = 'MEMBER_NOT_FOUND',
  MEMBER_ALREADY_EXISTS = 'MEMBER_ALREADY_EXISTS',
  LAST_ADMIN_VIOLATION = 'LAST_ADMIN_VIOLATION',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RESOURCE_ALREADY_SHARED = 'RESOURCE_ALREADY_SHARED',
  SHARING_DISABLED = 'SHARING_DISABLED',
}

export function workspaceError(
  code: WorkspaceErrorCode,
  message: string,
  details?: Record<string, unknown>
) {
  return {
    error: { code, message, ...(details ? { details } : {}) },
  };
}
```

---

### 4.4 RateLimiterMiddleware (CREATE — Task 7)

- **Purpose**: Redis-based sliding-window rate limiter for workspace endpoints
- **Location**: `apps/core-api/src/middleware/rate-limiter.ts`
- **Responsibilities**:
  - Implement sliding window counter using Redis INCR + EXPIRE
  - Support per-tenant, per-user, and per-workspace scopes
  - Return HTTP 429 with `Retry-After` header when exceeded
  - Graceful degradation: if Redis is unavailable, allow requests (fail-open)
- **Dependencies**:
  - `Redis` from `apps/core-api/src/lib/redis.ts`
  - `Logger` from `apps/core-api/src/lib/logger.ts`
- **Key Exports**:
  | Export | Type | Description |
  | ---------------- | -------- | -------------------------------------------------------- |
  | `rateLimiter()` | Function | Factory: `(config: RateLimitConfig) → FastifyHook` |
  | `RateLimitConfig`| Interface| `{ scope, limit, windowSeconds, keyExtractor? }` |

**Implementation Pattern**:

```typescript
export interface RateLimitConfig {
  /** Rate limit scope identifier */
  scope: string;
  /** Maximum requests in window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
  /** Extract the rate limit key from the request */
  keyExtractor: (request: FastifyRequest) => string;
}

export function rateLimiter(config: RateLimitConfig) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    const key = `ratelimit:${config.scope}:${config.keyExtractor(request)}`;
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, config.windowSeconds);
    }
    if (current > config.limit) {
      const ttl = await redis.ttl(key);
      reply.header('Retry-After', String(ttl));
      reply
        .code(429)
        .send(
          workspaceError(
            'RATE_LIMIT_EXCEEDED' as any,
            `Rate limit exceeded. Try again in ${ttl} seconds.`
          )
        );
      return;
    }
    reply.header('X-RateLimit-Limit', String(config.limit));
    reply.header('X-RateLimit-Remaining', String(config.limit - current));
  };
}
```

---

### 4.5 WorkspaceSettingsSchema (CREATE — Task 4)

- **Purpose**: Zod schema for typed workspace settings validation
- **Location**: `apps/core-api/src/modules/workspace/schemas/workspace-settings.schema.ts`
- **Responsibilities**:
  - Define the `WorkspaceSettingsSchema` per Spec Appendix D
  - Export `validateWorkspaceSettings()` helper
  - Enforce metadata constraints: max 50 keys, 64-char alphanumeric keys,
    scalar values only, ≤ 16KB total
- **Dependencies**: `zod`
- **Schema**: Exactly as defined in Spec Appendix D (reproduced in Spec
  Section 3.5 and Section 20)

---

### 4.6 ShareResourceDto (CREATE — Task 3)

- **Purpose**: Zod-validated DTO for resource sharing operations
- **Location**: `apps/core-api/src/modules/workspace/dto/share-resource.dto.ts`
- **Schema**:

  ```typescript
  export const ShareResourceSchema = z.object({
    resourceType: z.enum(['plugin']), // Only plugins initially (per Q4 resolution)
    resourceId: z.string().uuid('resourceId must be a valid UUID'),
  });

  export type ShareResourceDto = z.infer<typeof ShareResourceSchema>;
  ```

---

### 4.7 Workspace Event Definitions (CREATE — Task 1)

- **Purpose**: TypeScript type definitions and Zod schemas for 7 workspace
  domain events
- **Location**: `packages/event-bus/src/events/workspace.events.ts`
- **Event Types**: Per Spec Appendix C
  - `core.workspace.created`
  - `core.workspace.updated`
  - `core.workspace.deleted`
  - `core.workspace.member.added`
  - `core.workspace.member.role_updated`
  - `core.workspace.member.removed`
  - `core.workspace.team.created`
- **Dependencies**: `zod`, `../types` (DomainEvent base)

---

### 4.8 Frontend Components (Task 3 + Task 4)

#### SharedResourcesList (CREATE — Task 3)

- **Purpose**: Display shared resources in a workspace
- **Location**: `apps/web/src/components/SharedResourcesList.tsx`
- **Dependencies**: TanStack Query, workspace API client, `@plexica/ui`

#### ShareResourceDialog (CREATE — Task 3)

- **Purpose**: Dialog to share a resource with a workspace
- **Location**: `apps/web/src/components/ShareResourceDialog.tsx`
- **Dependencies**: Radix Dialog, Zod validation, workspace API client

#### WorkspaceSettingsForm (MODIFY — Task 4)

- **Purpose**: Enhanced settings form with typed fields
- **Location**: `apps/web/src/routes/workspace-settings.tsx` (existing, modify)
- **Enhancements**: Add toggle/select/number inputs for all settings fields,
  client-side Zod validation, save with optimistic updates

---

## 5. File Map

### Files to Create

| Path                                                                                        | Purpose                                    | Estimated Size |
| ------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------- |
| `packages/event-bus/src/events/workspace.events.ts`                                         | Workspace event type definitions & schemas | S (~120 lines) |
| `apps/core-api/src/modules/workspace/workspace-resource.service.ts`                         | Resource sharing service                   | M (~250 lines) |
| `apps/core-api/src/modules/workspace/dto/share-resource.dto.ts`                             | Resource sharing DTO with Zod              | S (~40 lines)  |
| `apps/core-api/src/modules/workspace/schemas/workspace-settings.schema.ts`                  | Settings Zod schema (Spec Appendix D)      | S (~60 lines)  |
| `apps/core-api/src/modules/workspace/utils/error-formatter.ts`                              | Constitution Art. 6.2 error formatter      | S (~80 lines)  |
| `apps/core-api/src/middleware/rate-limiter.ts`                                              | Redis sliding-window rate limiter          | M (~120 lines) |
| `apps/web/src/components/SharedResourcesList.tsx`                                           | Shared resources list component            | M (~150 lines) |
| `apps/web/src/components/ShareResourceDialog.tsx`                                           | Share resource dialog component            | M (~180 lines) |
| `apps/core-api/src/__tests__/workspace/unit/workspace-events.test.ts`                       | Event publishing unit tests                | M (~200 lines) |
| `apps/core-api/src/__tests__/workspace/unit/workspace-cache.test.ts`                        | Redis caching unit tests                   | M (~180 lines) |
| `apps/core-api/src/__tests__/workspace/unit/workspace-settings.test.ts`                     | Settings validation unit tests             | S (~120 lines) |
| `apps/core-api/src/__tests__/workspace/unit/workspace-error-format.test.ts`                 | Error formatter unit tests                 | S (~100 lines) |
| `apps/core-api/src/__tests__/workspace/unit/workspace-rate-limiter.test.ts`                 | Rate limiter unit tests                    | M (~150 lines) |
| `apps/core-api/src/__tests__/workspace/integration/workspace-resources.integration.test.ts` | Resource sharing integration tests         | M (~250 lines) |
| `apps/core-api/src/__tests__/workspace/integration/workspace-events.integration.test.ts`    | Event publishing integration tests         | S (~120 lines) |
| `apps/core-api/src/__tests__/workspace/e2e/workspace-resources.e2e.test.ts`                 | Resource sharing E2E tests                 | M (~180 lines) |

### Files to Modify

| Path                                                                                   | Section/Lines           | Change Description                                              | Effort |
| -------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------- | ------ |
| `apps/core-api/src/modules/workspace/workspace.service.ts`                             | Constructor, 7 methods  | Add EventBusService, Redis, Logger; event publish + cache logic | L      |
| `apps/core-api/src/routes/workspace.ts`                                                | All 12 handlers + 3 new | Error format migration, rate limiting, resource sharing routes  | L      |
| `apps/core-api/src/modules/workspace/dto/index.ts`                                     | Exports                 | Export ShareResourceDto and WorkspaceSettingsSchema             | S      |
| `apps/web/src/routes/workspace-settings.tsx`                                           | Form section            | Add typed settings form with toggle/select/number inputs        | M      |
| `apps/core-api/src/__tests__/workspace/unit/workspace-logic.test.ts`                   | Add tests               | Edge cases for coverage improvement (Task 5)                    | M      |
| `apps/core-api/src/__tests__/workspace/unit/workspace-permissions.test.ts`             | Add tests               | Guard edge cases for coverage improvement                       | S      |
| `apps/core-api/src/__tests__/workspace/integration/workspace-crud.integration.test.ts` | Add tests               | Pagination boundaries, cascade behaviors                        | S      |
| `apps/core-api/src/__tests__/workspace/e2e/workspace-lifecycle.e2e.test.ts`            | Add tests               | Full lifecycle with events + caching                            | S      |

### Files to Delete

None.

### Files to Reference (Read-only)

| Path                                                     | Purpose                              |
| -------------------------------------------------------- | ------------------------------------ |
| `.forge/constitution.md`                                 | Validate architectural decisions     |
| `.forge/architecture/system-architecture.md`             | System architecture context          |
| `.forge/knowledge/adr/adr-005-event-system-redpanda.md`  | Event bus architecture (ADR-005)     |
| `.forge/knowledge/adr/adr-002-database-multi-tenancy.md` | Schema-per-tenant pattern (ADR-002)  |
| `.forge/knowledge/adr/adr-007-prisma-orm.md`             | ORM patterns (ADR-007)               |
| `packages/event-bus/src/types/index.ts`                  | DomainEvent interface, EventMetadata |
| `packages/event-bus/src/services/event-bus.service.ts`   | EventBusService.publish() signature  |
| `apps/core-api/src/lib/redis.ts`                         | Redis singleton (ioredis)            |
| `apps/core-api/src/lib/logger.ts`                        | Shared Pino logger                   |

---

## 6. Dependencies

### 6.1 New Dependencies

**None.** All required packages are already in the project:

| Package              | Location             | Purpose                       | Already Installed |
| -------------------- | -------------------- | ----------------------------- | ----------------- |
| `@plexica/event-bus` | `packages/event-bus` | Event publishing              | ✅                |
| `ioredis`            | `apps/core-api`      | Redis caching + rate limiting | ✅                |
| `pino`               | `apps/core-api`      | Structured logging            | ✅                |
| `zod`                | `apps/core-api`      | Schema validation             | ✅                |

### 6.2 Internal Dependencies

- **`@plexica/event-bus`** → `EventBusService`, `DomainEvent` types
  (for event publishing in Task 1)
- **`@plexica/database`** → `PrismaClient`, Workspace/WorkspaceMember models
  (already used, no changes)
- **`apps/core-api/src/lib/redis.ts`** → Redis singleton
  (for caching in Task 2, rate limiting in Task 7)
- **`apps/core-api/src/lib/logger.ts`** → Pino logger
  (for structured logging in all tasks)
- **`apps/core-api/src/middleware/auth.ts`** → `authMiddleware`
  (already used, no changes)
- **`apps/core-api/src/modules/workspace/guards/`** → workspace guards
  (already used, resource sharing endpoints will use them)

---

## 7. Implementation Phases

> **Note**: Phases can be worked in parallel where dependencies allow.
> Phases 1–2 have no interdependencies and can be implemented concurrently.

### Phase 1: Foundation — Error Format + Rate Limiting (Tasks 6, 7)

**Objective**: Achieve Constitution Art. 6.2 and Art. 9.2 compliance for all
existing workspace endpoints before adding new functionality.

**Files to Create**:

- `apps/core-api/src/modules/workspace/utils/error-formatter.ts`
  - Purpose: Error code enum + formatter function
  - Dependencies: None
  - Estimated effort: 3–4 hours
- `apps/core-api/src/middleware/rate-limiter.ts`
  - Purpose: Redis sliding-window rate limiter
  - Dependencies: `apps/core-api/src/lib/redis.ts`
  - Estimated effort: 4–6 hours
- `apps/core-api/src/__tests__/workspace/unit/workspace-error-format.test.ts`
  - Purpose: Error formatter unit tests (10+ tests)
  - Estimated effort: 2 hours
- `apps/core-api/src/__tests__/workspace/unit/workspace-rate-limiter.test.ts`
  - Purpose: Rate limiter unit tests (8+ tests)
  - Estimated effort: 2 hours

**Files to Modify**:

- `apps/core-api/src/routes/workspace.ts`
  - Section: All 12 route handlers
  - Change: Replace ad-hoc error responses with `workspaceError()` calls;
    add `rateLimiter()` as `onRequest` hook per route
  - Estimated effort: 4–6 hours

**Tasks**:

1. [ ] Create `WorkspaceErrorCode` enum and `workspaceError()` formatter
2. [ ] Create `mapServiceError()` to map service exceptions to error codes
3. [ ] Migrate all 12 route handler error responses to use formatter
4. [ ] Create `rateLimiter()` factory with Redis sliding-window implementation
5. [ ] Apply rate limiter hooks to all 12 endpoints with correct tier configs
6. [ ] Add `X-RateLimit-Limit`, `X-RateLimit-Remaining` response headers
7. [ ] Add `Retry-After` header on 429 responses
8. [ ] Write unit tests for error formatter (10+ tests)
9. [ ] Write unit tests for rate limiter (8+ tests)

---

### Phase 2: Infrastructure — Events + Caching (Tasks 1, 2)

**Objective**: Implement event publishing and Redis caching in the existing
`WorkspaceService`. These are the two CRITICAL/HIGH gaps that block
constitution compliance (Art. 3.1, Art. 4.3).

**Files to Create**:

- `packages/event-bus/src/events/workspace.events.ts`
  - Purpose: 7 workspace event type definitions with Zod schemas
  - Dependencies: `packages/event-bus/src/types`
  - Estimated effort: 2 hours
- `apps/core-api/src/__tests__/workspace/unit/workspace-events.test.ts`
  - Purpose: Event publishing unit tests (12+ tests)
  - Estimated effort: 3 hours
- `apps/core-api/src/__tests__/workspace/unit/workspace-cache.test.ts`
  - Purpose: Caching unit tests (10+ tests)
  - Estimated effort: 2 hours
- `apps/core-api/src/__tests__/workspace/integration/workspace-events.integration.test.ts`
  - Purpose: Event integration tests (4+ tests)
  - Estimated effort: 2 hours

**Files to Modify**:

- `apps/core-api/src/modules/workspace/workspace.service.ts`
  - Section: Constructor (line ~90), create() (line ~220), update() (line ~519),
    delete() (line ~598), getMembership() (lines 624, 655),
    addMember() (line ~865), updateMemberRole() (line ~963),
    removeMember() (line ~1053), createTeam() (line ~1389)
  - Change: Add EventBusService, Redis, Logger to constructor; implement
    `publishEvent()`, `getCachedMembership()`, `setCachedMembership()`,
    `invalidateMembershipCache()` private methods; replace 8 TODO comments
    with actual implementations
  - Estimated effort: 8–12 hours

**Tasks**:

1. [ ] Define workspace event types and Zod schemas in `workspace.events.ts`
2. [ ] Modify `WorkspaceService` constructor to accept EventBus, Redis, Logger
3. [ ] Implement `publishEvent()` private helper (non-blocking try-catch)
4. [ ] Add event publishing to `create()` — `core.workspace.created`
5. [ ] Add event publishing to `update()` — `core.workspace.updated`
6. [ ] Add event publishing to `delete()` — `core.workspace.deleted`
7. [ ] Add event publishing to `addMember()` — `core.workspace.member.added`
8. [ ] Add event publishing to `updateMemberRole()` — `core.workspace.member.role_updated`
9. [ ] Add event publishing to `removeMember()` — `core.workspace.member.removed`
10. [ ] Add event publishing to `createTeam()` — `core.workspace.team.created`
11. [ ] Implement `getCachedMembership()` with cache-first pattern
12. [ ] Implement `setCachedMembership()` with 300s TTL
13. [ ] Implement `invalidateMembershipCache()` delete
14. [ ] Add cache-first to `getMembership()`
15. [ ] Add cache-first to `checkAccessAndGetMembership()`
16. [ ] Add cache invalidation to `addMember()`, `updateMemberRole()`, `removeMember()`
17. [ ] Write event publishing unit tests (mock EventBusService)
18. [ ] Write caching unit tests (mock Redis)
19. [ ] Write event integration tests (verify event schema + delivery)

---

### Phase 3: Settings Schema (Task 4)

**Objective**: Add typed Zod validation for workspace settings and implement
the frontend settings form.

**Depends on**: Phase 1 (error formatter used for validation errors)

**Files to Create**:

- `apps/core-api/src/modules/workspace/schemas/workspace-settings.schema.ts`
  - Purpose: Zod schema from Spec Appendix D
  - Dependencies: `zod`
  - Estimated effort: 2 hours
- `apps/core-api/src/__tests__/workspace/unit/workspace-settings.test.ts`
  - Purpose: Settings validation tests (10+ tests)
  - Estimated effort: 2 hours

**Files to Modify**:

- `apps/core-api/src/modules/workspace/workspace.service.ts`
  - Section: `update()` method, `addMember()` method
  - Change: Validate `settings` field with `WorkspaceSettingsSchema` before
    persistence; enforce `maxMembers` in `addMember()`
  - Estimated effort: 3 hours
- `apps/core-api/src/modules/workspace/dto/index.ts`
  - Change: Export `WorkspaceSettingsSchema` and `ShareResourceDto`
  - Estimated effort: <1 hour
- `apps/web/src/routes/workspace-settings.tsx`
  - Change: Add typed form fields: toggles, selects, number inputs, save button
  - Estimated effort: 4–6 hours

**Tasks**:

1. [ ] Create `WorkspaceSettingsSchema` Zod schema (per Spec Appendix D)
2. [ ] Add settings validation to `update()` method in WorkspaceService
3. [ ] Add `maxMembers` enforcement to `addMember()` method
4. [ ] Update DTO index exports
5. [ ] Implement frontend settings form with client-side validation
6. [ ] Write settings validation unit tests (10+ tests)

---

### Phase 4: Resource Sharing (Task 3)

**Objective**: Implement cross-workspace resource sharing with service, routes,
DTOs, and frontend components.

**Depends on**: Phase 3 (settings schema for `allowCrossWorkspaceSharing` policy)

**Files to Create**:

- `apps/core-api/src/modules/workspace/workspace-resource.service.ts`
  - Purpose: Resource sharing business logic
  - Dependencies: PrismaClient, WorkspaceService (settings check), Logger
  - Estimated effort: 6–8 hours
- `apps/core-api/src/modules/workspace/dto/share-resource.dto.ts`
  - Purpose: Zod-validated DTO for sharing
  - Dependencies: `zod`
  - Estimated effort: 1 hour
- `apps/web/src/components/SharedResourcesList.tsx`
  - Purpose: List shared resources
  - Estimated effort: 3–4 hours
- `apps/web/src/components/ShareResourceDialog.tsx`
  - Purpose: Share resource dialog
  - Estimated effort: 4–6 hours
- `apps/core-api/src/__tests__/workspace/integration/workspace-resources.integration.test.ts`
  - Purpose: Integration tests for resource sharing (12+ tests)
  - Estimated effort: 4 hours
- `apps/core-api/src/__tests__/workspace/e2e/workspace-resources.e2e.test.ts`
  - Purpose: E2E tests for full sharing workflow (6+ tests)
  - Estimated effort: 3 hours

**Files to Modify**:

- `apps/core-api/src/routes/workspace.ts`
  - Section: Bottom of file (add 3 new routes)
  - Change: Add POST /resources/share, GET /resources, DELETE /resources/:rid
    with workspace guard, role guard, error formatter, rate limiter
  - Estimated effort: 4–6 hours

**Tasks**:

1. [ ] Create `ShareResourceDto` Zod schema
2. [ ] Create `WorkspaceResourceService` with share/list/unshare methods
3. [ ] Add sharing policy check (`allowCrossWorkspaceSharing` from settings)
4. [ ] Add plugin existence validation for `resourceType: 'plugin'`
5. [ ] Register 3 new routes in `workspace.ts` with middleware chain
6. [ ] Create `SharedResourcesList` React component
7. [ ] Create `ShareResourceDialog` React component
8. [ ] Write integration tests (12+ tests)
9. [ ] Write E2E tests (6+ tests)

---

### Phase 5: Test Coverage Improvement (Task 5)

**Objective**: Raise workspace module coverage from 65% to ≥ 85% per
Constitution Art. 4.1.

**Depends on**: Phases 1–4 (tests cover new + existing functionality)

**Files to Modify**:

- Existing test files: add edge cases, error paths, boundary conditions
- New test files: created in Phases 1–4 cover new functionality

**Test Targets**:

| Category    | New Tests | Focus Areas                                                    |
| ----------- | --------- | -------------------------------------------------------------- |
| Unit        | 30–40     | Edge cases, error paths, boundary values, guard edge cases     |
| Integration | 10–15     | Cascade behaviors, pagination boundaries, transaction rollback |
| E2E         | 5–10      | Full lifecycle with events/caching, cross-tenant isolation     |

**Tasks**:

1. [ ] Add edge case unit tests for WorkspaceService (empty strings, max lengths)
2. [ ] Add error path unit tests (DB failures, timeouts, constraint violations)
3. [ ] Add security unit tests (schema injection, invalid tenant context)
4. [ ] Add guard edge case tests (missing headers, invalid UUIDs, concurrent access)
5. [ ] Add DTO boundary tests (min/max values, special characters)
6. [ ] Add integration tests for cascade behaviors and pagination boundaries
7. [ ] Add E2E tests for full lifecycle with events and caching
8. [ ] Run `pnpm test:coverage` and verify ≥ 85% workspace module coverage
9. [ ] Fix any remaining coverage gaps identified by report

---

## 8. Testing Strategy

### 8.1 Unit Tests

| Component            | Test Focus                                              | Tests     |
| -------------------- | ------------------------------------------------------- | --------- |
| Event publishing     | Non-blocking behavior, all 7 event types, error logging | 12        |
| Redis caching        | Cache hit/miss, TTL, invalidation, Redis failure        | 10        |
| Error formatter      | All 10 error codes, details field, edge cases           | 10        |
| Rate limiter         | Window enforcement, counter expiry, fail-open, headers  | 8         |
| Settings schema      | All fields, defaults, metadata constraints, boundaries  | 10        |
| ShareResource DTO    | Valid/invalid inputs, resource types                    | 5         |
| Coverage improvement | Edge cases, error paths, boundaries per Spec Section 10 | 30–40     |
| **Total unit**       |                                                         | **85–95** |

### 8.2 Integration Tests

| Scenario                    | Dependencies                                  | Tests     |
| --------------------------- | --------------------------------------------- | --------- |
| Resource sharing CRUD       | PostgreSQL, workspace service                 | 12        |
| Event publishing + delivery | EventBusService (or mock Redpanda)            | 4         |
| Rate limiting with Redis    | Redis                                         | 4         |
| Settings persistence        | PostgreSQL                                    | 4         |
| Coverage improvement        | PostgreSQL (cascade, pagination, transaction) | 10–15     |
| **Total integration**       |                                               | **34–39** |

### 8.3 E2E Tests

| Scenario                        | Dependencies                  | Tests     |
| ------------------------------- | ----------------------------- | --------- |
| Resource sharing workflow       | Full stack                    | 6         |
| Lifecycle with events + caching | Full stack + Redpanda + Redis | 3         |
| Coverage improvement            | Full stack                    | 5–10      |
| **Total E2E**                   |                               | **14–19** |

### 8.4 Test Totals

| Category    | New Tests   | Existing | Total       |
| ----------- | ----------- | -------- | ----------- |
| Unit        | 85–95       | 158      | 243–253     |
| Integration | 34–39       | 64       | 98–103      |
| E2E         | 14–19       | 33       | 47–52       |
| **Total**   | **133–153** | **255**  | **388–408** |

---

## 9. Architectural Decisions

| ADR     | Decision                        | Status   | Relevance                               |
| ------- | ------------------------------- | -------- | --------------------------------------- |
| ADR-001 | Monorepo with pnpm workspaces   | Accepted | Workspace module in `apps/core-api`     |
| ADR-002 | Schema-per-tenant multi-tenancy | Accepted | All workspace queries use tenant schema |
| ADR-005 | Redpanda (KafkaJS) for events   | Accepted | Task 1: event publishing via EventBus   |
| ADR-006 | Fastify as backend framework    | Accepted | Route handlers, middleware hooks        |
| ADR-007 | Prisma ORM for data access      | Accepted | All DB queries via Prisma               |

**No new ADRs required.** All gap implementations use existing approved
technologies and patterns:

- Event publishing uses the existing `EventBusService` (ADR-005)
- Caching uses the existing ioredis singleton (Constitution Art. 2.1)
- Rate limiting uses Redis (same singleton) — standard sliding-window pattern
- Error formatting is a pure utility — no architectural decision needed
- Settings validation uses Zod (Constitution Art. 5.3) — already in use

---

## 10. Requirement Traceability

| Requirement | Plan Section          | Implementation Path                                                      |
| ----------- | --------------------- | ------------------------------------------------------------------------ |
| FR-031      | Phase 2 (Tasks 1–10)  | `workspace.service.ts` → `publishEvent()` for lifecycle events           |
| FR-032      | Phase 2 (Tasks 7–9)   | `workspace.service.ts` → `publishEvent()` for membership events          |
| FR-033      | Phase 2 (Task 3)      | `publishEvent()` wraps `eventBus.publish()` in try-catch                 |
| FR-034      | Phase 2 (Tasks 11–15) | `workspace.service.ts` → `getCachedMembership()` cache-first pattern     |
| FR-035      | Phase 2 (Task 16)     | `workspace.service.ts` → `invalidateMembershipCache()` on mutations      |
| FR-036      | Phase 4 (Tasks 1–7)   | `workspace-resource.service.ts` → `shareResource()`, 3 API endpoints     |
| FR-037      | Phase 3+4 (Task 3–4)  | `WorkspaceSettingsSchema.allowCrossWorkspaceSharing` → policy check      |
| FR-038      | Phase 3 (Tasks 1–2)   | `workspace-settings.schema.ts` → Zod validation in `update()` method     |
| FR-039      | Phase 3 (Task 5)      | `workspace-settings.tsx` → typed form with toggle/select/number inputs   |
| FR-040      | Phase 3 (Task 3)      | `workspace.service.ts` → `addMember()` checks `maxMembers` from settings |
| NFR-003     | Phase 2 (T2)          | Redis caching reduces membership query P95 from ~200ms to < 100ms        |
| NFR-004     | Phase 5               | Coverage improvement 65% → 85% via 133–153 new tests                     |
| NFR-007     | Phase 2 (T2)          | Cache hit rate > 90% with 5-min TTL                                      |
| NFR-008     | Phase 2 (T1)          | Non-blocking event publish < 50ms P95                                    |

---

## 11. Constitution Compliance

| Article | Status       | Notes                                                                                                                                                                          |
| ------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Art. 1  | ✅ COMPLIANT | Multi-tenancy isolation maintained; API-first design; TDD for all tasks                                                                                                        |
| Art. 2  | ✅ COMPLIANT | All work uses approved stack (Fastify, Prisma, PostgreSQL, ioredis, Zod)                                                                                                       |
| Art. 3  | ✅ COMPLIANT | Phase 2 resolves event-driven gap (Art. 3.1); service layer pattern maintained (Art. 3.2); parameterized queries only (Art. 3.3); REST conventions with error codes (Art. 3.4) |
| Art. 4  | ✅ COMPLIANT | Phase 5 raises coverage to ≥ 85% (Art. 4.1); all phases include tests (Art. 4.1); P95 targets met via caching (Art. 4.3)                                                       |
| Art. 5  | ✅ COMPLIANT | Zod validation on all new inputs (Art. 5.3); tenant isolation maintained (Art. 5.1); rate limiting prevents DoS (implicit in Art. 5)                                           |
| Art. 6  | ✅ COMPLIANT | Phase 1 migrates all errors to `{ error: { code, message, details } }` format (Art. 6.2); Pino structured logging (Art. 6.3)                                                   |
| Art. 7  | ✅ COMPLIANT | All new files follow kebab-case naming; classes PascalCase; DB columns snake_case                                                                                              |
| Art. 8  | ✅ COMPLIANT | Unit + integration + E2E tests for all gaps; AAA pattern; descriptive names; deterministic tests                                                                               |
| Art. 9  | ✅ COMPLIANT | Rate limiting provides DoS protection (Art. 9.2); all changes backward compatible; no breaking schema changes                                                                  |

---

## Cross-References

| Document                | Path                                                     |
| ----------------------- | -------------------------------------------------------- |
| Spec                    | `.forge/specs/009-workspace-management/spec.md`          |
| Tasks                   | `.forge/specs/009-workspace-management/tasks.md`         |
| Architecture            | `.forge/architecture/system-architecture.md`             |
| Constitution            | `.forge/constitution.md`                                 |
| ADR-001 (Monorepo)      | `.forge/knowledge/adr/adr-001-monorepo-strategy.md`      |
| ADR-002 (Multi-tenancy) | `.forge/knowledge/adr/adr-002-database-multi-tenancy.md` |
| ADR-005 (Events)        | `.forge/knowledge/adr/adr-005-event-system-redpanda.md`  |
| ADR-006 (Fastify)       | `.forge/knowledge/adr/adr-006-fastify-framework.md`      |
| ADR-007 (Prisma)        | `.forge/knowledge/adr/adr-007-prisma-orm.md`             |
| Decision Log            | `.forge/knowledge/decision-log.md`                       |
