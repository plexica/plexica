# Plan: 002 - Authentication System

> Technical implementation plan for the Plexica authentication system based on
> Keycloak, using OAuth 2.0 Authorization Code flow with realm-per-tenant
> isolation and event-driven user sync via Redpanda.
>
> Created by the `forge-architect` agent via `/forge-plan`.

| Field   | Value                                                   |
| ------- | ------------------------------------------------------- |
| Status  | Approved                                                |
| Author  | forge-architect                                         |
| Date    | 2026-02-16                                              |
| Updated | 2026-02-22 (refresh #3 — Phase 7a frontend tasks added) |
| Track   | Feature                                                 |
| Spec    | [`.forge/specs/002-authentication/spec.md`](spec.md)    |

---

## 1. Overview

> **Implementation Status**: ✅ Backend COMPLETE (44/44 tasks done) + ⏳ Phase 7a Frontend (16 tasks pending) + ⏳ Phase 8 deferred to Sprint 5
> — updated 2026-02-22 (refresh #3: Phase 7a frontend tasks added). See
> [Appendix C](#appendix-c-implementation-actuals) for plan-vs-actuals comparison.
> See [Appendix E](#appendix-e-plan-vs-actuals-discrepancies-refresh-2) for
> discrepancies found during the second refresh. See [Phase 8](#phase-8-td-003-remediation--keycloakservice-test-coverage)
> for the open TD-003 coverage gap. See [Phase 7a](#phase-7a-frontend-implementation)
> for the frontend implementation plan (design-spec.md + user-journey.md).

This plan implements the Plexica authentication system as specified in Spec 002.
The existing codebase had partial auth implementation (~60% complete) that used
the **ROPC password grant** (`POST /auth/login` with username/password in body),
**flat error format** (`{ error, message }`), and **24-hour JWKS cache TTL**.
This plan refactored the existing code to comply with the spec and constitution:

1. **OAuth 2.0 Authorization Code flow** — Replace ROPC `POST /auth/login` with
   `GET /auth/login` redirect + `GET /auth/callback` token exchange (FR-016)
2. **Constitution-compliant errors** — Migrate all auth endpoints from
   `{ error, message }` to `{ error: { code, message, details? } }` (FR-015, Art. 6.2)
3. **JWKS cache TTL fix** — Change from 86,400,000ms (24h) to 600,000ms (10min) (NFR-007)
4. **Event-driven user sync** — Replace request-time UPSERT in tenant-context
   middleware with Redpanda consumer (FR-007)
5. **Full realm provisioning** — Extend `KeycloakService.createRealm()` with
   client and role provisioning (FR-005, FR-006)
6. **Suspended tenant enforcement** — Disable Keycloak realm + middleware
   rejection for suspended tenants (FR-012)
7. **Redis-backed rate limiting** — Login-specific rate limiting at 10 req/IP/min
   using Redis distributed counter (FR-013)
8. **JWT claims enrichment** — Add `realm`, `tenant_id`, `teams` to
   `KeycloakJwtPayload` interface (FR-003)
9. **User model extension** — Add `display_name`, `preferences`, `status` columns
   to tenant User model (FR-008)

### Key Architectural Decision: Realm Naming

The spec mandates realm naming as the **raw tenant slug** (e.g., `acme-corp`),
NOT `tenant-{slug}`. The security architecture document (`.forge/architecture/
security-architecture.md`) still references `tenant-{slug}` — this is a known
inconsistency. **The spec takes precedence** per the clarification session
(2026-02-16). The existing `keycloak.service.ts` already uses raw slug.

---

## 2. Data Model

### 2.1 New Tables

No new tables are required. The User model already exists in the tenant schema
template and the `super_admins` table exists in the core schema.

### 2.2 Modified Tables

#### `users` (tenant schema template)

| Column         | Change | Before           | After                                                          |
| -------------- | ------ | ---------------- | -------------------------------------------------------------- |
| `display_name` | ADD    | (does not exist) | `String?` — user-editable display name                         |
| `preferences`  | ADD    | (does not exist) | `Json @default("{}")` — application settings                   |
| `status`       | ADD    | (does not exist) | `UserStatus @default(ACTIVE)` — enum: ACTIVE/SUSPENDED/DELETED |
| `first_name`   | KEEP   | `String?`        | (no change — retained for Keycloak sync)                       |
| `last_name`    | KEEP   | `String?`        | (no change — retained for Keycloak sync)                       |
| `avatar`       | RENAME | `avatar String?` | `avatar_url String?` — align with spec naming                  |

**Prisma model change** (`packages/database/prisma/schema.prisma`, lines 312-332):

```prisma
model User {
  id          String     @id @default(uuid())
  keycloakId  String     @unique @map("keycloak_id")
  email       String     @unique
  firstName   String?    @map("first_name")
  lastName    String?    @map("last_name")
  displayName String?    @map("display_name")       // NEW (FR-008)
  avatarUrl   String?    @map("avatar_url")          // RENAMED from avatar
  locale      String     @default("en")
  preferences Json       @default("{}")              // NEW (FR-008)
  status      UserStatus @default(ACTIVE)            // NEW (FR-008): enum ACTIVE/SUSPENDED/DELETED
  createdAt   DateTime   @default(now()) @map("created_at")
  updatedAt   DateTime   @updatedAt @map("updated_at")

  workspaceMemberships WorkspaceMember[]
  teamsOwned           Team[]            @relation("TeamOwner")
  invitedBy            WorkspaceMember[] @relation("InvitedBy")

  @@map("users")
  @@schema("core") // Template — replicated per tenant schema
}

enum UserStatus {
  ACTIVE
  SUSPENDED
  DELETED

  @@schema("core")
}
```

> **Note**: The original plan specified `@@index([status], map: "idx_users_status")`
> but the actual schema does not include this explicit index. The `UserStatus` enum
> has a small cardinality (3 values), making a B-tree index less effective for
> selectivity. An index could be added if performance profiling reveals slow
> status-filtered queries. See [Appendix E, Discrepancy #2](#appendix-e-plan-vs-actuals-discrepancies-refresh-2).

### 2.3 Indexes

| Table   | Index Name           | Columns       | Type   | Status                               |
| ------- | -------------------- | ------------- | ------ | ------------------------------------ |
| `users` | ~~idx_users_status~~ | `status`      | B-tree | ❌ Not implemented (low cardinality) |
| `users` | (existing)           | `keycloak_id` | Unique | ✅ Implemented                       |
| `users` | (existing)           | `email`       | Unique | ✅ Implemented                       |

### 2.4 Migrations

1. **Migration: `add_user_profile_fields`**
   - Add `display_name VARCHAR(255) NULL` column to `users` table
   - Add `preferences JSONB NOT NULL DEFAULT '{}'` column to `users` table
   - Add `status VARCHAR(20) NOT NULL DEFAULT 'active'` column to `users` table
   - Rename `avatar` column to `avatar_url`
   - Add index `idx_users_status` on `status` column
   - **Backward compatible**: All new columns are nullable or have defaults.
     Existing code reading `avatar` must be updated before migration runs.
   - **Rollout**: Must be applied to ALL existing tenant schemas via the
     migration runner service (per ADR-002 schema-per-tenant pattern)

---

## 3. API Endpoints

All endpoints are prefixed with `/api/v1`. Error responses use the Constitution
Art. 6.2 format: `{ error: { code: string, message: string, details?: object } }`.

### 3.1 GET `/api/v1/auth/login`

- **Description**: Initiate OAuth 2.0 Authorization Code flow by redirecting to
  Keycloak's hosted login page for the tenant's realm (FR-016)
- **Auth**: Public
- **Rate Limit**: 10 requests per IP per minute (FR-013)
- **Replaces**: `POST /api/v1/auth/login` (ROPC password grant — removed)
- **Query Parameters**:
  ```
  tenant: string    // Required. Tenant slug (e.g., "acme-corp")
  redirect_uri: string  // Required. Where to redirect after auth callback
  state?: string    // Optional. CSRF protection state parameter
  ```
- **Response (302)**: Redirect to Keycloak authorization URL
  ```
  Location: https://{KEYCLOAK_URL}/realms/{tenant-slug}/protocol/openid-connect/auth
    ?client_id=plexica-web
    &response_type=code
    &redirect_uri={callback_url}
    &scope=openid profile email
    &state={state}
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | --------------------- | --------------------------------------------- |
  | 400 | AUTH_INVALID_REQUEST | Missing `tenant` or `redirect_uri` parameter |
  | 403 | AUTH_TENANT_SUSPENDED | Tenant is suspended (FR-012) |
  | 404 | AUTH_TENANT_NOT_FOUND | Tenant/realm does not exist |
  | 429 | AUTH_RATE_LIMITED | Too many login attempts from this IP (FR-013) |

### 3.2 GET `/api/v1/auth/callback`

- **Description**: Handle Keycloak OAuth callback — exchange authorization code
  for JWT tokens (FR-016)
- **Auth**: Public
- **Query Parameters**:
  ```
  code: string     // Authorization code from Keycloak
  state?: string   // CSRF state for validation
  ```
- **Response (200)**:
  ```json
  {
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "token_type": "Bearer",
    "expires_in": 86400,
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "display_name": "Jane Doe",
      "realm": "acme-corp",
      "roles": ["tenant_admin"],
      "teams": ["team-sales"]
    }
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------------- | ----------------------------------------- |
  | 401 | AUTH_CODE_EXPIRED | Authorization code expired or invalid |
  | 401 | AUTH_INVALID_CREDENTIALS| Token exchange failed (invalid code) |
  | 403 | AUTH_TENANT_SUSPENDED | Tenant suspended between redirect and callback |
  | 500 | AUTH_KEYCLOAK_ERROR | Keycloak unreachable during token exchange |

### 3.3 POST `/api/v1/auth/refresh`

- **Description**: Refresh access token using rotating refresh token (FR-014)
- **Auth**: Public (requires valid refresh_token in body)
- **Request**:
  ```json
  {
    "refresh_token": "eyJ..."
  }
  ```
- **Response (200)**:
  ```json
  {
    "access_token": "eyJ...",
    "refresh_token": "eyJ...(new, rotated)",
    "token_type": "Bearer",
    "expires_in": 86400
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ------------------------- | ----------------------------------------- |
  | 400 | AUTH_INVALID_REQUEST | Missing refresh_token |
  | 401 | AUTH_TOKEN_EXPIRED | Refresh token has expired |
  | 401 | AUTH_REFRESH_TOKEN_REUSED | Rotation detected reuse — chain revoked |
  | 403 | AUTH_TENANT_SUSPENDED | Tenant suspended since token was issued |

### 3.4 POST `/api/v1/auth/logout`

- **Description**: Invalidate session and revoke tokens in Keycloak
- **Auth**: Bearer (requires valid access token)
- **Request**:
  ```json
  {
    "refresh_token": "eyJ...(optional, for full session revocation)"
  }
  ```
- **Response (204)**: No content
- **Error Responses**:
  | Status | Code | When |
  | ------ | ------------------ | ------------------------------- |
  | 401 | AUTH_TOKEN_EXPIRED | Access token already expired |
  | 401 | AUTH_TOKEN_INVALID | Invalid token signature/format |
  | 500 | AUTH_KEYCLOAK_ERROR | Keycloak unreachable for revoke |

### 3.5 GET `/api/v1/auth/me`

- **Description**: Get current user profile from internal database
- **Auth**: Bearer (requires valid access token)
- **Response (200)**:
  ```json
  {
    "id": "uuid",
    "keycloak_id": "uuid",
    "email": "user@example.com",
    "first_name": "Jane",
    "last_name": "Doe",
    "display_name": "Jane Doe",
    "avatar_url": "https://...",
    "locale": "en",
    "preferences": {},
    "status": "active",
    "realm": "acme-corp",
    "roles": ["tenant_admin"],
    "teams": ["team-sales"]
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------- | --------------------------------------- |
  | 401 | AUTH_TOKEN_MISSING | No Authorization header (note: spec uses AUTH_MISSING_TOKEN) |
  | 401 | AUTH_TOKEN_EXPIRED | JWT has expired |
  | 403 | AUTH_CROSS_TENANT | JWT realm does not match target tenant |
  | 404 | AUTH_USER_NOT_FOUND| User not yet synced to internal DB |

### 3.6 GET `/api/v1/auth/jwks`

- **Description**: Public JWKS endpoint — proxies to Keycloak's JWKS for the
  tenant's realm. Cached for 10 minutes (NFR-007).
- **Auth**: Public
- **Query Parameters**:
  ```
  tenant: string   // Required. Tenant slug to resolve realm JWKS
  ```
- **Response (200)**:
  ```json
  {
    "keys": [
      {
        "kid": "...",
        "kty": "RSA",
        "alg": "RS256",
        "use": "sig",
        "n": "...",
        "e": "AQAB"
      }
    ]
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | --------------------- | ----------------------------- |
  | 404 | AUTH_TENANT_NOT_FOUND | Tenant/realm does not exist |
  | 502 | AUTH_KEYCLOAK_ERROR | Keycloak unreachable |

---

## 4. Component Design

### 4.1 AuthService (refactor)

- **Purpose**: Core authentication orchestration — manages OAuth flows, token
  exchange, session lifecycle
- **Location**: `apps/core-api/src/services/auth.service.ts` (NEW — extract from routes)
- **Responsibilities**:
  - Build Keycloak authorization URL for OAuth login redirect
  - Exchange authorization code for tokens via Keycloak token endpoint
  - Refresh access tokens with rotation enforcement
  - Revoke tokens (logout) via Keycloak revocation endpoint
  - Resolve tenant from slug and validate tenant status
- **Dependencies**:
  - `KeycloakService` — Keycloak Admin API calls
  - `TenantService` — Tenant lookup and status validation
  - `Redis` — Rate limiting counters
  - `Logger` (Pino) — Structured logging (Art. 6.3)
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | ----------------------- | ---------------------------------------------- | ---------------------------- | -------------------------------------------- |
  | `buildLoginUrl` | `tenantSlug: string, redirectUri: string, state?: string` | `string` | Build Keycloak authorization URL |
  | `exchangeCode` | `tenantSlug: string, code: string, redirectUri: string, codeVerifier?: string` | `KeycloakTokenResponse` | Exchange auth code for tokens (PKCE support) |
  | `refreshTokens` | `tenantSlug: string, refreshToken: string` | `KeycloakTokenResponse` | Refresh access token (with rotation) |
  | `revokeTokens` | `tenantSlug: string, token: string, tokenType: 'access_token' \| 'refresh_token'` | `void` | Revoke tokens in Keycloak (best-effort) |
  | `validateTenantForAuth` | `tenantSlug: string` | `Tenant` | Check tenant exists and is not suspended |

### 4.2 KeycloakService (extend)

- **Purpose**: Keycloak Admin API wrapper — realm provisioning, client management,
  role management, realm enable/disable
- **Location**: `apps/core-api/src/services/keycloak.service.ts` (MODIFY)
- **Responsibilities**:
  - Create Keycloak realms with correct settings (FR-001)
  - Provision `plexica-web` and `plexica-api` clients per realm (FR-005)
  - Provision base roles `tenant_admin`, `user` per realm (FR-006)
  - Enable/disable realm for tenant suspension (FR-012)
  - Configure refresh token rotation per realm (FR-014)
  - Token exchange via Keycloak token endpoint (for AuthService)
  - Token revocation via Keycloak revocation endpoint
- **Dependencies**:
  - HTTP client (Keycloak Admin REST API)
  - `Config` — Keycloak connection settings
  - `Logger` (Pino)
- **Key Methods (new)**:
  | Method | Parameters | Returns | Description |
  | ------------------------- | ------------------------------------------------ | --------------- | ----------------------------------------------- |
  | `provisionRealmClients` | `realmName: string` | `void` | Create plexica-web and plexica-api clients |
  | `provisionRealmRoles` | `realmName: string` | `void` | Create tenant_admin and user realm roles |
  | `setRealmEnabled` | `realmName: string, enabled: boolean` | `void` | Enable/disable realm (FR-012) |
  | `exchangeAuthorizationCode` | `realmName: string, code: string, redirectUri: string` | `KeycloakTokenResponse` | Exchange code via token endpoint |
  | `refreshToken` | `realmName: string, refreshToken: string` | `KeycloakTokenResponse` | Refresh token via Keycloak |
  | `revokeToken` | `realmName: string, token: string, type: 'access'|'refresh'` | `void` | Revoke token via revocation endpoint |
  | `configureRefreshTokenRotation` | `realmName: string` | `void` | Set realm to rotate refresh tokens (FR-014) |

### 4.3 UserSyncConsumer (new)

- **Purpose**: Redpanda consumer that processes Keycloak user lifecycle events
  and syncs to the tenant's internal database (FR-007)
- **Location**: `apps/core-api/src/services/user-sync.consumer.ts` (NEW)
- **Responsibilities**:
  - Subscribe to `plexica.auth.user.*` Redpanda topic
  - Handle `user.created` events — create user record in tenant schema
  - Handle `user.updated` events — update user record (email, name changes)
  - Handle `user.deleted` events — soft-delete (set status = `deactivated`)
  - Ensure idempotency (deduplicate by event ID)
  - Handle out-of-order events gracefully (check event timestamp)
- **Dependencies**:
  - `EventBusService` (from `@plexica/event-bus`)
  - `UserRepository` — Database access for user records
  - `Logger` (Pino)
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | -------------------- | ------------------------------------ | -------- | ---------------------------------------- |
  | `start` | — | `void` | Subscribe to Redpanda topics |
  | `stop` | — | `void` | Graceful shutdown, commit offsets |
  | `handleUserCreated` | `event: DomainEvent<UserCreatedData>` | `void` | Create user in tenant DB |
  | `handleUserUpdated` | `event: DomainEvent<UserUpdatedData>` | `void` | Update user in tenant DB |
  | `handleUserDeleted` | `event: DomainEvent<UserDeletedData>` | `void` | Soft-delete user (status=deactivated) |

**Event Types** (to add to `packages/event-bus/src/types/index.ts`):

```typescript
export interface UserCreatedData {
  keycloakId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  realmName: string; // tenant slug
}

export interface UserUpdatedData {
  keycloakId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  realmName: string;
}

export interface UserDeletedData {
  keycloakId: string;
  realmName: string;
}
```

### 4.4 UserRepository (new)

- **Purpose**: Data access layer for tenant-scoped user records (Art. 3.3)
- **Location**: `apps/core-api/src/repositories/user.repository.ts` (NEW)
- **Responsibilities**:
  - CRUD operations on tenant-scoped `users` table
  - Enforce tenant schema isolation via `AsyncLocalStorage` context
  - Parameterized queries only (Art. 5.3)
- **Dependencies**:
  - Prisma client (tenant-scoped)
  - `AsyncLocalStorage` tenant context
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | -------------------- | -------------------------------------------- | ------------- | --------------------------------------- |
  | `findByKeycloakId` | `keycloakId: string` | `User | null` | Find user by Keycloak UUID |
  | `findByEmail` | `email: string` | `User | null` | Find user by email |
  | `create` | `data: CreateUserDto` | `User` | Create new user record |
  | `update` | `keycloakId: string, data: UpdateUserDto` | `User` | Update user record by Keycloak ID |
  | `softDelete` | `keycloakId: string` | `User` | Set status to "deactivated" |
  | `findById` | `id: string` | `User | null` | Find user by internal UUID |

### 4.5 AuthRateLimiter (new)

- **Purpose**: Redis-backed distributed rate limiter specifically for login
  endpoints (FR-013, NFR-008)
- **Location**: `apps/core-api/src/middleware/auth-rate-limit.ts` (NEW)
- **Responsibilities**:
  - Track login attempts per IP address using Redis INCR + EXPIRE
  - Enforce 10 attempts per IP per minute sliding window
  - Return HTTP 429 with `AUTH_RATE_LIMITED` error code when exceeded
  - Use Constitution-compliant error format
- **Dependencies**:
  - `Redis` client (`apps/core-api/src/lib/redis.ts`)
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | ------------------- | ------------------------------- | --------- | ------------------------------------------ |
  | `checkRateLimit` | `ip: string` | `boolean` | Returns true if under limit, false if over |
  | `authRateLimitHook` | `request: FastifyRequest, reply: FastifyReply` | `void` | Fastify preHandler hook |

**Redis key pattern**: `auth:ratelimit:{ip}` with TTL of 60 seconds.
Uses `INCR` + `EXPIRE` atomic pattern (set TTL only on first increment via
`MULTI/EXEC` or Lua script for atomicity).

### 4.6 JwtService (refactor)

- **Purpose**: JWT validation, JWKS management, token parsing
- **Location**: `apps/core-api/src/lib/jwt.ts` (MODIFY)
- **Changes required**:
  1. **JWKS cache TTL**: Change `cacheMaxAge` from `86400000` (24h) to `600000`
     (10 min) per NFR-007
  2. **JWT claims interface**: Add `realm`, `tenant_id`, `teams` to
     `KeycloakJwtPayload` (FR-003)
  3. **Cross-tenant validation**: Add `validateTenantMatch(token, requestTenant)`
     method (FR-011)
- **Updated `KeycloakJwtPayload` interface**:
  ```typescript
  export interface KeycloakJwtPayload {
    sub: string; // User UUID
    iss: string; // Issuer URL (realm-specific)
    realm: string; // Realm name = tenant slug (FR-003)
    tenant_id: string; // Tenant identifier = tenant slug (FR-003)
    roles: string[]; // Realm roles (FR-003)
    teams: string[]; // Team memberships (FR-003)
    exp: number; // Expiration timestamp
    iat: number; // Issued-at timestamp
    azp: string; // Authorized party (client ID)
    scope: string; // Token scopes
    email?: string; // User email (optional claim)
    preferred_username?: string; // Username
  }
  ```

### 4.7 AuthMiddleware (refactor)

- **Purpose**: Fastify preHandler hook for JWT validation and tenant context
- **Location**: `apps/core-api/src/middleware/auth.ts` (MODIFY)
- **Changes required**:
  1. **Error format**: Replace `{ error, message }` with `{ error: { code, message } }` (FR-015)
  2. **Suspended tenant check**: After JWT validation, check if tenant status is
     `SUSPENDED` and reject with `AUTH_TENANT_SUSPENDED` (FR-012)
  3. **Cross-tenant rejection**: Validate that JWT realm matches request tenant
     context (FR-011)
  4. **Error codes**: Use stable error codes from spec Section 8

### 4.8 ErrorHandler (refactor)

- **Purpose**: Global Fastify error handler — catch-all for unhandled errors
- **Location**: `apps/core-api/src/middleware/error-handler.ts` (MODIFY)
- **Changes required**:
  1. **Error format**: Replace `{ error, message }` flat structure with
     `{ error: { code, message, details? } }` (Art. 6.2)
  2. **No stack traces**: Ensure stack traces are never in production responses
  3. **Error classification**: Implement Art. 6.1 classification (operational
     vs programmer vs validation vs tenant isolation)

### 4.9 TenantContextMiddleware (refactor)

- **Purpose**: Extract and set tenant context from JWT or request headers
- **Location**: `apps/core-api/src/middleware/tenant-context.ts` (MODIFY)
- **Changes required**:
  1. **Remove request-time UPSERT**: Delete `syncUserToTenantSchema()` function
     (lines ~200-280). User sync is now event-driven via Redpanda (FR-007).
  2. **Activate JWT-based extraction**: Uncomment and enable JWT-based tenant
     extraction (Method 2) which derives tenant from `token.realm` claim.
  3. **Error format**: Use Constitution-compliant error format.

### 4.10 AuthRoutes (rewrite)

- **Purpose**: Fastify route definitions for all auth endpoints
- **Location**: `apps/core-api/src/routes/auth.ts` (REWRITE)
- **Changes required**:
  1. **Replace ROPC routes**: Remove `POST /auth/login` (ROPC) and add
     `GET /auth/login` (OAuth redirect) + `GET /auth/callback` (token exchange)
  2. **Error format**: All error responses use Constitution format
  3. **Rate limiting**: Apply `authRateLimitHook` to login and callback endpoints
  4. **Zod validation**: Validate all query parameters and request bodies with
     Zod schemas (Art. 5.3)
  5. **Route structure**: Delegate business logic to `AuthService` (Art. 3.2 —
     no business logic in controllers)

---

## 5. File Map

> **Note**: All paths are relative to the project root (`/Users/luca/dev/opencode/plexica`).

### Files to Create

| Path                                                                                  | Purpose                                                                   | Estimated Size |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------- |
| `apps/core-api/src/services/auth.service.ts`                                          | AuthService — OAuth flow orchestration, token exchange, session lifecycle | L (~300 lines) |
| `apps/core-api/src/services/user-sync.consumer.ts`                                    | UserSyncConsumer — Redpanda consumer for Keycloak user events (FR-007)    | M (~200 lines) |
| `apps/core-api/src/repositories/user.repository.ts`                                   | UserRepository — Tenant-scoped user data access layer                     | M (~150 lines) |
| `apps/core-api/src/middleware/auth-rate-limit.ts`                                     | AuthRateLimiter — Redis-backed login rate limiting (FR-013)               | S (~80 lines)  |
| `apps/core-api/src/types/auth.types.ts`                                               | Auth type definitions — DTOs, error codes, token structures               | S (~100 lines) |
| `apps/core-api/src/__tests__/auth/unit/auth.service.test.ts`                          | Unit tests for AuthService                                                | L (~400 lines) |
| `apps/core-api/src/__tests__/auth/unit/user-sync.consumer.test.ts`                    | Unit tests for UserSyncConsumer                                           | M (~250 lines) |
| `apps/core-api/src/__tests__/auth/unit/user.repository.test.ts`                       | Unit tests for UserRepository                                             | M (~200 lines) |
| `apps/core-api/src/__tests__/auth/unit/auth-rate-limit.test.ts`                       | Unit tests for AuthRateLimiter                                            | S (~120 lines) |
| `apps/core-api/src/__tests__/auth/integration/oauth-flow.integration.test.ts`         | Integration tests for OAuth Authorization Code flow                       | L (~350 lines) |
| `apps/core-api/src/__tests__/auth/integration/user-sync.integration.test.ts`          | Integration tests for Redpanda user sync pipeline                         | M (~250 lines) |
| `apps/core-api/src/__tests__/auth/integration/realm-provisioning.integration.test.ts` | Integration tests for full realm provisioning                             | M (~200 lines) |
| `apps/core-api/src/__tests__/auth/e2e/auth-complete.e2e.test.ts`                      | E2E tests for full auth lifecycle (login → use → refresh → logout)        | L (~300 lines) |

### Files to Modify

| Path                                             | Section/Lines                                                          | Change Description                                                                               | Estimated Effort |
| ------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------- |
| `apps/core-api/src/routes/auth.ts`               | Entire file (437 lines)                                                | Rewrite: Remove ROPC, add OAuth redirect/callback routes, Constitution error format              | L                |
| `apps/core-api/src/middleware/auth.ts`           | Lines 50-120 (error handling), lines 200-280 (validation)              | Add suspended tenant check (FR-012), cross-tenant rejection (FR-011), Constitution error format  | M                |
| `apps/core-api/src/middleware/tenant-context.ts` | Lines 200-280 (syncUserToTenantSchema), lines 100-150 (JWT extraction) | Remove request-time UPSERT, activate JWT-based tenant extraction                                 | M                |
| `apps/core-api/src/middleware/error-handler.ts`  | Entire file (103 lines)                                                | Replace flat error format with Constitution Art. 6.2 nested format                               | S                |
| `apps/core-api/src/lib/jwt.ts`                   | Line ~45 (cacheMaxAge), lines 80-110 (interface)                       | Fix JWKS cache TTL (24h → 10min), extend KeycloakJwtPayload with realm/tenant_id/teams           | S                |
| `apps/core-api/src/services/keycloak.service.ts` | Lines 50-100 (createRealm), add new methods                            | Extend createRealm with client/role provisioning, add setRealmEnabled, token exchange/revocation | L                |
| `apps/core-api/src/services/tenant.service.ts`   | Lines ~80-120 (createTenant)                                           | Call provisionRealmClients + provisionRealmRoles after createRealm                               | S                |
| `packages/database/prisma/schema.prisma`         | Lines 307-324 (User model)                                             | Add display_name, preferences, status columns; rename avatar → avatar_url                        | S                |
| `packages/event-bus/src/types/index.ts`          | End of file                                                            | Add UserCreatedData, UserUpdatedData, UserDeletedData interfaces                                 | S                |
| `apps/core-api/src/config/index.ts`              | Lines ~80-115                                                          | Add OAuth callback URL, JWKS cache TTL config, rate limit config                                 | S                |
| `apps/core-api/src/index.ts`                     | Route registration section                                             | Register UserSyncConsumer startup, register updated auth routes                                  | S                |

### Files to Delete

| Path   | Reason                                   | Migration Notes |
| ------ | ---------------------------------------- | --------------- |
| (none) | No files deleted — all modified in place | N/A             |

### Files to Reference (Read-only)

| Path                                                     | Purpose                                                         |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| `.forge/constitution.md`                                 | Validate architectural decisions (Art. 1-9)                     |
| `.forge/specs/002-authentication/spec.md`                | Source spec with 16 FRs, 8 NFRs, 12 edge cases                  |
| `.forge/architecture/system-architecture.md`             | System context and component boundaries                         |
| `.forge/architecture/security-architecture.md`           | Security patterns (note: realm naming inconsistency)            |
| `.forge/knowledge/adr/adr-002-database-multi-tenancy.md` | Schema-per-tenant pattern                                       |
| `.forge/knowledge/adr/adr-005-event-system-redpanda.md`  | Redpanda event bus architecture                                 |
| `.forge/knowledge/adr/adr-006-fastify-framework.md`      | Fastify hooks and middleware patterns                           |
| `apps/core-api/src/lib/redis.ts`                         | Existing Redis client singleton (used by rate limiter)          |
| `apps/core-api/src/middleware/advanced-rate-limit.ts`    | Existing in-memory rate limiter (reference pattern, not reused) |
| `docs/SECURITY.md`                                       | Security guidelines for SQL injection prevention                |

---

## 6. Dependencies

### 6.1 New Dependencies

| Package | Version | Purpose                               |
| ------- | ------- | ------------------------------------- |
| (none)  |         | No new external dependencies required |

**Rationale**: All required functionality is available through the existing
approved stack:

- Keycloak Admin API → plain HTTP via `fetch` (Node.js 20+ built-in)
- Redis rate limiting → `ioredis` (already in stack, Art. 2.1)
- JWT validation → existing `jose` or `jsonwebtoken` library
- Event consumption → `@plexica/event-bus` (already in stack)
- Zod validation → already in stack (Art. 5.3)

No ADR required since no new dependencies are introduced (Art. 2.2).

### 6.2 Internal Dependencies

- **`@plexica/database`** — Prisma client, User model, Tenant model
- **`@plexica/event-bus`** — EventBusService, DomainEvent types for user sync
- **`apps/core-api/src/lib/redis.ts`** — Redis client for rate limiting
- **`apps/core-api/src/lib/logger.ts`** — Shared Pino logger instance
- **`apps/core-api/src/config/index.ts`** — Keycloak, Redis, OAuth configuration
- **`apps/core-api/src/services/tenant.service.ts`** — Tenant lookup and status

---

## 7. Implementation Phases

### Phase 1: Foundation — Error Format, JWT, Types

**Objective**: Fix cross-cutting concerns that all other phases depend on:
Constitution-compliant error format, JWT claims, JWKS cache TTL, shared types.

**Files to Create**:

- `apps/core-api/src/types/auth.types.ts`
  - Purpose: Auth error codes, DTOs, token interfaces, Zod schemas
  - Dependencies: None
  - Estimated effort: 2h

**Files to Modify**:

- `apps/core-api/src/middleware/error-handler.ts`
  - Section: Entire file (103 lines)
  - Change: Replace `{ error, message }` with `{ error: { code, message, details? } }` (Art. 6.2)
  - Estimated effort: 1h
- `apps/core-api/src/lib/jwt.ts`
  - Section: Line ~45 (cacheMaxAge), lines 80-110 (KeycloakJwtPayload)
  - Change: Fix JWKS TTL to 600000ms; add `realm`, `tenant_id`, `teams` claims
  - Estimated effort: 1h
- `packages/database/prisma/schema.prisma`
  - Section: Lines 307-324 (User model)
  - Change: Add `display_name`, `preferences`, `status`; rename `avatar` → `avatar_url`
  - Estimated effort: 1h

**Tasks**:

1. [ ] Define `AuthErrorCode` enum with all 13 error codes from spec Section 8
2. [ ] Define `TokenResponse`, `CreateUserDto`, `UpdateUserDto` interfaces
3. [ ] Define Zod schemas for login query params, callback query params, refresh body
4. [ ] Refactor `error-handler.ts` to use `{ error: { code, message, details? } }` format
5. [ ] Fix `cacheMaxAge` in `jwt.ts` from 86400000 to 600000 (NFR-007)
6. [ ] Add `realm`, `tenant_id`, `teams` to `KeycloakJwtPayload` interface (FR-003)
7. [ ] Add `validateTenantMatch(token, requestTenant)` method to JwtService
8. [ ] Update Prisma User model with new columns (FR-008)
9. [ ] Run `pnpm db:generate` to regenerate Prisma client
10. [ ] Update existing tests in `jwt.test.ts` and `jwt-extended.test.ts` for new claims

### Phase 2: Data Layer — User Repository, Schema Migration

**Objective**: Create the UserRepository data access layer and run the schema
migration to add new User columns. This phase must complete before user sync.

**Files to Create**:

- `apps/core-api/src/repositories/user.repository.ts`
  - Purpose: Tenant-scoped User CRUD with Prisma
  - Dependencies: Phase 1 (Prisma schema updated)
  - Estimated effort: 3h
- `apps/core-api/src/__tests__/auth/unit/user.repository.test.ts`
  - Purpose: Unit tests for UserRepository methods
  - Dependencies: Phase 1 completion
  - Estimated effort: 3h

**Tasks**:

1. [ ] Create migration `add_user_profile_fields` and apply to dev
2. [ ] Apply migration to all existing tenant schemas via migration runner
3. [ ] Implement `UserRepository` with CRUD methods
4. [ ] Write unit tests for `UserRepository` (≥85% coverage per Art. 4.1)
5. [ ] Verify parameterized queries only (Art. 5.3)

### Phase 3: Keycloak Service — Provisioning, Realm Management

**Objective**: Extend KeycloakService with full realm provisioning (clients,
roles), realm enable/disable, and token exchange/revocation methods.

**Files to Modify**:

- `apps/core-api/src/services/keycloak.service.ts`
  - Section: After existing `createRealm()`, add new methods
  - Change: Add 7 new methods (see Component Design 4.2)
  - Estimated effort: 6h
- `apps/core-api/src/services/tenant.service.ts`
  - Section: `createTenant()` method
  - Change: Call `provisionRealmClients()` + `provisionRealmRoles()` + `configureRefreshTokenRotation()` after `createRealm()`
  - Estimated effort: 1h

**Files to Create**:

- `apps/core-api/src/__tests__/auth/integration/realm-provisioning.integration.test.ts`
  - Purpose: Integration tests for full realm provisioning flow
  - Dependencies: Running Keycloak instance
  - Estimated effort: 4h

**Tasks**:

1. [ ] Implement `provisionRealmClients(realmName)` — create `plexica-web` (public, Authorization Code) and `plexica-api` (confidential, service account) clients (FR-005)
2. [ ] Implement `provisionRealmRoles(realmName)` — create `tenant_admin` and `user` realm roles (FR-006)
3. [ ] Implement `setRealmEnabled(realmName, enabled)` — enable/disable realm (FR-012)
4. [ ] Implement `exchangeAuthorizationCode(realmName, code, redirectUri)` — token endpoint call
5. [ ] Implement `refreshToken(realmName, refreshToken)` — Keycloak refresh
6. [ ] Implement `revokeToken(realmName, token, type)` — Keycloak revocation
7. [ ] Implement `configureRefreshTokenRotation(realmName)` — realm setting (FR-014)
8. ✅ Update provisioning orchestration to call new Keycloak methods — per **ADR-015**
   (accepted 2026-02-22), provisioning is now handled by a `ProvisioningOrchestrator`
   state machine rather than direct calls in `TenantService.createTenant()`. Each
   Keycloak provisioning step (`createRealm`, `provisionRealmClients`,
   `provisionRealmRoles`, `configureRefreshTokenRotation`) is a discrete step with
   independent `execute()` and `rollback()`. The underlying `KeycloakService` methods
   are unchanged; only the calling layer changed. See Decision Note #5 below.
9. [ ] Add error handling: if provisioning fails, tenant stays `PROVISIONING` (Edge Case #1)
10. [ ] Write integration tests for full provisioning flow (≥85% coverage)

### Phase 4: Auth Service + OAuth Routes

**Objective**: Create the AuthService and rewrite auth routes to use OAuth 2.0
Authorization Code flow instead of ROPC.

**Files to Create**:

- `apps/core-api/src/services/auth.service.ts`
  - Purpose: OAuth flow orchestration
  - Dependencies: Phase 3 (KeycloakService methods)
  - Estimated effort: 5h
- `apps/core-api/src/middleware/auth-rate-limit.ts`
  - Purpose: Redis-backed login rate limiting
  - Dependencies: Redis client
  - Estimated effort: 2h
- `apps/core-api/src/__tests__/auth/unit/auth.service.test.ts`
  - Purpose: Unit tests for AuthService
  - Dependencies: Phase 3 completion
  - Estimated effort: 5h
- `apps/core-api/src/__tests__/auth/unit/auth-rate-limit.test.ts`
  - Purpose: Unit tests for rate limiter
  - Estimated effort: 2h

**Files to Modify**:

- `apps/core-api/src/routes/auth.ts`
  - Section: Entire file (437 lines — rewrite)
  - Change: Replace ROPC with OAuth redirect/callback, delegate to AuthService
  - Estimated effort: 6h
- `apps/core-api/src/middleware/auth.ts`
  - Section: Error responses, validation logic
  - Change: Add suspended tenant check, cross-tenant rejection, Constitution error format
  - Estimated effort: 3h
- `apps/core-api/src/config/index.ts`
  - Section: Add new config keys
  - Change: Add `OAUTH_CALLBACK_URL`, `JWKS_CACHE_TTL`, `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW`
  - Estimated effort: 1h

**Tasks**:

1. [ ] Implement `AuthService.buildLoginUrl()` — construct Keycloak authorization URL
2. [ ] Implement `AuthService.exchangeCode()` — exchange code for tokens
3. [ ] Implement `AuthService.refreshTokens()` — refresh with rotation
4. [ ] Implement `AuthService.revokeTokens()` — logout/revoke
5. [ ] Implement `AuthService.validateTenantForAuth()` — tenant status check
6. [ ] Implement `AuthRateLimiter` — Redis INCR+EXPIRE, Lua script for atomicity
7. [ ] Rewrite `GET /api/v1/auth/login` — build URL + redirect 302
8. [ ] Rewrite `GET /api/v1/auth/callback` — exchange code, return tokens
9. [ ] Update `POST /api/v1/auth/refresh` — delegate to AuthService
10. [ ] Update `POST /api/v1/auth/logout` — delegate to AuthService
11. [ ] Update `GET /api/v1/auth/me` — return enriched profile from UserRepository
12. [ ] Add `GET /api/v1/auth/jwks` — proxy to Keycloak with 10-min cache
13. [ ] Apply `authRateLimitHook` to login and callback endpoints
14. [ ] Update `auth.ts` middleware: Constitution error format, suspended tenant, cross-tenant
15. [ ] Add Zod validation to all query params and request bodies (Art. 5.3)
16. [ ] Write unit tests for AuthService (≥85% coverage)
17. [ ] Write unit tests for AuthRateLimiter

### Phase 5: Event-Driven User Sync

**Objective**: Implement Redpanda-based user sync from Keycloak to internal
database, replacing request-time UPSERT.

**Files to Create**:

- `apps/core-api/src/services/user-sync.consumer.ts`
  - Purpose: Redpanda consumer for user lifecycle events
  - Dependencies: Phase 2 (UserRepository), Phase 1 (event types)
  - Estimated effort: 4h
- `apps/core-api/src/__tests__/auth/unit/user-sync.consumer.test.ts`
  - Purpose: Unit tests for UserSyncConsumer
  - Estimated effort: 4h
- `apps/core-api/src/__tests__/auth/integration/user-sync.integration.test.ts`
  - Purpose: Integration tests with Redpanda + PostgreSQL
  - Estimated effort: 5h

**Files to Modify**:

- `packages/event-bus/src/types/index.ts`
  - Section: End of file
  - Change: Add `UserCreatedData`, `UserUpdatedData`, `UserDeletedData` interfaces
  - Estimated effort: 30min
- `apps/core-api/src/middleware/tenant-context.ts`
  - Section: Lines ~200-280 (syncUserToTenantSchema)
  - Change: Remove request-time UPSERT, activate JWT-based tenant extraction
  - Estimated effort: 2h
- `apps/core-api/src/index.ts`
  - Section: Server startup
  - Change: Initialize and start `UserSyncConsumer` on server boot
  - Estimated effort: 30min

**Tasks**:

1. [ ] Define Redpanda topic: `plexica.auth.user.lifecycle`
2. [ ] Add event type interfaces to `@plexica/event-bus`
3. [ ] Implement `UserSyncConsumer.start()` — subscribe to topic with consumer group `plexica-user-sync`
4. [ ] Implement `handleUserCreated()` — create user in tenant schema
5. [ ] Implement `handleUserUpdated()` — update email/name/etc.
6. [ ] Implement `handleUserDeleted()` — soft-delete (status=deactivated)
7. [ ] Implement idempotency guard (deduplicate by event ID in Redis)
8. [ ] Implement event ordering check (skip if older than latest processed)
9. [ ] Handle Edge Case #2: event arrives before tenant provisioning — retry with backoff
10. [ ] Remove `syncUserToTenantSchema()` from tenant-context middleware
11. [ ] Activate JWT-based tenant context extraction (uncomment Method 2)
12. [ ] Register `UserSyncConsumer` in `index.ts` server startup
13. [ ] Write unit tests for all 3 event handlers (≥85% coverage)
14. [ ] Write integration tests with Redpanda and PostgreSQL (Edge Cases #2, #7)

### Phase 6: Integration Testing + E2E

**Objective**: End-to-end validation of the complete auth system. Verify all
16 functional requirements, 8 NFRs, and 12 edge cases.

**Files to Create**:

- `apps/core-api/src/__tests__/auth/integration/oauth-flow.integration.test.ts`
  - Purpose: Full OAuth flow integration tests
  - Dependencies: All previous phases
  - Estimated effort: 5h
- `apps/core-api/src/__tests__/auth/e2e/auth-complete.e2e.test.ts`
  - Purpose: E2E tests for complete auth lifecycle
  - Dependencies: All previous phases + test infrastructure
  - Estimated effort: 5h

**Tasks**:

1. [ ] Write integration test: OAuth login redirect → callback → token exchange
2. [ ] Write integration test: Token refresh with rotation
3. [ ] Write integration test: Logout and token revocation
4. [ ] Write integration test: Cross-tenant JWT rejection (FR-011)
5. [ ] Write integration test: Suspended tenant blocking (FR-012)
6. [ ] Write integration test: Rate limiting at 10 req/IP/min (FR-013)
7. [ ] Write integration test: Full realm provisioning with clients and roles
8. [ ] Write E2E test: Complete user journey (login → browse → refresh → logout)
9. [ ] Write E2E test: Tenant suspension during active session (Edge Case #9)
10. [ ] Write E2E test: Brute force protection (Edge Case #10)
11. [ ] Write E2E test: Stolen refresh token detection (Edge Case #11)
12. [ ] Write E2E test: Expired auth code handling (Edge Case #12)
13. [ ] Verify all existing auth tests still pass (no regressions)
14. [ ] Run coverage report — target ≥85% for auth module (Art. 4.1)
15. [ ] Update existing tests to use new error format and OAuth flow

---

## 7a. Phase 7: Frontend Implementation

> **Status**: ⏳ Not started — pending implementation sprint.
> **Added**: 2026-02-22 (plan refresh #2 — frontend gap identified).
> **Design source**: `.forge/specs/002-authentication/design-spec.md` (10 screens, 4 components).
> **User journeys**: `.forge/specs/002-authentication/user-journey.md` (3 personas, 5 journeys).

**Objective**: Implement all Plexica-owned frontend surfaces for the authentication
system. Keycloak's hosted login page is out of scope (styled via realm theming).
This phase covers the React/TanStack Router web app (`apps/web/`).

### Files to Create

| Path                                                       | Purpose                                                                                    | Estimated Size |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------- |
| `apps/web/src/routes/auth/callback.tsx`                    | Auth Callback Loading State — exchanges code, shows spinner (Screen 2)                     | S (~80 lines)  |
| `apps/web/src/routes/auth/error.tsx`                       | Auth Error Page route — renders `AuthErrorPage` component (Screens 4–5)                    | S (~60 lines)  |
| `apps/web/src/components/auth/SessionExpiredModal.tsx`     | Session Expired Modal — focus-trapped dialog, non-dismissible (Screen 3)                   | M (~120 lines) |
| `apps/web/src/components/auth/RateLimitCountdown.tsx`      | Rate Limit countdown Alert with `aria-live` timer (Screen 6)                               | M (~100 lines) |
| `apps/web/src/components/auth/AuthErrorPage.tsx`           | Full-screen error layout for tenant not found / suspended (Screens 4–5)                    | M (~100 lines) |
| `apps/web/src/stores/auth.store.ts`                        | Auth state: JWT, user, token refresh, session expiry detection, deep-link URL preservation | L (~200 lines) |
| `apps/web/src/__tests__/auth/AuthLandingPage.test.tsx`     | Unit tests for pre-login landing page states and interactions                              | M (~150 lines) |
| `apps/web/src/__tests__/auth/SessionExpiredModal.test.tsx` | Unit tests for modal (focus trap, keyboard, sign-in redirect)                              | M (~120 lines) |
| `apps/web/src/__tests__/auth/RateLimitCountdown.test.tsx`  | Unit tests for countdown timer, aria-live announcements                                    | S (~80 lines)  |
| `apps/web/src/__tests__/auth/AuthErrorPage.test.tsx`       | Unit tests for all error variants (not-found, suspended, keycloak)                         | S (~80 lines)  |
| `apps/web/src/__tests__/auth/AuthCallbackPage.test.tsx`    | Unit tests for callback loading, success redirect, error redirect                          | S (~80 lines)  |
| `apps/web/src/__tests__/auth/auth.store.test.ts`           | Unit tests for auth store: token refresh, session expiry, deep-link                        | M (~150 lines) |

### Files to Modify

| Path                                                | Change Description                                                                                                                    | Estimated Effort |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `apps/web/src/routes/login.tsx`                     | Redesign to `AuthLandingPage` — tenant branding, loading/redirect states, error alerts (Screen 1). Replace existing placeholder.      | L                |
| `apps/web/src/routes/admin/login.tsx`               | Update Super Admin login to use `AuthLandingPage` admin variant with Shield icon + platform branding (Screen 10)                      | S                |
| `apps/web/src/components/shell/UserProfileMenu.tsx` | Redesign to show display name, email, role badge, "Manage Tenant" link (tenant_admin only), Sign Out with token revocation (Screen 9) | M                |
| `apps/web/src/components/shell/AppShell.tsx`        | Integrate `SessionExpiredModal` — subscribe to auth store session expiry events                                                       | S                |
| `apps/web/src/lib/auth-client.ts`                   | HTTP client wrapper: attach Bearer token, handle 401 by triggering session expiry in auth store                                       | M                |

### Component Specifications

#### AuthLandingPage (Modify `login.tsx`)

**Screens covered**: Screen 1 (Pre-Login), Screen 10 (Super Admin)

**Props**:

- `variant`: `'tenant' | 'admin'` — controls branding
- `tenantName`: string — tenant display name (or "Plexica" for admin)
- `tenantLogoUrl`: string | null — logo URL (or Shield icon for admin)
- `onSignIn`: () => void — triggers OAuth redirect to Keycloak
- `isLoading`: boolean — skeleton state on initial page load
- `error`: `AuthError | null` — controls which error state to show

**States to implement** (per design-spec Screen 1):

| State              | Trigger            | Visual                                         |
| ------------------ | ------------------ | ---------------------------------------------- |
| Loading (init)     | Tenant resolving   | Skeleton placeholders                          |
| Loading (redirect) | Sign In clicked    | Button spinner + disabled                      |
| Rate Limited       | HTTP 429           | `RateLimitCountdown` alert + disabled button   |
| Cross-Tenant       | JWT realm mismatch | Info alert banner (Screen 7)                   |
| Keycloak Error     | 5xx / timeout      | Destructive alert + Retry button (Screen 8)    |
| Tenant Not Found   | 404                | Full error page (Screen 4 via `AuthErrorPage`) |
| Tenant Suspended   | 403                | Full error page (Screen 5 via `AuthErrorPage`) |

**Responsive behavior** (per design-spec §3.1):

- 375px: full-bleed layout, no card wrapper
- 768px+: card wrapper (`max-width: 420px`, shadow, rounded)

#### SessionExpiredModal (New)

**Screen covered**: Screen 3

- Uses existing `Dialog` from `@plexica/ui` as base
- Focus trap: yes — Tab cycles to Sign In button only
- `Esc`: no effect (user must re-authenticate — cannot dismiss)
- Stores current URL in `sessionStorage` before redirect for deep-link preservation
- Triggered by auth store `sessionExpired` event

#### RateLimitCountdown (New)

**Screen covered**: Screen 6 (overlay on Pre-Login Page)

- `retryAfterSeconds` prop from `Retry-After` response header (default: 60)
- Uses `setInterval` to count down; fires `onExpired` callback at 0
- `aria-live="polite"` region announces remaining time every 15 seconds (not every second)
- Countdown displayed in monospace: `0:47`
- Parent disables Sign In button via `disabled` prop while counting

#### AuthErrorPage (New)

**Screens covered**: Screen 4 (Tenant Not Found), Screen 5 (Tenant Suspended)

- `variant`: `'not-found' | 'suspended' | 'keycloak-error'`
- `tenantLogoUrl`: shown if available from cache
- `slug`: displayed in monospace for tenant-not-found case
- `showRetry` + `onRetry`: shown only for keycloak-error variant
- `role="alert"` on error container for screen reader announcement

#### UserProfileMenu (Modify existing)

**Screen covered**: Screen 9

- `user`: `{ name, email, avatarUrl, roles }` — from auth store (JWT claims FR-003)
- `showManageTenant`: boolean — shown only for `tenant_admin` role
- Sign Out: calls `POST /api/v1/auth/logout`, clears auth store, redirects to login
- Keyboard: arrow keys navigate items; Esc closes; Tab out of last item closes
- ARIA: `aria-haspopup`, `aria-expanded`, `role="menu"`, `role="menuitem"`

### Auth Store Design

**Location**: `apps/web/src/stores/auth.store.ts`

**Responsibilities**:

1. **Token storage**: Store `access_token`, `refresh_token`, `user` profile in memory (not localStorage — security)
2. **Silent refresh**: Detect token expiry 60s before `exp`, call `POST /auth/refresh` silently (FR-014)
3. **Session expiry**: If silent refresh fails → emit `sessionExpired` event → triggers `SessionExpiredModal`
4. **Deep-link preservation**: Save current URL to `sessionStorage` before redirect; restore after re-auth
5. **Logout**: Call `POST /api/v1/auth/logout`, clear store, redirect to `/{tenant}/login`
6. **Auth callback**: Parse JWT from `/auth/callback` response, extract `user` from claims (FR-003)

### Tasks

1. [ ] **T7-1** `[M]` Create `auth.store.ts` — token state management, silent refresh, session expiry detection, deep-link preservation (est. 3h)
2. [ ] **T7-2** `[M]` Create `apps/web/src/lib/auth-client.ts` — Bearer token attachment, 401 → session expiry trigger (est. 2h)
3. [ ] **T7-3** `[L]` Redesign `login.tsx` → `AuthLandingPage` — all 7 states + responsive card layout + accessibility (est. 4h)
4. [ ] **T7-4** `[M]` Create `apps/web/src/routes/auth/callback.tsx` — loading spinner, exchange code via auth store, redirect on success/error (est. 2h)
5. [ ] **T7-5** `[M]` Create `SessionExpiredModal.tsx` — focus trap, non-dismissible, Sign In redirect with deep-link preservation (est. 2h)
6. [ ] **T7-6** `[M]` Create `RateLimitCountdown.tsx` — countdown timer with accessible aria-live announcements (est. 2h)
7. [ ] **T7-7** `[M]` Create `AuthErrorPage.tsx` — not-found, suspended, keycloak-error variants (est. 2h)
8. [ ] **T7-8** `[S]` Update `admin/login.tsx` → admin variant of `AuthLandingPage` with Shield icon + platform branding (est. 1h)
9. [ ] **T7-9** `[M]` Redesign `UserProfileMenu.tsx` — display name, email, role badge, tenant_admin conditional link, Sign Out with revocation (est. 3h)
10. [ ] **T7-10** `[S]` Integrate `SessionExpiredModal` into `AppShell.tsx` — subscribe to auth store session expiry events (est. 1h)
11. [ ] **T7-11** `[M]` Write component tests for `AuthLandingPage` — all 7 states, accessibility, keyboard (est. 3h)
12. [ ] **T7-12** `[M]` Write component tests for `SessionExpiredModal`, `RateLimitCountdown`, `AuthErrorPage`, `AuthCallbackPage` (est. 3h)
13. [ ] **T7-13** `[M]` Write unit tests for `auth.store.ts` — silent refresh, session expiry, deep-link, logout (est. 2h)
14. [ ] **T7-14** `[S]` Accessibility audit — verify WCAG 2.1 AA compliance for all 10 screens against design-spec §6 checklist (est. 1h)

**Estimated total effort**: ~31h (~4 days)  
**New tests**: ~40 component tests + ~20 store unit tests = ~60 tests

### Design Token Usage

New CSS tokens required (from design-spec §5):

| Token                     | Light     | Dark      | Usage                              |
| ------------------------- | --------- | --------- | ---------------------------------- |
| `--auth-bg-gradient-from` | `#F0F4FF` | `#0A0E1A` | Pre-login page background gradient |
| `--auth-bg-gradient-to`   | `#FFFFFF` | `#0A0A0A` | Gradient end                       |

Add to `apps/web/src/styles/tokens.css` (or equivalent design token file).

### Accessibility Requirements

All frontend screens must meet **WCAG 2.1 AA** per Constitution Art. 1.3:

| Screen                | Key Requirement                                                                  |
| --------------------- | -------------------------------------------------------------------------------- |
| Pre-Login Landing     | Single focusable element (Sign In). Touch target ≥ 44px. Mobile-responsive.      |
| Auth Callback         | `role="status"` `aria-live="polite"`. No interaction required.                   |
| Session Expired Modal | `role="dialog"` `aria-modal="true"`. Focus trap. Non-dismissible (Esc disabled). |
| Error Pages (4–5)     | `role="alert"` for immediate announcement. Descriptive heading.                  |
| Rate Limited          | `aria-live="polite"` every 15s (not every 1s). `aria-disabled` on button.        |
| Cross-Tenant Alert    | `role="alert"` above normal login UI.                                            |
| Keycloak Unavailable  | Retry button with `aria-label="Retry connection to authentication service"`.     |
| User Profile Menu     | `aria-haspopup`, `aria-expanded`, arrow-key navigation, Esc to close.            |
| Super Admin Login     | Shield icon `aria-hidden="true"`. Single button with `aria-label`.               |

---

## 7b. Phase 8: TD-003 Remediation — KeycloakService Test Coverage

> **Added**: 2026-02-22 (full plan refresh). Deferred to Sprint 5.  
> **Tracked as**: TD-003 in `.forge/knowledge/decision-log.md`

**Objective**: Bring `keycloak.service.ts` (937 lines) from 2.83% to ≥85% line
coverage, resolving TD-003 and pushing the auth module over the Constitution
Art. 4.1 ≥85% core module target.

**Why deferred**: Integration tests require a running Keycloak instance. Unit
tests require complex mocking of `@keycloak/keycloak-admin-client`. The 4h
estimate in Phase 3 was insufficient for the service's complexity (937 lines
with HTTP calls, error handling, retry logic, and admin token TTL management).

### Files to Create

| Path                                                                        | Purpose                                                  | Est. Size |
| --------------------------------------------------------------------------- | -------------------------------------------------------- | --------- |
| `apps/core-api/src/__tests__/auth/unit/keycloak.service.test.ts`            | Mocked unit tests for all 9 KeycloakService methods      | ~40 tests |
| `apps/core-api/src/__tests__/auth/integration/keycloak.integration.test.ts` | Real Keycloak integration tests for full realm lifecycle | ~15 tests |

### Tasks

1. [ ] **T8-1** `[L]` Create `keycloak.service.test.ts` — mock `KcAdminClient`, test `createRealm()`, `provisionRealmClients()`, `provisionRealmRoles()`, admin token re-auth (est. 3-4h)
2. [ ] **T8-2** `[L]` Extend `keycloak.service.test.ts` — test `setRealmEnabled()`, `configureRefreshTokenRotation()`, `exchangeAuthorizationCode()`, `refreshToken()`, `revokeToken()`, `KeycloakSanitizedError` PII scrubbing (est. 3-4h)
3. [ ] **T8-3** `[XL]` Create `keycloak.integration.test.ts` — real Keycloak realm lifecycle + token exchange + error handling (est. 4-6h)
4. [ ] **T8-4** `[S]` Run `pnpm test:coverage`, verify keycloak.service.ts ≥75% (unit) and auth module ≥85% overall; close TD-003 in decision log (est. 30min)

**Success Criteria**:

- `keycloak.service.ts` line coverage ≥75% (unit tests alone)
- Auth module overall ≥85% (Constitution Art. 4.1)
- Overall project coverage ≥80% (Constitution Art. 4.1, TD-001)
- TD-003 marked resolved in decision log

---

## 8. Testing Strategy

### 8.1 Unit Tests

| Component                | Test Focus                                                          | Target Coverage |
| ------------------------ | ------------------------------------------------------------------- | --------------- |
| `AuthService`            | OAuth URL building, code exchange, token refresh, tenant validation | ≥90%            |
| `UserSyncConsumer`       | Event handling, idempotency, error recovery, soft-delete            | ≥90%            |
| `UserRepository`         | CRUD operations, tenant isolation, parameterized queries            | ≥85%            |
| `AuthRateLimiter`        | Redis counter logic, TTL management, edge cases                     | ≥90%            |
| `JwtService` (updated)   | New claims parsing, tenant match, JWKS TTL                          | ≥90%            |
| `ErrorHandler` (updated) | Constitution error format, error classification                     | ≥85%            |

### 8.2 Integration Tests

| Scenario                             | Dependencies         | Edge Cases Covered |
| ------------------------------------ | -------------------- | ------------------ |
| OAuth Authorization Code full flow   | Keycloak, PostgreSQL | #3, #4, #12        |
| Token refresh with rotation          | Keycloak             | #5, #11            |
| Cross-tenant JWT rejection           | Keycloak (2 realms)  | —                  |
| Suspended tenant blocking            | Keycloak, PostgreSQL | #9                 |
| Redis rate limiting                  | Redis                | #10                |
| Realm provisioning (clients + roles) | Keycloak             | #1, #6             |
| User sync via Redpanda               | Redpanda, PostgreSQL | #2, #7             |

### 8.3 E2E Tests

| Scenario                         | Full Stack Required           |
| -------------------------------- | ----------------------------- |
| Complete auth lifecycle          | Keycloak + PostgreSQL + Redis |
| Tenant suspension during session | Keycloak + PostgreSQL + Redis |
| Brute force protection           | Keycloak + Redis              |
| Refresh token theft detection    | Keycloak                      |

### 8.4 Test Infrastructure

Tests require the following services running via `test-infrastructure/`:

- PostgreSQL 15+ (tenant schemas)
- Keycloak 26+ (realm provisioning, OAuth flows)
- Redis (rate limiting, JWKS caching)
- Redpanda (user sync events)

Start with: `cd test-infrastructure && ./scripts/test-setup.sh`

### 8.5 Coverage Targets

| Scope           | Target | Constitution Reference   |
| --------------- | ------ | ------------------------ |
| Auth module     | ≥85%   | Art. 4.1 (core modules)  |
| Security code   | 100%   | Art. 4.1 (security code) |
| Overall project | ≥80%   | Art. 4.1 (overall)       |

Estimated new test count: **~95-120 tests** across unit, integration, and E2E.

---

## 9. Architectural Decisions

| ADR     | Decision                                                             | Status   |
| ------- | -------------------------------------------------------------------- | -------- |
| ADR-002 | Schema-per-tenant database isolation                                 | Accepted |
| ADR-005 | Redpanda for event-driven user sync                                  | Accepted |
| ADR-006 | Fastify framework for route/hook patterns                            | Accepted |
| ADR-015 | Tenant provisioning orchestration (state machine with step tracking) | Accepted |

### Decision Notes

1. **No new dependencies**: All functionality achievable with approved stack.
   Keycloak token exchange uses `fetch` (Node.js 20+). Rate limiting uses
   existing `ioredis`. User sync uses existing `@plexica/event-bus`.

2. **AuthService extraction**: Business logic is extracted from `auth.ts` routes
   into a dedicated `AuthService` class, following Constitution Art. 3.2 (layered
   architecture: Controllers → Services → Repositories).

3. **Redis rate limiting over in-memory**: The existing `advanced-rate-limit.ts`
   uses in-memory counters which don't work across multiple instances. Redis-backed
   rate limiting (FR-013) ensures distributed consistency.

4. **Realm naming**: Raw tenant slug (e.g., `acme-corp`), NOT `tenant-{slug}`.
   Per spec clarification session. Security architecture doc has known
   inconsistency that should be updated separately.

5. **ADR-015 impact on Phase 3** (added 2026-02-22): Tenant provisioning now
   uses a state machine orchestrator (`ProvisioningOrchestrator`) rather than
   sequential calls in `TenantService.createTenant()`. Keycloak realm creation,
   client provisioning, and role provisioning are now individual provisioning
   steps with independent `execute()`/`rollback()` methods. This supersedes the
   Phase 3 assumption of calling `provisionRealmClients()` and
   `provisionRealmRoles()` directly from `TenantService.createTenant()`.
   The underlying `KeycloakService` methods remain unchanged — only the
   orchestration layer changed.

---

## 10. Requirement Traceability

| Requirement | Plan Section                | Implementation Path                                                                                                                          |
| ----------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001      | §4.2 KeycloakService        | `keycloak.service.ts` → `createRealm(slug)`                                                                                                  |
| FR-002      | §4.5, §4.7 AuthMiddleware   | `auth.ts` middleware → `requireSuperAdmin` (master realm)                                                                                    |
| FR-003      | §4.6 JwtService             | `jwt.ts` → `KeycloakJwtPayload` with realm/tenant_id/teams                                                                                   |
| FR-004      | §4.7 AuthMiddleware         | `auth.ts` middleware → JWT validation preHandler hook                                                                                        |
| FR-005      | §4.2 KeycloakService        | `keycloak.service.ts` → `provisionRealmClients()`                                                                                            |
| FR-006      | §4.2 KeycloakService        | `keycloak.service.ts` → `provisionRealmRoles()`                                                                                              |
| FR-007      | §4.3 UserSyncConsumer       | `user-sync.consumer.ts` → Redpanda consumer                                                                                                  |
| FR-008      | §2.2 Modified Tables, §4.4  | `schema.prisma` User model + `user.repository.ts`                                                                                            |
| FR-009      | §4.7 AuthMiddleware         | `auth.ts` middleware → default auth required                                                                                                 |
| FR-010      | §4.2 KeycloakService        | Keycloak realm session config (24h idle timeout)                                                                                             |
| FR-011      | §4.6 JwtService, §4.7       | `jwt.ts` → `validateTenantMatch()` + middleware check; **frontend**: `auth-client.ts` → cross-tenant 401 triggers `sessionExpired` event     |
| FR-012      | §4.2, §4.7                  | `keycloak.service.ts` → `setRealmEnabled()` + middleware; **frontend**: `AuthErrorPage` (suspended variant, Screen 5) via `auth.store.ts`    |
| FR-013      | §4.5 AuthRateLimiter        | `auth-rate-limit.ts` → Redis INCR+EXPIRE; **frontend**: `RateLimitCountdown.tsx` (Screen 6) reads `Retry-After` header from HTTP 429         |
| FR-014      | §4.2 KeycloakService        | `keycloak.service.ts` → `configureRefreshTokenRotation()`                                                                                    |
| FR-015      | §4.8 ErrorHandler           | `error-handler.ts` → `{ error: { code, message } }`                                                                                          |
| FR-016      | §4.1 AuthService, §3.1-3.2  | `auth.service.ts` → OAuth flow + `GET /login` + `GET /callback`; **frontend**: `login.tsx` → OAuth redirect; `callback.tsx` → code exchange  |
| NFR-001     | §4.6 JwtService             | JWKS cache TTL 10min → <5ms validation                                                                                                       |
| NFR-002     | §4.3 UserSyncConsumer       | Redpanda consumer with <5s P95 processing                                                                                                    |
| NFR-003     | §4.8 ErrorHandler, §4.7     | No PII in error messages or logs                                                                                                             |
| NFR-004     | §11 Constitution Compliance | TLS enforced at infrastructure level                                                                                                         |
| NFR-005     | §4.1 AuthService, §4.2      | Graceful degradation with retry on Keycloak errors; **frontend**: `AuthLandingPage` Keycloak-error state (Screen 8) + Retry button           |
| NFR-006     | §3.1-3.2 Login Endpoint     | Generic error messages, Keycloak handles login UI; **frontend**: `AuthLandingPage` delegates auth UI to Keycloak, shows error only on return |
| NFR-007     | §4.6 JwtService             | `cacheMaxAge: 600000` (10min) in JWKS config                                                                                                 |
| NFR-008     | §4.5 AuthRateLimiter        | 10 req/IP/min via Redis distributed counter; **frontend**: `RateLimitCountdown.tsx` disables Sign In button during lockout (Screen 6)        |
| US-001      | §3.1, §3.2, §7 Phase 4      | OAuth login redirect + callback; **frontend**: `login.tsx` (AuthLandingPage, Screen 1) + `callback.tsx` (Screen 2) + `auth.store.ts`         |
| US-002      | §4.6, §4.7, §7 Phase 1      | JWT validation middleware; **frontend**: `auth-client.ts` attaches Bearer token; `SessionExpiredModal.tsx` on 401 (Screen 3)                 |
| US-003      | §4.3, §4.4, §7 Phase 5      | Redpanda consumer + UserRepository                                                                                                           |
| US-004      | §4.2, §7 Phase 3            | KeycloakService full provisioning                                                                                                            |
| US-005      | §4.7, §7 Phase 4            | Master realm Super Admin auth; **frontend**: `admin/login.tsx` → admin variant of `AuthLandingPage` with Shield icon (Screen 10)             |
| Edge #1     | §7 Phase 3, Task 9          | Tenant stays PROVISIONING on Keycloak failure                                                                                                |
| Edge #2     | §7 Phase 5, Task 9          | Event queued in Redpanda, replayed after provisioning                                                                                        |
| Edge #3     | §4.6 JwtService             | Accepted if within JWKS 10min cache TTL                                                                                                      |
| Edge #4     | §3.2 Callback               | All sessions valid, independent tokens                                                                                                       |
| Edge #5     | §4.7 AuthMiddleware         | JWT valid until expiry, then fails                                                                                                           |
| Edge #6     | §4.2 (existing)             | Slug uniqueness at tenant creation                                                                                                           |
| Edge #7     | §4.3 UserSyncConsumer       | Redpanda offset replay, no data loss                                                                                                         |
| Edge #8     | §4.7 AuthMiddleware         | Super Admin bypasses tenant context                                                                                                          |
| Edge #9     | §4.7, §4.2                  | Realm disabled + middleware rejects JWTs                                                                                                     |
| Edge #10    | §4.5 AuthRateLimiter        | HTTP 429 after 10 attempts/min                                                                                                               |
| Edge #11    | §3.3 Refresh                | Keycloak detects reuse, chain revoked (FR-014)                                                                                               |
| Edge #12    | §3.2 Callback               | 401 AUTH_CODE_EXPIRED returned                                                                                                               |

---

## 11. Constitution Compliance

| Article | Status | Notes                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1  | ✅     | Security-first: rate limiting (FR-013), token rotation (FR-014), suspended tenant blocking (FR-012), tenant isolation (FR-011). Zero-downtime: all schema changes backward compatible. API-first: all auth via versioned REST endpoints.                                                                                                                                                              |
| Art. 2  | ✅     | Uses approved stack only: Keycloak 26+ (auth), Fastify ^5.7 (routes), Redis/ioredis ^5.9 (rate limiting, caching), Redpanda/KafkaJS ^2.2 (user sync), Prisma ^6.8 (data), Vitest ^4.0 (tests). No new dependencies added.                                                                                                                                                                             |
| Art. 3  | ✅     | Layered architecture: Routes (controllers) → AuthService → UserRepository. Feature modules: auth module with clear boundaries. Prisma ORM with parameterized queries only. REST conventions: `/api/v1/auth/*`. API versioning: v1. Error format: `{ error: { code, message, details? } }`.                                                                                                            |
| Art. 4  | ⚠️     | Auth module target: ≥85% coverage. 532 tests implemented (plan estimated ~115). **keycloak.service.ts at 2.83% coverage (TD-003)** — single biggest gap. Remediation plan in [Phase 8](#7b-phase-8-td-003-remediation--keycloakservice-test-coverage) and Appendix D. **Target: Sprint 5**. Overall compliance PARTIAL until TD-003 is resolved.                                                      |
| Art. 5  | ✅     | Keycloak Auth for all authentication (5.1). Default auth required, public endpoints explicit (5.1). RBAC via Keycloak roles (5.1). 24h session expiry (5.1). Tenant validation every request (5.1). TLS 1.2+ (5.2). No PII in logs (5.2). No secrets in Git (5.2). Zod validation on all inputs (5.3). SQL injection prevention via Prisma (5.3). CSRF protection via state parameter on OAuth (5.3). |
| Art. 6  | ✅     | Error classification implemented (6.1): operational (tenant not found), validation (bad input), tenant isolation (cross-tenant). Error format: `{ error: { code, message, details? } }` with 13 stable codes (6.2). Pino JSON logging with standard fields (6.3). No sensitive data in logs (6.3).                                                                                                    |
| Art. 7  | ✅     | Files: kebab-case (`auth.service.ts`, `user-sync.consumer.ts`). Classes: PascalCase (`AuthService`, `UserSyncConsumer`). Functions: camelCase (`buildLoginUrl`, `exchangeCode`). Constants: UPPER_SNAKE_CASE. DB: snake_case tables/columns. API: REST plural nouns, versioned.                                                                                                                       |
| Art. 8  | ✅     | Unit tests for all services and repositories. Integration tests for API endpoints, Keycloak, Redpanda. E2E tests for critical flows (login, session, suspension). Contract tests: not applicable (no plugin-to-core auth API). Deterministic, independent, fast. AAA pattern. Descriptive names.                                                                                                      |
| Art. 9  | ✅     | Feature flags: OAuth flow can be feature-flagged alongside ROPC during migration. Rollback: ROPC routes can be retained behind flag until OAuth is verified. Safe migrations: all schema changes backward compatible (nullable/default columns). Health check: Keycloak connectivity included.                                                                                                        |

### Conflict: Security Architecture Realm Naming

**Issue**: `.forge/architecture/security-architecture.md` references realm naming
as `tenant-{slug}` (e.g., `tenant-acme-corp`), but Spec 002 mandates raw tenant
slug (e.g., `acme-corp`). The existing `keycloak.service.ts` already uses raw
slug.

**Resolution**: Spec takes precedence per clarification session (2026-02-16).
Security architecture doc should be updated separately to reflect raw slug
naming. This is tracked as a documentation update, not a code change.

### Post-Implementation Compliance Notes (added 2026-02-22)

**Art. 4.1 Tension**: keycloak.service.ts at 2.83% coverage violates the ≥85%
core module coverage target. This is tracked as TD-003 in the decision log.
See [Appendix D](#appendix-d-post-implementation-gaps-added-2026-02-22) for
the remediation plan. Overall auth module compliance with Art. 4.1 is
**PARTIAL** until TD-003 is resolved.

**Art. 3.2 Update (ADR-015)**: Provisioning orchestration changed from direct
service calls to state machine pattern per ADR-015. This strengthens compliance
with Art. 3.2 (service layer encapsulation) and Art. 1.2 (reliability — retry
and rollback). No constitution conflict.

**Art. 7.1 Minor Issue (Refresh #2)**: Error code `AUTH_TOKEN_MISSING` in
`auth.ts` middleware differs from spec-defined `AUTH_MISSING_TOKEN`. Both are
valid but inconsistent. See [Appendix E, Discrepancy #4](#appendix-e-plan-vs-actuals-discrepancies-refresh-2).
Impact on Art. 6.2 (stable error codes): LOW — the code is stable, just
named differently than the spec.

---

## Cross-References

| Document                    | Path                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| Spec                        | `.forge/specs/002-authentication/spec.md`                                                               |
| Tasks                       | `.forge/specs/002-authentication/tasks.md`                                                              |
| Design Spec (UX/UI)         | `.forge/specs/002-authentication/design-spec.md` — 10 screens, 4 components, design tokens, WCAG 2.1 AA |
| User Journeys               | `.forge/specs/002-authentication/user-journey.md` — 3 personas, 5 journeys with edge cases              |
| Architecture                | `.forge/architecture/system-architecture.md`                                                            |
| Security Architecture       | `.forge/architecture/security-architecture.md`                                                          |
| Constitution                | `.forge/constitution.md`                                                                                |
| ADR-002: Multi-Tenancy DB   | `.forge/knowledge/adr/adr-002-database-multi-tenancy.md`                                                |
| ADR-005: Event System       | `.forge/knowledge/adr/adr-005-event-system-redpanda.md`                                                 |
| ADR-006: Fastify Framework  | `.forge/knowledge/adr/adr-006-fastify-framework.md`                                                     |
| ADR-015: Provisioning Orch. | `.forge/knowledge/adr/adr-015-tenant-provisioning-orchestration.md`                                     |
| ADR-017: ABAC Engine        | `.forge/knowledge/adr/adr-017-abac-engine.md` (interacts with auth middleware)                          |
| Decision Log                | `.forge/knowledge/decision-log.md`                                                                      |
| Security Guidelines         | `docs/SECURITY.md`                                                                                      |

---

## Appendix A: Estimated Effort Summary

| Phase     | Name                               | Estimated Effort | Actual Status          | New Tests (Est) | New Tests (Actual) |
| --------- | ---------------------------------- | ---------------- | ---------------------- | --------------- | ------------------ |
| 1         | Foundation (errors, JWT, types)    | 8h               | ✅ Complete            | ~15             | —                  |
| 2         | Data Layer (repository, migration) | 6h               | ✅ Complete            | ~15             | —                  |
| 3         | Keycloak Service (provisioning)    | 11h              | ✅ Complete            | ~20             | —                  |
| 4         | Auth Service + OAuth Routes        | 24h              | ✅ Complete            | ~30             | —                  |
| 5         | Event-Driven User Sync             | 12h              | ✅ Complete            | ~20             | —                  |
| 6         | Integration Testing + E2E          | 10h              | ✅ Complete            | ~15             | —                  |
| 7         | Documentation and Review           | 3h               | ✅ Complete            | N/A             | —                  |
| 7a        | Frontend Implementation            | ~31h             | ⏳ Not started         | ~60             | —                  |
| 8         | TD-003: Keycloak Coverage          | 10-14h           | ⏳ Deferred (Sprint 5) | ~55             | —                  |
| **Total** |                                    | **~112-127h**    | **Phases 1-7 done**    | **~230**        | **532**            |

> **Note**: Actual backend test count (532) significantly exceeded the ~115 estimate
> because security hardening (Task 7.2/7.3) added substantial additional
> tests for cross-tenant security, token refresh edge cases, and rate
> limiting scenarios that were not anticipated at planning time.
> Phase 7a (~60 tests) and Phase 8 (~55 tests) are not yet included in the
> 532 actual count — they are still to be implemented.

## Appendix B: Migration Strategy (ROPC → OAuth)

The transition from ROPC password grant to OAuth 2.0 Authorization Code flow
is a **breaking change** for API consumers. Migration strategy:

1. **Phase 4a**: Deploy OAuth routes alongside existing ROPC routes (both active)
2. **Feature flag**: `AUTH_OAUTH_ENABLED=true` enables new routes; `false` keeps ROPC
3. **Client migration**: Frontend switches from `POST /auth/login` to
   `GET /auth/login` redirect flow
4. **Deprecation period**: ROPC routes marked as deprecated in API docs for 2 weeks
5. **Phase 4b**: Remove ROPC routes after all clients have migrated

This satisfies Constitution Art. 1.2 (zero-downtime, backward compatible) and
Art. 9.1 (feature flags for user-facing changes, fast rollback).

## Appendix C: Implementation Actuals (added 2026-02-22)

### File Size Comparison (Plan vs Actual)

| File                              | Plan Estimate | Actual Lines | Delta |
| --------------------------------- | ------------- | ------------ | ----- |
| `services/auth.service.ts`        | ~300 lines    | 337 lines    | +12%  |
| `services/user-sync.consumer.ts`  | ~200 lines    | 524 lines    | +162% |
| `repositories/user.repository.ts` | ~150 lines    | 388 lines    | +159% |
| `middleware/auth-rate-limit.ts`   | ~80 lines     | 179 lines    | +124% |
| `types/auth.types.ts`             | ~100 lines    | 157 lines    | +57%  |
| `routes/auth.ts` (rewrite)        | ~437 lines    | 1,067 lines  | +144% |
| `services/keycloak.service.ts`    | (extend)      | 937 lines    | N/A   |

**Key observation**: All files grew substantially beyond estimates. The
user-sync consumer grew 2.6× due to robust idempotency guards, event
ordering verification, and Edge Case #2 retry logic. Auth routes grew
2.4× due to comprehensive Zod validation, detailed error handling per
endpoint, and JWKS proxy caching logic.

### Test Coverage Status

| Component               | Plan Target | Actual Status                  | Notes                            |
| ----------------------- | ----------- | ------------------------------ | -------------------------------- |
| `auth.service.ts`       | ≥90%        | ✅ Tested (26 tests)           | Meets target                     |
| `user-sync.consumer.ts` | ≥90%        | ✅ Tested (48 tests)           | Meets target                     |
| `user.repository.ts`    | ≥85%        | ✅ Tested (42 tests)           | Meets target                     |
| `auth-rate-limit.ts`    | ≥90%        | ✅ Tested (28 tests)           | Meets target                     |
| `jwt.ts`                | ≥90%        | ✅ Tested (24+35 tests)        | Meets target (2 test files)      |
| `auth.ts` middleware    | ≥85%        | ✅ Tested (54+38 tests)        | Meets target (2 test files)      |
| `auth.ts` routes        | ≥85%        | ✅ Tested (46 tests)           | Meets target                     |
| `keycloak.service.ts`   | ≥85%        | ❌ **2.83% coverage (TD-003)** | CRITICAL GAP — see §12 below     |
| Auth module overall     | ≥85%        | ⚠️ Partial                     | Dragged down by keycloak.service |

**Total auth test count**: 532 tests (385 unit + 76 integration + 71 E2E)

### Test Files Not in Original Plan (Added During Implementation)

| File                                         | Tests | Reason Added                                       |
| -------------------------------------------- | ----- | -------------------------------------------------- |
| `unit/auth-middleware.test.ts`               | 38    | Dedicated middleware tests (separated from routes) |
| `unit/keycloak-jwt.test.ts`                  | 24    | JWT validation against real Keycloak token format  |
| `unit/permission.service.test.ts`            | 20    | Permission service tests (related to RBAC)         |
| `integration/auth-flow.integration.test.ts`  | 13    | Legacy auth flow integration (retained)            |
| `integration/permission.integration.test.ts` | 21    | Permission integration tests                       |
| `e2e/security-hardening.e2e.test.ts`         | 25    | Security hardening from Task 7.2 review            |
| `e2e/cross-tenant-security.e2e.test.ts`      | 12    | Cross-tenant isolation E2E (Task 7.2)              |
| `e2e/token-refresh.e2e.test.ts`              | 20    | Token refresh and rotation E2E                     |

## Appendix D: Post-Implementation Gaps (added 2026-02-22)

### Gap 1: keycloak.service.ts Coverage (TD-003 — HIGH)

**Problem**: `keycloak.service.ts` (937 lines) has only **2.83% test coverage**,
making it the single biggest drag on overall auth module coverage. This file
contains 7 critical methods planned in §4.2 plus the existing `createRealm()`
and admin API client management.

**Root cause**: Integration tests require a running Keycloak instance. Unit
testing requires complex mocking of `@keycloak/keycloak-admin-client`. The
plan's Phase 3 testing estimate (4h) was insufficient for the service's
complexity (937 lines with HTTP calls, error handling, retry logic).

**Impact**: Auth module coverage below the ≥85% target (Art. 4.1). Overall
project coverage at 76.5% vs 80% target (TD-001).

**Recommended remediation** (target: Sprint 5):

1. Create `apps/core-api/src/__tests__/auth/unit/keycloak.service.test.ts`
   with mocked `KcAdminClient` (~40 tests, est. 6-8h):
   - `createRealm()` — success, failure, retry
   - `provisionRealmClients()` — creates plexica-web + plexica-api clients
   - `provisionRealmRoles()` — creates tenant_admin + user roles
   - `setRealmEnabled()` — enable/disable realm
   - `exchangeAuthorizationCode()` — code exchange success/failure
   - `refreshToken()` — refresh with rotation
   - `revokeToken()` — token revocation
   - `configureRefreshTokenRotation()` — realm config update
   - Error sanitization via `KeycloakSanitizedError`
   - Admin token re-authentication (50s TTL)
2. Add to `apps/core-api/src/__tests__/auth/integration/keycloak.integration.test.ts`
   with real Keycloak (~15 tests, est. 4-6h):
   - Full realm lifecycle: create → provision clients → provision roles → disable → enable → delete
   - Token exchange against real realm
   - Error handling with actual Keycloak error responses
3. **Expected coverage gain**: From 2.83% → ~75-85% (target: ≥85%)
4. **Expected overall project impact**: +3-5% overall coverage (76.5% → ~80%)

### Gap 2: Adversarial Review (Task 7.2 — Partially Complete)

**Problem**: Task 7.2 (`/forge-review`) was executed and produced findings
(11 issues: 2 CRITICAL, 4 HIGH, 3 MEDIUM, 2 LOW). 9 of 11 issues were fixed.
2 issues deferred (1 MEDIUM, 1 LOW). The task checkbox remains unchecked in
tasks.md because the full review cycle was not formally closed.

**Recommended action**: Mark Task 7.2 as complete in tasks.md with a note
documenting the 2 deferred issues.

### Gap 3: ADR-015 Provisioning Orchestration Alignment

**Problem**: Phase 3 of this plan assumed `TenantService.createTenant()` would
call `provisionRealmClients()` and `provisionRealmRoles()` directly. ADR-015
(accepted 2026-02-22) introduced a `ProvisioningOrchestrator` with step-based
execution, retry, and rollback. The underlying `KeycloakService` methods are
unchanged, but the orchestration layer is different from what the plan described.

**Impact**: Low — the plan's architectural intent is preserved (Keycloak
provisioning with retry and rollback), but the implementation uses a more
robust pattern than originally planned. This is an improvement, not a
regression.

**Action**: No code changes needed. This appendix documents the deviation for
traceability.

## Appendix E: Plan-vs-Actuals Discrepancies (Refresh #2)

> **Added**: 2026-02-22 (refresh #2). These discrepancies were identified by
> comparing the plan against the current codebase. All are documentation-only
> corrections — the implementation is correct; the plan was stale.

### Discrepancy #1: User Status Type — String vs Enum (CORRECTED)

| Aspect                    | Plan (before)                 | Actual                           | Corrected       |
| ------------------------- | ----------------------------- | -------------------------------- | --------------- |
| §2.2 `status` column type | `String @default("active")`   | `UserStatus @default(ACTIVE)`    | ✅ §2.2 updated |
| Status values             | `"active" \| "deactivated"`   | `ACTIVE \| SUSPENDED \| DELETED` | ✅ §2.2 updated |
| §4.3 `softDelete`         | Sets `status = "deactivated"` | Sets `status = DELETED`          | ⚠️ Note only    |

**Assessment**: The enum is stricter than the planned string type. The
`SUSPENDED` value (not in original plan) supports tenant-level user suspension.
The `DELETED` value replaces the plan's `"deactivated"` string. This is an
improvement — enums provide type safety and prevent invalid status values.

### Discrepancy #2: Missing `idx_users_status` Index (DOCUMENTED)

| Aspect                 | Plan                                         | Actual                |
| ---------------------- | -------------------------------------------- | --------------------- |
| §2.3 Index on `status` | `@@index([status], map: "idx_users_status")` | Not present in schema |

**Assessment**: The `UserStatus` enum has only 3 values (`ACTIVE`, `SUSPENDED`,
`DELETED`). With such low cardinality, a B-tree index provides poor selectivity
and may be counterproductive (index maintenance cost > query benefit). The plan's
index was reasonable for a string column but is less useful for a 3-value enum.
If query profiling shows slow status-filtered queries at scale, the index can
be added. No action required now.

### Discrepancy #3: AuthService Method Signatures (CORRECTED)

| Method          | Plan Signature                 | Actual Signature                                 | Change                                                              |
| --------------- | ------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------- |
| `exchangeCode`  | `(code, tenantSlug)`           | `(tenantSlug, code, redirectUri, codeVerifier?)` | Param order swapped; `redirectUri` added; PKCE `codeVerifier` added |
| `refreshTokens` | `(refreshToken)`               | `(tenantSlug, refreshToken)`                     | `tenantSlug` added as first param                                   |
| `revokeTokens`  | `(accessToken, refreshToken?)` | `(tenantSlug, token, tokenType)`                 | Complete signature change; uses `tokenType` discriminator           |

**Assessment**: All changes are improvements. Adding `tenantSlug` to every
method ensures tenant validation occurs in the service layer (Art. 3.2, Art. 5.1).
PKCE support (`codeVerifier`) enhances security for public clients (Art. 1.2).
The `tokenType` discriminator in `revokeTokens` is cleaner than separate params.
Plan §4.1 corrected.

### Discrepancy #4: Error Code — AUTH_TOKEN_MISSING vs AUTH_MISSING_TOKEN

| Location                     | Code Used                       |
| ---------------------------- | ------------------------------- |
| Plan §3.5 (GET `/auth/me`)   | `AUTH_MISSING_TOKEN` (original) |
| Spec Section 8 error codes   | `AUTH_MISSING_TOKEN`            |
| `auth.ts` middleware line 40 | `AUTH_TOKEN_MISSING`            |

**Assessment**: The implementation uses `AUTH_TOKEN_MISSING` while the spec
defines `AUTH_MISSING_TOKEN`. Both are valid error codes conveying the same
meaning. This is a minor naming inconsistency.

**Recommended action**: Either update the spec to match the implementation
(`AUTH_TOKEN_MISSING`) or update the middleware to match the spec
(`AUTH_MISSING_TOKEN`). The middleware is the more practical fix since it's
a single line change. Severity: LOW.

**Plan correction**: §3.5 updated to show `AUTH_TOKEN_MISSING` (matching
the implementation) with a note about the spec inconsistency.

### Discrepancy #5: Possible Test File Duplication

| File                           | Tests | Lines |
| ------------------------------ | ----- | ----- |
| `unit/auth-middleware.test.ts` | 38    | 988   |
| `unit/auth.middleware.test.ts` | ~54   | 1,296 |

**Assessment**: Two test files with near-identical names (`auth-middleware` vs
`auth.middleware`) exist for middleware tests. Both are listed in Appendix C
as containing valid tests. This may be intentional (different aspects of the
middleware) or accidental duplication. Needs investigation during Sprint 5.

**Recommended action**: Review both files for overlapping test coverage. If
duplicate, consolidate into one file following the kebab-case convention
(`auth-middleware.test.ts` per Art. 7.1). Severity: LOW.

### Discrepancy #6: Return Type — TokenResponse vs KeycloakTokenResponse

| Method          | Plan Return Type | Actual Return Type      |
| --------------- | ---------------- | ----------------------- |
| `exchangeCode`  | `TokenResponse`  | `KeycloakTokenResponse` |
| `refreshTokens` | `TokenResponse`  | `KeycloakTokenResponse` |

**Assessment**: The plan defined a generic `TokenResponse` interface in
`auth.types.ts`, but the implementation directly uses `KeycloakTokenResponse`
from `keycloak.service.ts`. This tighter coupling to the Keycloak type is
acceptable since Keycloak is the only auth provider. If a second provider
is added in the future, a mapping layer would be needed. Corrected in §4.1.

### Discrepancy #7: ADR-017 (ABAC Engine) Not Cross-Referenced

**Assessment**: ADR-017 defines an ABAC (Attribute-Based Access Control) engine
for Spec 003 (Authorization). The ABAC engine interacts with the auth middleware
(`auth.ts`) for permission evaluation. This ADR was not in the plan's
cross-references. Added to cross-references table.

### Summary

| #   | Discrepancy                              | Severity                  | Action Taken                  |
| --- | ---------------------------------------- | ------------------------- | ----------------------------- |
| 1   | UserStatus enum vs String                | LOW (improvement)         | §2.2 corrected                |
| 2   | Missing idx_users_status                 | LOW (by design)           | §2.3 documented               |
| 3   | AuthService method signatures            | MEDIUM (plan stale)       | §4.1 corrected                |
| 4   | AUTH_TOKEN_MISSING vs AUTH_MISSING_TOKEN | LOW (naming only)         | §3.5 updated, fix recommended |
| 5   | Possible test file duplication           | LOW                       | Investigate in Sprint 5       |
| 6   | TokenResponse vs KeycloakTokenResponse   | LOW (acceptable coupling) | §4.1 corrected                |
| 7   | ADR-017 not cross-referenced             | LOW                       | Cross-references updated      |

**Overall assessment**: No architectural issues. All discrepancies are
documentation corrections or minor naming inconsistencies. The implementation
is correct and improves on the plan's original design in several areas
(enum type safety, PKCE support, tenant-scoped method signatures).
