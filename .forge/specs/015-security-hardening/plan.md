# Plan: 015 - Security Hardening — GitHub Code Scanning Remediation

> Technical implementation plan for resolving all 36 open GitHub Code Scanning
> (CodeQL) alerts across 9 vulnerability classes. No new database tables,
> no breaking API changes, no new backend endpoints.
> Created by the `forge-architect` agent via `/forge-plan`.

| Field  | Value                                         |
| ------ | --------------------------------------------- |
| Status | Draft                                         |
| Author | forge-architect                               |
| Date   | 2026-03-09                                    |
| Track  | Feature                                       |
| Spec   | `.forge/specs/015-security-hardening/spec.md` |

---

## 1. Architecture Overview

### 1.1 Summary

This plan addresses 36 CodeQL alerts across 9 vulnerability classes with
targeted, minimal-blast-radius fixes that reuse existing infrastructure
wherever possible. No new services, no new database tables, no new API
endpoints — only new utility functions, middleware wiring, CI config changes,
and frontend sanitization.

### 1.2 Fix Strategy by Vulnerability Class

```
┌──────────────────────────────────────────────────────────────────────┐
│  ERROR SEVERITY (5 alerts — must ship first)                        │
│                                                                     │
│  SSRF (3 alerts)                Path Traversal (2 alerts)           │
│  keycloak.service.ts            i18n.service.ts                     │
│  ├─ assertKeycloakUrl()         ├─ path.resolve() + prefix check   │
│  └─ validateRealmName() ext.    ├─ Zod locale schema               │
│                                 └─ Zod namespace schema             │
├──────────────────────────────────────────────────────────────────────┤
│  WARNING SEVERITY (31 alerts)                                       │
│                                                                     │
│  Rate Limiting (11)     Log Injection (4)    Actions Perms (6)      │
│  6 route files          3 service files      2 workflow files       │
│  ├─ @fastify/rate-limit ├─ Pino structured   ├─ permissions: block  │
│  ├─ 3-tier env config   │  context objects    └─ per-job scopes     │
│  └─ Redis key pattern   └─ No string interp.                       │
│                                                                     │
│  XSS (3)                ReDoS (2)            Incomplete Sanit. (4)  │
│  2 frontend files       2 files              4 test files           │
│  ├─ DOMPurify (ADR-032) ├─ CodeQL suppress   ├─ glob-to-regex mock  │
│  ├─ validateImageUrl()  └─ Benchmark tests   └─ shared mock utility │
│  └─ SafeImage component                                            │
│                                                                     │
│  Insecure Random (1)                                                │
│  test-database.helper.ts                                            │
│  └─ crypto.randomUUID()                                             │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.3 Key Architectural Decisions

| Decision                                               | Rationale                                                                                     | ADR Ref |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------- |
| `assertKeycloakUrl()` URL allowlist helper             | Simplest correct approach; validates at call site, no middleware overhead                     | —       |
| `path.resolve()` + prefix check for path traversal     | Standard Node.js pattern; no external deps; Constitution Art. 5.3.1 (Zod validation)          | —       |
| Reuse `@fastify/rate-limit` (already `^10.3.0`)        | Already installed and configured; no new dependency; Constitution Art. 2.2 compliance         | —       |
| 3-tier env-configurable rate limits                    | Sensible defaults with operator override; no admin UI needed                                  | —       |
| Structured Pino logging (context objects)              | Aligns with Constitution Art. 6.3; Pino already the project standard                          | —       |
| DOMPurify v3.x for HTML/CSS XSS sanitization           | Industry standard (~10M weekly downloads); OWASP recommended; eliminates custom CSS sanitizer | ADR-032 |
| CodeQL suppression for confirmed ReDoS false positives | Both patterns are O(n); suppression + benchmark test is the correct resolution                | —       |
| Minimal GitHub Actions permissions per job             | Principle of least privilege; Constitution Art. 9 compliance                                  | —       |

---

## 2. Data Model

### 2.1 New Tables

**None.** No database schema changes required for this spec.

### 2.2 Modified Tables

**None.** No column additions, type changes, or migrations.

### 2.3 Indexes

**None.**

### 2.4 Migrations

**None.** All fixes are in application code, test code, CI configuration, and
frontend components. The only data-adjacent change is rate-limit state stored
in Redis using existing `@fastify/rate-limit` key patterns.

---

## 3. API Endpoints

### 3.1 No New Endpoints

No new API endpoints are introduced. Existing endpoints gain rate limiting,
which adds a single new response status to their API contract:

### 3.2 New Response: HTTP 429 (Rate Limited)

**Applies to**: All routes receiving rate limiting (see §7 Phase 3)

- **Status**: 429 Too Many Requests
- **Headers**: `Retry-After: {seconds}`
- **Response Body** (Constitution Art. 6.2 compliant):

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please retry after {N} seconds",
    "details": {
      "retryAfter": 60
    }
  }
}
```

### 3.3 Rate Limit Tiers

| Environment Variable | Default     | Key Format                       | Routes                                                                    |
| -------------------- | ----------- | -------------------------------- | ------------------------------------------------------------------------- |
| `RATE_LIMIT_AUTH`    | 20 req/min  | `rl:auth:{tenantId}:{userId}`    | `auth.ts`                                                                 |
| `RATE_LIMIT_ADMIN`   | 60 req/min  | `rl:admin:{tenantId}:{userId}`   | `tenant-admin.ts`, `jobs.routes.ts`, `storage.routes.ts` (uploads)        |
| `RATE_LIMIT_GENERAL` | 120 req/min | `rl:general:{tenantId}:{userId}` | `search.routes.ts`, `notification.routes.ts`, `storage.routes.ts` (reads) |

---

## 4. Component Design

### 4.1 `assertKeycloakUrl()` — SSRF Prevention Helper

- **Purpose**: Validate that a constructed URL targets the configured Keycloak host
- **Location**: `apps/core-api/src/services/keycloak-url-validator.ts`
- **Responsibilities**:
  - Parse the constructed URL via `new URL()`
  - Compare hostname and protocol against parsed `KEYCLOAK_URL`
  - Throw `Error('SSRF_BLOCKED')` on mismatch
  - Normalize trailing slashes in base URL comparison
- **Dependencies**: `node:url` (built-in)
- **Key Methods**:

  | Method               | Parameters    | Returns | Description                                          |
  | -------------------- | ------------- | ------- | ---------------------------------------------------- |
  | `assertKeycloakUrl`  | `url: string` | `void`  | Throws `SSRF_BLOCKED` if URL doesn't match allowlist |
  | `getKeycloakBaseUrl` | —             | `URL`   | Returns parsed `KEYCLOAK_URL`; throws if unset       |

### 4.2 `sanitizeCss()` — CSS Sanitization Utility

- **Purpose**: Sanitize CSS strings before `dangerouslySetInnerHTML` injection
- **Location**: `packages/ui/src/utils/sanitize-css.ts`
- **Responsibilities**:
  - Import and configure DOMPurify for CSS-safe sanitization
  - Strip `</style>` tags, `<script>` tags, `expression()` calls
  - Strip `javascript:` URLs in `url()` values
  - Strip `@import` rules (CSS exfiltration prevention)
  - Preserve valid CSS properties, selectors, and HTTPS URLs
- **Dependencies**: `dompurify` (ADR-032)
- **Key Methods**:

  | Method        | Parameters    | Returns  | Description                  |
  | ------------- | ------------- | -------- | ---------------------------- |
  | `sanitizeCss` | `css: string` | `string` | Returns sanitized CSS string |

### 4.3 `validateImageUrl()` — URL Scheme Validation Utility

- **Purpose**: Validate `<img src>` URLs against an allowlist of safe schemes
- **Location**: `packages/ui/src/utils/validate-image-url.ts`
- **Responsibilities**:
  - Validate URL scheme is `https://`, `http://`, or `data:image/`
  - Reject `javascript:`, `data:text/html`, and other dangerous schemes
  - Return `null` for invalid URLs (safe for `<img src={null}>`)
- **Dependencies**: None
- **Key Methods**:

  | Method             | Parameters    | Returns          | Description                          |
  | ------------------ | ------------- | ---------------- | ------------------------------------ |
  | `validateImageUrl` | `url: string` | `string \| null` | Returns URL if valid, null otherwise |

### 4.4 `<SafeImage>` — Reusable Safe Image Component

- **Purpose**: Reusable `<img>` wrapper with URL scheme validation
- **Location**: `packages/ui/src/components/SafeImage/SafeImage.tsx`
- **Responsibilities**:
  - Accept standard `<img>` props plus `src: string`
  - Validate `src` via `validateImageUrl()` before rendering
  - Render nothing (or fallback) for invalid URLs
- **Dependencies**: `validateImageUrl`

### 4.5 `globToRegex()` — Shared Test Mock Utility

- **Purpose**: Properly convert Redis glob patterns to regex for test mocks
- **Location**: `apps/core-api/src/__tests__/setup/mock-redis-keys.ts`
- **Responsibilities**:
  - Escape all regex metacharacters in the glob pattern
  - Replace `*` with `.*`
  - Wrap in `^...$` anchors
  - Handle multiple `*` characters correctly
- **Dependencies**: None
- **Key Methods**:

  | Method        | Parameters        | Returns  | Description                               |
  | ------------- | ----------------- | -------- | ----------------------------------------- |
  | `globToRegex` | `pattern: string` | `RegExp` | Converts Redis glob pattern to safe regex |

---

## 5. File Map

> **Note**: All paths are relative to the project root.

### Files to Create

| Path                                                   | Purpose                                       | Estimated Size |
| ------------------------------------------------------ | --------------------------------------------- | -------------- |
| `apps/core-api/src/services/keycloak-url-validator.ts` | SSRF prevention: `assertKeycloakUrl()` helper | S (~60 LOC)    |
| `packages/ui/src/utils/sanitize-css.ts`                | CSS sanitization via DOMPurify                | S (~40 LOC)    |
| `packages/ui/src/utils/validate-image-url.ts`          | URL scheme allowlist validator                | S (~30 LOC)    |
| `packages/ui/src/components/SafeImage/SafeImage.tsx`   | Reusable `<SafeImage>` component              | S (~30 LOC)    |
| `packages/ui/src/components/SafeImage/index.ts`        | Barrel export for SafeImage                   | S (~3 LOC)     |
| `apps/core-api/src/__tests__/setup/mock-redis-keys.ts` | Shared glob-to-regex test utility             | S (~25 LOC)    |

### New Test Files

| Path                                                                       | Purpose                                           | Estimated Size |
| -------------------------------------------------------------------------- | ------------------------------------------------- | -------------- |
| `apps/core-api/src/__tests__/services/unit/keycloak-url-validator.test.ts` | SSRF prevention unit tests (FR-004)               | M (~120 LOC)   |
| `apps/core-api/src/__tests__/i18n/unit/i18n-path-validation.test.ts`       | Path traversal prevention unit tests (FR-008)     | M (~100 LOC)   |
| `apps/core-api/src/__tests__/integration/rate-limiting.test.ts`            | Rate limiting integration tests (FR-014)          | M (~150 LOC)   |
| `packages/ui/src/utils/__tests__/sanitize-css.test.ts`                     | CSS sanitizer unit tests (FR-027)                 | M (~80 LOC)    |
| `packages/ui/src/utils/__tests__/validate-image-url.test.ts`               | URL validation unit tests (FR-028)                | S (~60 LOC)    |
| `apps/core-api/src/__tests__/unit/redos-benchmark.test.ts`                 | ReDoS benchmark regression tests (FR-029, FR-030) | S (~50 LOC)    |
| `apps/core-api/src/__tests__/unit/log-injection.test.ts`                   | Log injection prevention unit tests (FR-018)      | M (~80 LOC)    |

### Files to Modify

| Path                                                                        | Section/Lines               | Change Description                                                                                                                 | Estimated Effort |
| --------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `apps/core-api/src/services/keycloak.service.ts`                            | Lines 681, 743, 801         | Add `assertKeycloakUrl()` call before each `fetch()` (FR-002)                                                                      | S                |
| `apps/core-api/src/modules/i18n/i18n.service.ts`                            | Lines 178, 193              | Add `path.resolve()` + prefix check; add Zod schemas (FR-005–FR-007)                                                               | S                |
| `apps/core-api/src/routes/tenant-admin.ts`                                  | Line 260                    | Register `@fastify/rate-limit` at plugin scope (FR-009)                                                                            | S                |
| `apps/core-api/src/routes/auth.ts`                                          | Line 255                    | Verify `authRateLimitHook`; add CodeQL suppression if needed (FR-010)                                                              | S                |
| `apps/core-api/src/modules/notifications/notification-stream.routes.ts`     | Lines 123, 154              | Apply rate limit to line 123; document SSE suppression at 154 (FR-011)                                                             | S                |
| `apps/core-api/src/modules/jobs/jobs.routes.ts`                             | Line 53                     | Register rate limiting middleware (FR-012)                                                                                         | S                |
| `apps/core-api/src/modules/search/search.routes.ts`                         | Line 56                     | Register rate limiting middleware (FR-012)                                                                                         | S                |
| `apps/core-api/src/modules/notifications/notification.routes.ts`            | Line 45                     | Register rate limiting middleware (FR-012)                                                                                         | S                |
| `apps/core-api/src/modules/storage/storage.routes.ts`                       | Line 44                     | Register rate limiting middleware (FR-012)                                                                                         | S                |
| `packages/event-bus/src/services/topic-manager.ts`                          | Lines 73, 184               | Accept `logger?: pino.Logger` via constructor injection; replace `console.log`/`console.error` with structured Pino calls (FR-015) | S                |
| `packages/event-bus/package.json`                                           | peerDependencies            | Add `"pino": "^9.0.0"` as peerDependency (FR-015, T015-18a)                                                                        | S                |
| `apps/plugin-analytics/backend/src/routes/analytics.routes.ts`              | Line 67                     | Replace `console.error` with Pino; fix `any` type (FR-016)                                                                         | S                |
| `apps/core-api/src/services/minio-client.ts`                                | Line 66                     | Replace `console.error` with Pino (FR-017)                                                                                         | S                |
| `.github/workflows/ci-tests.yml`                                            | Lines 22, 53, 319, 370, 412 | Add top-level `permissions: read-all`; per-job scopes (FR-019–FR-020)                                                              | S                |
| `.github/workflows/deploy.yml`                                              | Line 10                     | Add top-level `permissions:` with minimal scopes (FR-021)                                                                          | S                |
| `packages/ui/src/components/ThemePreview/ThemePreview.tsx`                  | Lines 89, 101               | Sanitize CSS via `sanitizeCss()`; validate logo URL (FR-023, FR-024)                                                               | S                |
| `apps/web/src/routes/admin.settings.tsx`                                    | Line 242                    | Use `<SafeImage>` or `validateImageUrl()` (FR-025)                                                                                 | S                |
| `packages/sdk/src/api-client.ts`                                            | Line 40                     | Add CodeQL suppression comment (FR-029)                                                                                            | S                |
| `apps/core-api/src/modules/workspace/utils/error-formatter.ts`              | Line 227                    | Add CodeQL suppression comment (FR-030)                                                                                            | S                |
| `apps/core-api/src/__tests__/services/shared-data.test.ts`                  | Line 136                    | Replace naive `replace('*', '.*')` with `globToRegex()` (FR-031)                                                                   | S                |
| `apps/core-api/src/__tests__/services/service-registry.test.ts`             | Line 164                    | Replace `replace('*', '')` with `globToRegex()` or `/\*/g` (FR-032)                                                                | S                |
| `apps/core-api/src/__tests__/plugin/unit/plugin-communication.unit.test.ts` | Line 245                    | Replace naive `replace('*', '.*')` with `globToRegex()` (FR-031)                                                                   | S                |
| `apps/core-api/src/__tests__/unit/error-handling.unit.test.ts`              | Line 279                    | Replace naive HTML strip with test-appropriate assertion (FR-033)                                                                  | S                |
| `test-infrastructure/helpers/test-database.helper.ts`                       | Line 425                    | Replace `Math.random()` with `crypto.randomUUID()` (FR-035)                                                                        | S                |
| `packages/ui/package.json`                                                  | dependencies                | Add `dompurify` and `@types/dompurify` (FR-026, ADR-032)                                                                           | S                |
| `docs/SECURITY.md`                                                          | Multiple sections           | Document SSRF, path traversal, rate limiting, XSS, log injection patterns                                                          | M                |

### Files to Delete

**None.**

### Files to Reference (Read-only)

| Path                                                         | Purpose                                              |
| ------------------------------------------------------------ | ---------------------------------------------------- |
| `.forge/constitution.md`                                     | Validate architectural decisions                     |
| `.forge/knowledge/adr/adr-032-dompurify-xss-sanitization.md` | DOMPurify adoption decision (created with this plan) |
| `apps/core-api/src/middleware/rate-limiter.ts`               | Existing Redis rate limiter middleware pattern       |
| `apps/core-api/src/middleware/auth-rate-limit.ts`            | Existing auth rate limiter reference                 |
| `apps/core-api/src/lib/advanced-rate-limit.ts`               | Existing advanced rate limiter reference             |

---

## 6. Dependencies

### 6.1 New Dependencies

| Package            | Version | Target Package | Purpose                            | ADR     |
| ------------------ | ------- | -------------- | ---------------------------------- | ------- |
| `dompurify`        | `^3.x`  | `packages/ui`  | CSS/HTML XSS sanitization (FR-026) | ADR-032 |
| `@types/dompurify` | `^3.x`  | `packages/ui`  | TypeScript types for DOMPurify     | ADR-032 |

### 6.2 Existing Dependencies (No ADR Required)

| Package               | Version   | Already In                   | Purpose                              |
| --------------------- | --------- | ---------------------------- | ------------------------------------ |
| `@fastify/rate-limit` | `^10.3.0` | `apps/core-api/package.json` | Rate limiting (FR-009 – FR-014)      |
| `node:crypto`         | Built-in  | Node.js ≥ 20                 | `crypto.randomUUID()` (FR-035)       |
| `node:path`           | Built-in  | Node.js runtime              | `path.resolve()` (FR-005)            |
| `pino`                | Existing  | Multiple packages            | Structured logging (FR-015 – FR-017) |
| `zod`                 | Existing  | `apps/core-api`              | Input validation (FR-006, FR-007)    |

### 6.3 Internal Dependencies

- `packages/ui` → `dompurify` (new, ADR-032)
- `apps/web` → `packages/ui` (`SafeImage`, `sanitizeCss`, `validateImageUrl`)
- `apps/core-api` → `keycloak-url-validator.ts` (new internal module)
- Test files → `mock-redis-keys.ts` (new shared test utility)

---

## 7. Implementation Phases

### Phase 1: ERROR-Severity Fixes — SSRF + Path Traversal (Critical)

**Objective**: Resolve all 5 ERROR-severity CodeQL alerts (3 SSRF + 2 Path Traversal).
These are the highest-severity findings and must ship first.

**Story Points**: 8  
**Estimated Hours**: 12h

**Files to Create**:

- `apps/core-api/src/services/keycloak-url-validator.ts`
  - Purpose: `assertKeycloakUrl()` + `getKeycloakBaseUrl()` helper
  - Dependencies: None
  - Estimated effort: 2h
- `apps/core-api/src/__tests__/services/unit/keycloak-url-validator.test.ts`
  - Purpose: SSRF prevention unit tests
  - Dependencies: `keycloak-url-validator.ts`
  - Estimated effort: 2h
- `apps/core-api/src/__tests__/i18n/unit/i18n-path-validation.test.ts`
  - Purpose: Path traversal prevention unit tests
  - Dependencies: Modified `i18n.service.ts`
  - Estimated effort: 2h

**Files to Modify**:

- `apps/core-api/src/services/keycloak.service.ts`
  - Lines: 681, 743, 801
  - Change: Import and call `assertKeycloakUrl(url)` before each `fetch()`
  - Estimated effort: 1h
- `apps/core-api/src/services/keycloak.service.ts`
  - `validateRealmName()` function
  - Change: Extend to reject URL-encoded path separators (`%2f`, `%5c`, etc.)
  - Estimated effort: 0.5h
- `apps/core-api/src/modules/i18n/i18n.service.ts`
  - Lines: 178, 193
  - Change: Add `path.resolve()` + prefix check; add Zod locale/namespace schemas
  - Estimated effort: 1.5h

**Tasks**:

- T015-01: Create `keycloak-url-validator.ts` with `assertKeycloakUrl()`
- T015-02: Wire `assertKeycloakUrl()` into keycloak.service.ts at lines 681, 743, 801
- T015-03: Extend `validateRealmName()` with URL-encoded path separator rejection
- T015-04: Add path traversal prevention to `i18n.service.ts` (`path.resolve()` + prefix check)
- T015-05: Add Zod schemas for locale (BCP 47 subset) and namespace parameters
- T015-06: Write SSRF prevention unit tests (FR-004)
- T015-07: Write path traversal prevention unit tests (FR-008)

---

### Phase 2: CI/CD Security — GitHub Actions Permissions

**Objective**: Resolve all 6 `actions/missing-workflow-permissions` alerts.
These are quick infrastructure fixes with no code impact.

**Story Points**: 3  
**Estimated Hours**: 3h

**Files to Modify**:

- `.github/workflows/ci-tests.yml`
  - Lines: 22, 53, 319, 370, 412
  - Change: Add top-level `permissions: read-all`; add per-job `permissions:` with minimal scopes
  - Estimated effort: 1.5h
- `.github/workflows/deploy.yml`
  - Line: 10
  - Change: Add top-level `permissions:` block with `contents: read`, `packages: write`
  - Estimated effort: 0.5h

**Post-change verification**:

- Push to a feature branch and verify all CI jobs pass with restricted permissions
- Estimated effort: 1h

**Tasks**:

- T015-08: Add top-level and per-job permissions to `ci-tests.yml`
- T015-09: Add top-level permissions to `deploy.yml`
- T015-10: Audit other workflow files for missing permissions (FR-022)
- T015-11: Verify CI passes on feature branch with new permissions

---

### Phase 3: Rate Limiting — 11 Routes Across 6 Files

**Objective**: Resolve all 11 `js/missing-rate-limiting` CodeQL alerts.
Apply rate limiting using existing `@fastify/rate-limit` infrastructure.

**Story Points**: 8  
**Estimated Hours**: 14h

**Files to Create**:

- `apps/core-api/src/__tests__/integration/rate-limiting.test.ts`
  - Purpose: Integration tests verifying 429 responses on 3+ routes
  - Dependencies: Rate-limited routes
  - Estimated effort: 3h

**Files to Modify**:

- `apps/core-api/src/routes/tenant-admin.ts`
  - Line: 260
  - Change: Register `@fastify/rate-limit` at route plugin scope with `RATE_LIMIT_ADMIN` tier.
    Covers all 4 alerts (lines 260, 518, 546, 582) via plugin-scoped registration.
  - Estimated effort: 1.5h
- `apps/core-api/src/routes/auth.ts`
  - Line: 255
  - Change: Verify `authRateLimitHook` coverage; add CodeQL suppression comment if needed
  - Estimated effort: 1h
- `apps/core-api/src/modules/notifications/notification-stream.routes.ts`
  - Lines: 123, 154
  - Change: Apply rate limiter to line 123 (non-stream endpoint); add suppression
    comment + justification at line 154 (SSE stream); add integration test for
    global rate limit on SSE connection attempts
  - Estimated effort: 2h
- `apps/core-api/src/modules/jobs/jobs.routes.ts`
  - Line: 53
  - Change: Register `@fastify/rate-limit` at plugin scope with `RATE_LIMIT_ADMIN` tier
  - Estimated effort: 0.5h
- `apps/core-api/src/modules/search/search.routes.ts`
  - Line: 56
  - Change: Register `@fastify/rate-limit` at plugin scope with `RATE_LIMIT_GENERAL` tier
  - Estimated effort: 0.5h
- `apps/core-api/src/modules/notifications/notification.routes.ts`
  - Line: 45
  - Change: Register `@fastify/rate-limit` at plugin scope with `RATE_LIMIT_GENERAL` tier
  - Estimated effort: 0.5h
- `apps/core-api/src/modules/storage/storage.routes.ts`
  - Line: 44
  - Change: Register `@fastify/rate-limit` at plugin scope; reads use `RATE_LIMIT_GENERAL`,
    uploads use `RATE_LIMIT_ADMIN`
  - Estimated effort: 1h

**Tasks**:

- T015-12: Apply rate limiting to `tenant-admin.ts` route plugin (FR-009)
- T015-13: Verify/suppress rate limiting on `auth.ts` (FR-010)
- T015-14: Apply rate limit to notification-stream non-SSE endpoint; document SSE suppression (FR-011)
- T015-15: Apply rate limiting to `jobs.routes.ts`, `search.routes.ts`, `notification.routes.ts`, `storage.routes.ts` (FR-012)
- T015-16: Implement 3-tier env-configurable rate limits with defaults (FR-013)
- T015-17: Write rate limiting integration tests for 3+ routes (FR-014)

---

### Phase 4: Log Injection — Structured Pino Logging (3 Files)

**Objective**: Resolve all 4 `js/tainted-format-string` CodeQL alerts.
Replace `console.log`/`console.error` with structured Pino logging.

**Story Points**: 6  
**Estimated Hours**: 7h

**Files to Create**:

- `apps/core-api/src/__tests__/unit/log-injection.test.ts`
  - Purpose: Verify user-controlled values appear in Pino context objects, not message strings
  - Dependencies: Modified service files
  - Estimated effort: 1.5h

**Files to Modify**:

- `packages/event-bus/src/services/topic-manager.ts`
  - Lines: 73, 184 (and any other `console.log`/`console.error` calls in the file)
  - Change: Add `logger?: pino.Logger` parameter to `TopicManager` constructor.
    Replace `console.log(...)` / `console.error(...)` with `this.logger.info({ topicName }, 'Topic created')`
    and `this.logger.error({ error, topicName }, 'Topic creation failed')` patterns.
    When logger is omitted (backward compat), use no-op stub.
  - Estimated effort: 1.5h
- `packages/event-bus/package.json`
  - Change: Add `"pino": "^9.0.0"` to `peerDependencies`
  - Estimated effort: 0.1h
- `apps/plugin-analytics/backend/src/routes/analytics.routes.ts`
  - Line: 67
  - Change: Replace `console.error(...)` with `request.log.error({ reportId, error }, 'Failed to run analytics report')`.
    Replace `any` type on catch variable with `unknown`.
  - Estimated effort: 1h
- `apps/core-api/src/services/minio-client.ts`
  - Line: 66
  - Change: Replace `console.error(...)` with Pino structured log.
    Accept logger via constructor injection or use module-level logger.
  - Estimated effort: 1h

**Tasks**:

- T015-18: Replace `console.log`/`console.error` in `topic-manager.ts` with Pino via constructor injection (FR-015)
  - Update `TopicManager` constructor to accept an optional `logger?: pino.Logger` parameter
  - When `logger` is provided, use `logger.info()`/`logger.error()` with structured context objects
  - When `logger` is omitted, fall back to a no-op or `console` (backward compatibility for tests)
  - Update all callers in `apps/core-api` to pass their existing Pino instance
- T015-18a: Add `pino` as `peerDependency` to `packages/event-bus/package.json` (FR-015)
  - Pino is already in the approved stack (Constitution Art. 2.1) — no ADR required
  - Add `"pino": "^9.0.0"` to `peerDependencies` (not `dependencies`) so the consuming app provides the instance
- T015-19: Replace `console.error` in `analytics.routes.ts` with Pino; fix `any` type (FR-016)
- T015-20: Replace `console.error` in `minio-client.ts` with Pino (FR-017)
- T015-21: Write log injection prevention unit tests (FR-018)

---

### Phase 5: Frontend XSS — DOMPurify Adoption + SafeImage

**Objective**: Resolve all 3 `js/xss-through-dom` CodeQL alerts.
Adopt DOMPurify (ADR-032), create CSS sanitizer and URL validator.

**Story Points**: 8  
**Estimated Hours**: 12h

**Files to Create**:

- `packages/ui/src/utils/sanitize-css.ts`
  - Purpose: CSS sanitization via DOMPurify
  - Dependencies: `dompurify`
  - Estimated effort: 2h
- `packages/ui/src/utils/validate-image-url.ts`
  - Purpose: URL scheme allowlist validator
  - Dependencies: None
  - Estimated effort: 1h
- `packages/ui/src/components/SafeImage/SafeImage.tsx`
  - Purpose: Reusable `<SafeImage>` component
  - Dependencies: `validateImageUrl`
  - Estimated effort: 1h
- `packages/ui/src/components/SafeImage/index.ts`
  - Purpose: Barrel export
  - Estimated effort: 0.1h
- `packages/ui/src/utils/__tests__/sanitize-css.test.ts`
  - Purpose: CSS sanitizer tests (FR-027)
  - Estimated effort: 1.5h
- `packages/ui/src/utils/__tests__/validate-image-url.test.ts`
  - Purpose: URL validation tests (FR-028)
  - Estimated effort: 1h

**Files to Modify**:

- `packages/ui/package.json`
  - Change: Add `dompurify` and `@types/dompurify` to dependencies
  - Estimated effort: 0.2h
- `packages/ui/src/components/ThemePreview/ThemePreview.tsx`
  - Lines: 89, 101
  - Change: Import `sanitizeCss()`; wrap `scopedCss` before `dangerouslySetInnerHTML`.
    Import `validateImageUrl()`; validate `logoUrl` before rendering in `<img>`.
  - Estimated effort: 1.5h
- `apps/web/src/routes/admin.settings.tsx`
  - Line: 242
  - Change: Import `SafeImage` from `@plexica/ui`; replace `<img src={logoUrl}>` with `<SafeImage src={logoUrl}>`
  - Estimated effort: 1h

**Tasks**:

- T015-22: Install DOMPurify in `packages/ui` (FR-026, ADR-032)
- T015-23: Create `sanitize-css.ts` utility with DOMPurify (FR-023)
- T015-24: Create `validate-image-url.ts` utility (FR-024)
- T015-25: Create `<SafeImage>` component (FR-025)
- T015-26: Wire `sanitizeCss()` into `ThemePreview.tsx` (FR-023)
- T015-27: Wire `SafeImage` into `admin.settings.tsx` (FR-025)
- T015-28: Write CSS sanitizer unit tests (FR-027)
- T015-29: Write URL validation unit tests (FR-028)

---

### Phase 6: ReDoS False Positive Suppressions (2 Files)

**Objective**: Resolve 2 `js/polynomial-redos` CodeQL alerts via
suppression comments with benchmark regression tests.

**Story Points**: 3  
**Estimated Hours**: 3h

**Files to Create**:

- `apps/core-api/src/__tests__/unit/redos-benchmark.test.ts`
  - Purpose: Benchmark tests confirming O(n) behavior for both regex patterns
  - Dependencies: None
  - Estimated effort: 1.5h

**Files to Modify**:

- `packages/sdk/src/api-client.ts`
  - Line: 40
  - Change: Add CodeQL suppression comment: `// lgtm[js/polynomial-redos] Safe: /\/+$/ is O(n) — single char class, no alternation or nesting. See Spec 015 FR-029.`
  - Estimated effort: 0.2h
- `apps/core-api/src/modules/workspace/utils/error-formatter.ts`
  - Line: 227
  - Change: Add CodeQL suppression comment: `// lgtm[js/polynomial-redos] Safe: /member.*not found/i is O(n) — single .* with literal suffix, no nesting. See Spec 015 FR-030.`
  - Estimated effort: 0.2h

**Tasks**:

- T015-30: Add CodeQL suppression to `api-client.ts` with inline justification (FR-029)
- T015-31: Add CodeQL suppression to `error-formatter.ts` with inline justification (FR-030)
- T015-32: Write ReDoS benchmark regression tests (FR-029, FR-030)

---

### Phase 7: Test Code Sanitization + Insecure Randomness (5 Files)

**Objective**: Resolve 4 `js/incomplete-sanitization` /
`js/incomplete-multi-character-sanitization` alerts in test files and
1 `js/insecure-randomness` alert in test infrastructure.

**Story Points**: 5  
**Estimated Hours**: 5h

**Files to Create**:

- `apps/core-api/src/__tests__/setup/mock-redis-keys.ts`
  - Purpose: Shared `globToRegex()` utility for Redis `keys()` mocking
  - Dependencies: None
  - Estimated effort: 1h

**Files to Modify**:

- `apps/core-api/src/__tests__/services/shared-data.test.ts`
  - Line: 136
  - Change: Import `globToRegex` from `mock-redis-keys.ts`; replace `pattern.replace('*', '.*')` (FR-031)
  - Estimated effort: 0.5h
- `apps/core-api/src/__tests__/services/service-registry.test.ts`
  - Line: 164
  - Change: Import `globToRegex` from `mock-redis-keys.ts`; replace `pattern.replace('*', '')` (FR-032)
  - Estimated effort: 0.5h
- `apps/core-api/src/__tests__/plugin/unit/plugin-communication.unit.test.ts`
  - Line: 245
  - Change: Import `globToRegex` from `mock-redis-keys.ts`; replace naive pattern (FR-031)
  - Estimated effort: 0.5h
- `apps/core-api/src/__tests__/unit/error-handling.unit.test.ts`
  - Line: 279
  - Change: Replace naive HTML strip regex with test-appropriate assertion or comment (FR-033)
  - Estimated effort: 0.5h
- `test-infrastructure/helpers/test-database.helper.ts`
  - Line: 425
  - Change: Replace `Math.random().toString(36).substr(2, 9)` with `crypto.randomUUID()` (FR-035)
  - Estimated effort: 0.5h

**Tasks**:

- T015-33: Create shared `mock-redis-keys.ts` with `globToRegex()` (FR-034)
- T015-34: Update `shared-data.test.ts` to use `globToRegex()` (FR-031)
- T015-35: Update `service-registry.test.ts` to use `globToRegex()` (FR-032)
- T015-36: Update `plugin-communication.unit.test.ts` to use `globToRegex()` (FR-031)
- T015-37: Fix HTML sanitization in `error-handling.unit.test.ts` (FR-033)
- T015-38: Replace `Math.random()` with `crypto.randomUUID()` in test-database.helper (FR-035)
- T015-39: Audit `test-infrastructure/` for other `Math.random()` uses (FR-036)

---

### Phase 8: Documentation + Final Verification

**Objective**: Update `docs/SECURITY.md` with all new security patterns,
verify all tests pass, confirm coverage thresholds.

**Story Points**: 5  
**Estimated Hours**: 6h

**Files to Modify**:

- `docs/SECURITY.md`
  - Multiple sections
  - Change: Add documentation for SSRF prevention, path traversal prevention,
    rate limiting (tiers, env vars, defaults), XSS/CSS sanitization, log injection
    structured logging, ReDoS false-positive analysis methodology
  - Estimated effort: 3h
- `.forge/knowledge/decision-log.md`
  - Active Decisions section
  - Change: Add entry for ADR-032 (DOMPurify) approval, ReDoS false-positive
    resolutions for FR-029/FR-030
  - Estimated effort: 0.5h

**Verification Tasks**:

- Run full test suite: `pnpm test` in `apps/core-api` — 0 failures
- Run coverage: verify ≥ 80% overall, ≥ 85% for new security utilities
- Push to feature branch: verify CI workflows pass with new permissions
- Wait for CodeQL rescan: verify 0 open alerts (may take 24-48h)

**Tasks**:

- T015-40: Update `docs/SECURITY.md` with all new security patterns
  - SSRF prevention: `assertKeycloakUrl()` usage pattern and how to extend allowlists
  - Path traversal prevention: `path.resolve()` + prefix check pattern
  - XSS/CSS sanitization: DOMPurify `sanitizeCss()` and `SafeImage` usage
  - Log injection: structured Pino logging pattern (context objects, not string interpolation)
  - Rate limiting — **MUST include a three-tier environment variable table**:
    | Variable | Default | Description |
    |---|---|---|
    | `RATE_LIMIT_AUTH` | 20 req/min | Authentication routes (`auth.ts`) |
    | `RATE_LIMIT_ADMIN` | 60 req/min | Admin routes (`tenant-admin.ts`, `jobs.routes.ts`, `storage.routes.ts` uploads) |
    | `RATE_LIMIT_GENERAL` | 120 req/min | General routes (`search.routes.ts`, `notification.routes.ts`, `storage.routes.ts` reads) |
  - ReDoS false-positive analysis methodology
- T015-41: Update decision log with ADR-032 and ReDoS resolutions
- T015-42: Run full test suite and verify 0 regressions (NFR-006)
- T015-43: Verify coverage thresholds (NFR-010)
- T015-44: Verify CI workflows pass with new permissions (FR-022)

---

## 8. Testing Strategy

### 8.1 Unit Tests

| Component                    | Test Focus                                                                                 | FR Ref         |
| ---------------------------- | ------------------------------------------------------------------------------------------ | -------------- |
| `keycloak-url-validator.ts`  | Valid URL passes; mismatched host throws; trailing slash handling; empty env throws        | FR-004         |
| `i18n.service.ts` (modified) | Valid locale resolves; `../../etc/passwd` throws; boundary 64/65 char namespace            | FR-008         |
| `sanitize-css.ts`            | Valid CSS passes; `</style><script>` stripped; `expression()` stripped; `@import` stripped | FR-027         |
| `validate-image-url.ts`      | `https://` passes; `javascript:` rejected; `data:image/` passes; empty string OK           | FR-028         |
| ReDoS benchmarks             | `/\/+$/` < 1ms on 100K chars; `/member.*not found/i` < 10ms on 100K chars                  | FR-029, FR-030 |
| Log injection                | User-controlled values in Pino context, not message string; `\n` doesn't split log         | FR-018         |

### 8.2 Integration Tests

| Scenario                                              | Dependencies               | FR Ref |
| ----------------------------------------------------- | -------------------------- | ------ |
| Rate limiting returns 429 on `tenant-admin.ts`        | Redis, Fastify test server | FR-014 |
| Rate limiting returns 429 on `search.routes.ts`       | Redis, Fastify test server | FR-014 |
| Rate limiting returns 429 on `storage.routes.ts`      | Redis, Fastify test server | FR-014 |
| SSE connection rate limited by global plugin          | Redis, SSE stream endpoint | FR-011 |
| SSRF: Keycloak token exchange succeeds with valid URL | Keycloak mock/stub         | FR-004 |

### 8.3 Test Data Management

- **Rate limit tests**: Must call `redis.flushdb()` or reset rate-limit counters
  in `beforeEach` to prevent inter-test interference (NFR-007)
- **SSRF tests**: Use `KEYCLOAK_URL=https://keycloak.test:8443` as test env var
- **Path traversal tests**: Use a temp directory as `TRANSLATIONS_DIR` in test setup
- **ReDoS benchmarks**: Use `performance.now()` for timing; allow 2x margin for CI variability

---

## 9. Architectural Decisions

| ADR     | Decision                                | Status   |
| ------- | --------------------------------------- | -------- |
| ADR-032 | DOMPurify for HTML/CSS XSS sanitization | Proposed |

All other decisions in this plan reuse existing patterns and dependencies.
No additional ADRs are required because:

1. **`@fastify/rate-limit`** is already installed (`^10.3.0`) — no new dependency
2. **Pino structured logging** is the existing project standard (Constitution Art. 6.3)
3. **`path.resolve()` + prefix check** is a standard Node.js pattern — no library
4. **Zod validation** is the existing input validation framework (Constitution Art. 5.3.1)
5. **CodeQL suppressions** are documentation, not architectural decisions

---

## 10. Task Breakdown

### Summary

| ID       | Title                                                                             | Phase | Story Pts | Priority | Dependencies     | Needs Test |
| -------- | --------------------------------------------------------------------------------- | ----- | --------- | -------- | ---------------- | ---------- |
| T015-01  | Create `keycloak-url-validator.ts`                                                | 1     | 2         | Critical | —                | T015-06    |
| T015-02  | Wire `assertKeycloakUrl()` into keycloak.service.ts                               | 1     | 1         | Critical | T015-01          | T015-06    |
| T015-03  | Extend `validateRealmName()` with encoded path separators                         | 1     | 1         | High     | —                | T015-06    |
| T015-04  | Add path traversal prevention to `i18n.service.ts`                                | 1     | 2         | Critical | —                | T015-07    |
| T015-05  | Add Zod schemas for locale and namespace parameters                               | 1     | 1         | Critical | —                | T015-07    |
| T015-06  | Write SSRF prevention unit tests                                                  | 1     | 2         | Critical | T015-01          | —          |
| T015-07  | Write path traversal prevention unit tests                                        | 1     | 2         | Critical | T015-04          | —          |
| T015-08  | Add permissions to `ci-tests.yml`                                                 | 2     | 1         | High     | —                | T015-11    |
| T015-09  | Add permissions to `deploy.yml`                                                   | 2     | 1         | High     | —                | T015-11    |
| T015-10  | Audit other workflows for missing permissions                                     | 2     | 1         | Medium   | —                | —          |
| T015-11  | Verify CI passes with new permissions                                             | 2     | 1         | High     | T015-08, T015-09 | —          |
| T015-12  | Apply rate limiting to `tenant-admin.ts`                                          | 3     | 2         | High     | —                | T015-17    |
| T015-13  | Verify/suppress rate limiting on `auth.ts`                                        | 3     | 1         | High     | —                | T015-17    |
| T015-14  | Rate limit notification-stream; document SSE suppression                          | 3     | 2         | High     | —                | T015-17    |
| T015-15  | Apply rate limiting to jobs, search, notification, storage routes                 | 3     | 2         | High     | —                | T015-17    |
| T015-16  | Implement 3-tier env-configurable rate limit defaults                             | 3     | 2         | High     | —                | T015-17    |
| T015-17  | Write rate limiting integration tests                                             | 3     | 3         | High     | T015-12–T015-16  | —          |
| T015-18  | Replace console.log/error in `topic-manager.ts` with Pino (constructor injection) | 4     | 2         | Medium   | T015-18a         | T015-21    |
| T015-18a | Add `pino` as peerDependency to `packages/event-bus/package.json`                 | 4     | 1         | Medium   | —                | T015-18    |
| T015-19  | Replace console.error in `analytics.routes.ts` with Pino                          | 4     | 1         | Medium   | —                | T015-21    |
| T015-20  | Replace console.error in `minio-client.ts` with Pino                              | 4     | 1         | Medium   | —                | T015-21    |
| T015-21  | Write log injection prevention unit tests                                         | 4     | 2         | Medium   | T015-18–T015-20  | —          |
| T015-22  | Install DOMPurify in `packages/ui`                                                | 5     | 1         | High     | ADR-032          | —          |
| T015-23  | Create `sanitize-css.ts` utility                                                  | 5     | 2         | High     | T015-22          | T015-28    |
| T015-24  | Create `validate-image-url.ts` utility                                            | 5     | 1         | High     | —                | T015-29    |
| T015-25  | Create `<SafeImage>` component                                                    | 5     | 1         | High     | T015-24          | T015-29    |
| T015-26  | Wire `sanitizeCss()` into `ThemePreview.tsx`                                      | 5     | 1         | High     | T015-23          | T015-28    |
| T015-27  | Wire `SafeImage` into `admin.settings.tsx`                                        | 5     | 1         | High     | T015-25          | T015-29    |
| T015-28  | Write CSS sanitizer unit tests                                                    | 5     | 2         | High     | T015-23          | —          |
| T015-29  | Write URL validation unit tests                                                   | 5     | 1         | High     | T015-24          | —          |
| T015-30  | Add CodeQL suppression to `api-client.ts`                                         | 6     | 1         | Medium   | —                | T015-32    |
| T015-31  | Add CodeQL suppression to `error-formatter.ts`                                    | 6     | 1         | Medium   | —                | T015-32    |
| T015-32  | Write ReDoS benchmark regression tests                                            | 6     | 2         | Medium   | —                | —          |
| T015-33  | Create shared `mock-redis-keys.ts`                                                | 7     | 2         | Medium   | —                | —          |
| T015-34  | Update `shared-data.test.ts` to use `globToRegex()`                               | 7     | 1         | Medium   | T015-33          | —          |
| T015-35  | Update `service-registry.test.ts` to use `globToRegex()`                          | 7     | 1         | Medium   | T015-33          | —          |
| T015-36  | Update `plugin-communication.unit.test.ts` to use `globToRegex()`                 | 7     | 1         | Medium   | T015-33          | —          |
| T015-37  | Fix HTML sanitization in `error-handling.unit.test.ts`                            | 7     | 1         | Medium   | —                | —          |
| T015-38  | Replace `Math.random()` with `crypto.randomUUID()` in test helper                 | 7     | 1         | Medium   | —                | —          |
| T015-39  | Audit `test-infrastructure/` for other `Math.random()` uses                       | 7     | 1         | Low      | —                | —          |
| T015-40  | Update `docs/SECURITY.md` with all new security patterns                          | 8     | 3         | High     | Phase 1–7        | —          |
| T015-41  | Update decision log with ADR-032 and ReDoS resolutions                            | 8     | 1         | Medium   | ADR-032          | —          |
| T015-42  | Run full test suite and verify 0 regressions                                      | 8     | 1         | Critical | Phase 1–7        | —          |
| T015-43  | Verify coverage thresholds ≥ 80% overall, ≥ 85% security utils                    | 8     | 1         | Critical | Phase 1–7        | —          |
| T015-44  | Verify CI workflows pass with new permissions                                     | 8     | 1         | High     | Phase 2          | —          |

---

## 11. Risk Register

| ID    | Risk                                            | Severity | Likelihood | Mitigation                                                                                                                                                                                                                                       |
| ----- | ----------------------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-001 | Rate limiting breaks automated tests            | MEDIUM   | MEDIUM     | NFR-007: Reset rate-limit counters in `beforeEach`. Tests already reset `advanced-rate-limit` caches. New middleware uses same Redis client — flushable in test setup.                                                                           |
| R-002 | SSRF fix breaks Keycloak admin calls            | HIGH     | LOW        | FR-004: Explicit integration test proving token exchange, refresh, revoke succeed. Edge case #1: trailing slash normalization tested. Edge case #2: missing env var fails startup.                                                               |
| R-003 | DOMPurify SSR compatibility                     | LOW      | LOW        | ThemePreview is client-rendered only (Vite CSR app). `sanitize-css.ts` uses `DOMPurify` which requires `window` — but this is only called in browser context. If SSR is needed, use `isomorphic-dompurify` (already noted in spec §13).          |
| R-004 | CodeQL rescan latency                           | LOW      | HIGH       | Suppressions and fixes may take 24-48h to reflect in GitHub Code Scanning dashboard. Plan for async verification in Phase 8 (T015-44). Do not block merge on rescan; merge after all tests pass, verify alerts close asynchronously.             |
| R-005 | GitHub Actions permissions too restrictive      | MEDIUM   | MEDIUM     | T015-11: Test on feature branch before merging. Per-job analysis of required scopes. If a job fails, add the minimum additional scope and document why.                                                                                          |
| R-006 | CSS sanitizer strips legitimate tenant CSS      | MEDIUM   | MEDIUM     | DOMPurify is allowlist-based. FR-027 tests valid CSS pass-through. Edge case #10: valid HTTPS `url()` preserved. If ThemePreview renders incorrectly post-fix, check DOMPurify config options (`FORCE_BODY`, `ADD_TAGS`, `ADD_ATTR`).            |
| R-007 | `isomorphic-dompurify` needed but not installed | LOW      | LOW        | Only install if SSR rendering is confirmed for ThemePreview. Current analysis: ThemePreview is CSR-only → standard `dompurify` is sufficient. If SSR needed, add `isomorphic-dompurify` to `packages/ui` deps (already in spec §13 as optional). |

### New Risks Identified During Planning

| ID    | Risk                                                                | Severity | Likelihood | Mitigation                                                                                                                                                                                                                                                                                              |
| ----- | ------------------------------------------------------------------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-008 | Pino logger not available in `topic-manager.ts` (event-bus package) | MEDIUM   | MEDIUM     | `packages/event-bus` may not have a Pino dependency. Check `packages/event-bus/package.json`. If missing, either: (a) add Pino as a peer dependency, (b) accept a logger instance via constructor injection, or (c) use a minimal console-to-pino adapter. Option (b) is preferred — no new dependency. |
| R-009 | Rate limit env vars not loaded in test environments                 | LOW      | MEDIUM     | Ensure test setup either sets env vars or relies on defaults. Test `beforeEach` should clear rate-limit state regardless of configured limits.                                                                                                                                                          |
| R-010 | DOMPurify `sanitize()` with CSS-only input may over-strip           | LOW      | LOW        | DOMPurify's `FORCE_BODY` mode treats input as HTML body. For CSS-only sanitization, wrap input in `<style>` tags before sanitizing, then extract the CSS content. Test this approach in FR-027 test cases.                                                                                              |

---

## 12. Requirement Traceability

| Requirement | Plan Section     | Implementation Path                                                                 | Task(s)          |
| ----------- | ---------------- | ----------------------------------------------------------------------------------- | ---------------- |
| FR-001      | §4.1, §7 Phase 1 | `keycloak-url-validator.ts` → `assertKeycloakUrl()`                                 | T015-01          |
| FR-002      | §7 Phase 1       | `keycloak.service.ts` lines 681, 743, 801                                           | T015-02          |
| FR-003      | §7 Phase 1       | `keycloak.service.ts` → `validateRealmName()` extension                             | T015-03          |
| FR-004      | §8.1             | `keycloak-url-validator.test.ts`                                                    | T015-06          |
| FR-005      | §7 Phase 1       | `i18n.service.ts` → `path.resolve()` + prefix check                                 | T015-04          |
| FR-006      | §7 Phase 1       | `i18n.service.ts` → Zod locale schema                                               | T015-05          |
| FR-007      | §7 Phase 1       | `i18n.service.ts` → Zod namespace schema                                            | T015-05          |
| FR-008      | §8.1             | `i18n-path-validation.test.ts`                                                      | T015-07          |
| FR-009      | §7 Phase 3       | `tenant-admin.ts` → `@fastify/rate-limit` registration                              | T015-12          |
| FR-010      | §7 Phase 3       | `auth.ts` → verify/suppress                                                         | T015-13          |
| FR-011      | §7 Phase 3       | `notification-stream.routes.ts` → rate limit + SSE suppression                      | T015-14          |
| FR-012      | §7 Phase 3       | `jobs.routes.ts`, `search.routes.ts`, `notification.routes.ts`, `storage.routes.ts` | T015-15          |
| FR-013      | §3.3, §7 Phase 3 | 3-tier env config with defaults                                                     | T015-16          |
| FR-014      | §8.2             | `rate-limiting.test.ts`                                                             | T015-17          |
| FR-015      | §7 Phase 4       | `topic-manager.ts` → Pino structured logging                                        | T015-18          |
| FR-016      | §7 Phase 4       | `analytics.routes.ts` → Pino + `unknown` type                                       | T015-19          |
| FR-017      | §7 Phase 4       | `minio-client.ts` → Pino structured logging                                         | T015-20          |
| FR-018      | §8.1             | `log-injection.test.ts`                                                             | T015-21          |
| FR-019      | §7 Phase 2       | `ci-tests.yml` → top-level `permissions: read-all`                                  | T015-08          |
| FR-020      | §7 Phase 2       | `ci-tests.yml` → per-job minimal permissions                                        | T015-08          |
| FR-021      | §7 Phase 2       | `deploy.yml` → top-level permissions                                                | T015-09          |
| FR-022      | §7 Phase 2       | Audit other workflow files                                                          | T015-10          |
| FR-023      | §4.2, §7 Phase 5 | `sanitize-css.ts` + `ThemePreview.tsx`                                              | T015-23, T015-26 |
| FR-024      | §4.3, §7 Phase 5 | `validate-image-url.ts` + `ThemePreview.tsx`                                        | T015-24, T015-26 |
| FR-025      | §4.4, §7 Phase 5 | `SafeImage.tsx` + `admin.settings.tsx`                                              | T015-25, T015-27 |
| FR-026      | §6.1, §7 Phase 5 | `packages/ui/package.json` → DOMPurify                                              | T015-22          |
| FR-027      | §8.1             | `sanitize-css.test.ts`                                                              | T015-28          |
| FR-028      | §8.1             | `validate-image-url.test.ts`                                                        | T015-29          |
| FR-029      | §7 Phase 6       | `api-client.ts` → CodeQL suppression + benchmark                                    | T015-30, T015-32 |
| FR-030      | §7 Phase 6       | `error-formatter.ts` → CodeQL suppression + benchmark                               | T015-31, T015-32 |
| FR-031      | §7 Phase 7       | `shared-data.test.ts`, `plugin-communication.unit.test.ts` → `globToRegex()`        | T015-34, T015-36 |
| FR-032      | §7 Phase 7       | `service-registry.test.ts` → `globToRegex()`                                        | T015-35          |
| FR-033      | §7 Phase 7       | `error-handling.unit.test.ts` → fix HTML sanitization                               | T015-37          |
| FR-034      | §4.5, §7 Phase 7 | `mock-redis-keys.ts`                                                                | T015-33          |
| FR-035      | §7 Phase 7       | `test-database.helper.ts` → `crypto.randomUUID()`                                   | T015-38          |
| FR-036      | §7 Phase 7       | Audit `test-infrastructure/` for other `Math.random()` uses                         | T015-39          |
| NFR-001     | §3.3, §8.2       | Rate limit P95 < 5ms added latency                                                  | T015-17          |
| NFR-002     | §7 Phase 1       | SSRF validation < 0.1ms                                                             | T015-06          |
| NFR-003     | §7 Phase 1       | Path traversal check < 0.1ms                                                        | T015-07          |
| NFR-004     | §7 Phase 5       | CSS sanitizer < 5ms for 50KB                                                        | T015-28          |
| NFR-005     | §7 Phase 6       | Regex O(n) confirmed via benchmark                                                  | T015-32          |
| NFR-006     | §7 Phase 8       | 0 test regressions                                                                  | T015-42          |
| NFR-007     | §8.3             | Rate limit counters cleared in test `beforeEach`                                    | T015-17          |
| NFR-008     | §7 Phase 8       | 0 ERROR alerts                                                                      | T015-42          |
| NFR-009     | §7 Phase 8       | 0 WARNING alerts                                                                    | T015-42          |
| NFR-010     | §7 Phase 8       | ≥ 85% coverage for new security utils                                               | T015-43          |
| NFR-011     | §3.2             | 429 response follows Art. 6.2 format                                                | T015-17          |
| NFR-012     | §7 Phase 2       | Minimal workflow permissions                                                        | T015-08, T015-09 |

---

## 13. Constitution Compliance

| Article                        | Status       | Notes                                                                                                                                                             |
| ------------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1 — Core Principles       | ✅ Compliant | Art. 1.2.1 Security First: This plan directly addresses 36 known security alerts. Art. 1.2.3 API-First: No breaking API changes; only additive 429 responses.     |
| Art. 2 — Technology Stack      | ✅ Compliant | `@fastify/rate-limit` already approved. DOMPurify approved via ADR-032. No other new dependencies. `node:crypto`, `node:path` are built-in.                       |
| Art. 3 — Architecture Patterns | ✅ Compliant | All fixes follow existing patterns: Fastify plugin-scoped middleware, service-layer validation, shared `@plexica/ui` utilities. No new architectural patterns.    |
| Art. 4 — Quality Standards     | ✅ Compliant | NFR-006: 0 test regressions. NFR-010: ≥ 85% coverage for new security code. 7 new test files covering all security utilities.                                     |
| Art. 5 — Security              | ✅ Addressed | Art. 5.3.1 (Zod): FR-006, FR-007. Art. 5.3.2 (SQL injection): No new SQL. Art. 5.3.3 (XSS): FR-023–FR-028 + ADR-032. Art. 5.4: FR-035, FR-036 (dependency sec).   |
| Art. 6 — Error Handling        | ✅ Compliant | 429 response follows Art. 6.2 format. Log injection fixes align with Art. 6.3 (Pino structured logging). Error codes are stable and documented.                   |
| Art. 7 — Naming & Conventions  | ✅ Compliant | New files: kebab-case (`keycloak-url-validator.ts`, `sanitize-css.ts`). New components: PascalCase (`SafeImage`). New functions: camelCase (`assertKeycloakUrl`). |
| Art. 8 — Testing Standards     | ✅ Compliant | Art. 8.1: Unit + integration tests for all security logic. Art. 8.2: Deterministic, independent, AAA pattern. Art. 8.3: No hardcoded IDs (FR-035).                |
| Art. 9 — Operational Reqs      | ✅ Compliant | Art. 9.1: No breaking migrations (no DB changes). Rate limits env-configurable for rollout tuning. CI permissions verifiable on feature branch before merge.      |

---

## 14. Definition of Done

All of the following MUST be true for this spec to be considered complete
(carried forward from spec §15):

1. **Zero ERROR-severity alerts**: GitHub Code Scanning re-scan reports
   0 `js/request-forgery` alerts and 0 `js/path-injection` alerts.
2. **Zero WARNING-severity alerts**: GitHub Code Scanning re-scan reports
   0 alerts across all 7 WARNING vulnerability classes.
3. **All existing tests pass**: `pnpm test` in `apps/core-api` reports 0 failures.
4. **New tests added**: Unit tests for SSRF (FR-004), path traversal (FR-008),
   rate limiting (FR-014), log injection (FR-018), CSS sanitizer (FR-027),
   URL validation (FR-028), ReDoS benchmarks (FR-029/FR-030).
5. **Coverage maintained**: Overall ≥ 80%. New security utility modules ≥ 85%.
6. **No breaking API changes**: Only additive 429 response on rate-limited routes.
7. **Documentation updated**: `docs/SECURITY.md` updated with rate limit env vars,
   SSRF prevention, path traversal prevention, XSS/CSS sanitization patterns.
8. **CI passes**: All GitHub Actions workflows pass with new permissions blocks.
9. **ADR-032 merged**: DOMPurify adoption ADR accepted.
10. **FORGE review passed**: `/forge-review` reports zero HIGH-severity findings.
11. **TD-023 added to decision-log.md**: Technical debt for 429 client-side handling
    documented in `.forge/knowledge/decision-log.md` (see §15 Technical Debt Created).

---

## 15. Technical Debt Created

This spec introduces the following technical debt that must be tracked:

### TD-023: HTTP 429 Client-Side Handling

**Problem**: The 11 rate-limited routes (Phase 3) will return HTTP 429 responses
with `Retry-After` headers, but neither `apps/web` nor `packages/api-client`
currently handle 429 gracefully. Users will see a generic network error rather
than a "please wait" message with retry guidance.

**Impact**: UX degradation when rate limits are hit. No data loss or security
risk — the backend correctly rejects excess requests. The gap is in the frontend
response to that rejection.

**Scope**:

- `packages/api-client`: Add interceptor/retry logic that reads `Retry-After`
  header and either auto-retries or surfaces a user-friendly message
- `apps/web`: Add a global 429 toast/banner component that shows
  "Too many requests — please wait {N} seconds"
- `apps/super-admin`: Same 429 handling if admin routes are called

**Deferred To**: Sprint 011 (post-Spec 015)

**Decision Log Entry**: TD-023 in `.forge/knowledge/decision-log.md`

---

## Cross-References

| Document              | Path                                                         |
| --------------------- | ------------------------------------------------------------ |
| Spec                  | `.forge/specs/015-security-hardening/spec.md`                |
| ADR-032               | `.forge/knowledge/adr/adr-032-dompurify-xss-sanitization.md` |
| Constitution          | `.forge/constitution.md`                                     |
| Decision Log          | `.forge/knowledge/decision-log.md`                           |
| Security Guide        | `docs/SECURITY.md`                                           |
| Existing Rate Limiter | `apps/core-api/src/middleware/rate-limiter.ts`               |
| Auth Rate Limiter     | `apps/core-api/src/middleware/auth-rate-limit.ts`            |
| Advanced Rate Limiter | `apps/core-api/src/lib/advanced-rate-limit.ts`               |
| Tasks                 | <!-- Created by /forge-tasks -->                             |
