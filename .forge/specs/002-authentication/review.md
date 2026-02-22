# FORGE Code Review — Spec 002: Authentication System

**Date**: February 22, 2026  
**Reviewer**: forge-reviewer (adversarial AI review)  
**Spec**: `002-authentication`  
**Track**: Feature  
**Scope**: Backend implementation only (Phase 7a frontend is not yet implemented)  
**Verdict**: ✅ **APPROVED WITH NOTES** — All 8 issues resolved; human review required before merge (Article 4.2)

---

## Files Reviewed

| File                                               | Lines | Status     |
| -------------------------------------------------- | ----- | ---------- |
| `apps/core-api/src/routes/auth.ts`                 | 1067  | Reviewed   |
| `apps/core-api/src/middleware/auth.ts`             | 555   | Reviewed   |
| `apps/core-api/src/middleware/auth-rate-limit.ts`  | 179   | Reviewed   |
| `apps/core-api/src/services/auth.service.ts`       | 337   | Reviewed   |
| `apps/core-api/src/services/user-sync.consumer.ts` | 524   | Reviewed   |
| `apps/core-api/src/lib/jwt.ts`                     | 334   | Reviewed   |
| `.forge/specs/002-authentication/spec.md`          | 362   | Referenced |

---

## Summary

| Severity  | Count | Must Fix Before Merge |
| --------- | ----- | --------------------- |
| 🔴 HIGH   | 3     | Yes                   |
| 🟡 MEDIUM | 3     | Recommended           |
| 🟢 LOW    | 2     | Optional / tracked    |
| **Total** | **8** |                       |

---

## Dimension 1: Correctness

### ISSUE-001 — `AUTH_TENANT_NOT_FOUND` returns HTTP 403, spec defines HTTP 404

**Severity**: 🔴 HIGH  
**File**: `apps/core-api/src/routes/auth.ts`, lines 273–277  
**Dimension**: Correctness

**Description**: The spec (`spec.md` §8, line 209) explicitly defines `AUTH_TENANT_NOT_FOUND` as HTTP **404**. The route's catch block groups it with `AUTH_TENANT_SUSPENDED` and returns **403** for both:

```typescript
// routes/auth.ts, lines 273–277
const statusCode =
  error.error.code === 'AUTH_TENANT_NOT_FOUND' || error.error.code === 'AUTH_TENANT_SUSPENDED'
    ? 403
    : 500;
```

This same grouping pattern is repeated in the callback handler (lines 463–465) and the logout handler (lines 624–626). The test suite has already hardened against this incorrect behaviour: `auth-routes.test.ts` line 229 asserts `AUTH_TENANT_NOT_FOUND` returns 403, meaning the tests are also wrong.

**Impact**: Frontend clients and API consumers that follow the spec contract will break. 404 vs 403 is a meaningful semantic difference — 403 suggests the caller is authenticated but unauthorised, while 404 correctly indicates the resource does not exist.

**Fix**:

```typescript
// routes/auth.ts — fix all three occurrences
const statusCode =
  error.error.code === 'AUTH_TENANT_NOT_FOUND'
    ? 404
    : error.error.code === 'AUTH_TENANT_SUSPENDED'
      ? 403
      : 500;
```

Also update `auth-routes.test.ts` lines 229, 448, 635 to assert 404 instead of 403.

---

### ISSUE-002 — `AUTH_TOKEN_MISSING` in code vs `AUTH_MISSING_TOKEN` in spec

**Severity**: 🔴 HIGH  
**File**: `apps/core-api/src/middleware/auth.ts`, line 40  
**Dimension**: Correctness

**Description**: The spec (`spec.md` §8, line 204) defines the canonical error code as `AUTH_MISSING_TOKEN`. The middleware, all tests, and the `auth.types.ts` enum all use `AUTH_TOKEN_MISSING` instead. An `AUTH_MISSING_TOKEN` entry does exist in `auth.types.ts` (line 19) but it is never used in implementation.

This is a **breaking contract violation**: any frontend client or external consumer coded against the spec will receive an unexpected error code and will not be able to distinguish "missing token" from other 401 errors.

**Note**: The `plan.md` (Refresh #2, line 1285) acknowledged this discrepancy and deferred the fix. However, since the spec has not been formally amended, the spec is still the source of truth per Article 1.2 (API-First Design).

**Fix (Option A — preferred)**: Update middleware to match the spec:

```typescript
// auth.ts, line 40
code: 'AUTH_MISSING_TOKEN',   // was: AUTH_TOKEN_MISSING
```

Then update all tests and the `AuthErrorCode` enum to use `AUTH_MISSING_TOKEN` consistently. Update `spec.md` §8 note at line 335 to record the resolution.

**Fix (Option B)**: Formally amend `spec.md` §8 to change the canonical code to `AUTH_TOKEN_MISSING`, update the enum to remove `AUTH_MISSING_TOKEN`, and document it as a spec amendment.

Either path is acceptable; the inconsistency itself is not.

---

### ISSUE-003 — `INTERNAL_ERROR` is not a spec-defined error code

**Severity**: 🟡 MEDIUM  
**File**: `apps/core-api/src/routes/auth.ts`, lines 292–296, 483–486, 644–647, 1060–1063  
**Dimension**: Correctness

**Description**: The spec (`spec.md` §8) defines 13 stable error codes. `INTERNAL_ERROR` is **not one of them**. For Keycloak service failures, the spec defines `AUTH_KEYCLOAK_ERROR` (500). The routes' generic catch blocks all fall back to `INTERNAL_ERROR`, leaking an undocumented error code.

The `auth.types.ts` `AuthErrorCode` enum (which formally defines the code contract) does not include `INTERNAL_ERROR`.

**Impact**: Clients cannot reliably handle server errors — they receive an undocumented code not present in the SDK/types. Monitoring systems keyed on spec-defined codes will miss these failures.

**Fix**:

```typescript
// Catch blocks in routes/auth.ts — replace:
code: 'INTERNAL_ERROR';
// with:
code: 'AUTH_KEYCLOAK_ERROR'; // for Keycloak-related catch blocks
// or add a new spec-defined general code:
code: 'AUTH_INTERNAL_ERROR'; // document in spec.md §8
```

---

### ISSUE-004 — `AUTH_CODE_EXCHANGE_FAILED` not in spec error codes

**Severity**: 🟡 MEDIUM  
**File**: `apps/core-api/src/routes/auth.ts`, line 461; `apps/core-api/src/services/auth.service.ts`, line 178  
**Dimension**: Correctness

**Description**: `AUTH_CODE_EXCHANGE_FAILED` is thrown internally by `auth.service.ts` and then propagated as the HTTP response error code. It does not appear in the spec's §8 error code table. The spec provides `AUTH_INVALID_CREDENTIALS` (401) and `AUTH_CODE_EXPIRED` (401) for OAuth callback failure scenarios.

**Fix**: Either add `AUTH_CODE_EXCHANGE_FAILED` to `spec.md` §8 with HTTP mapping, or map it in the route handler to the closest spec-defined code before sending to the client:

```typescript
// routes/auth.ts — in the callback catch block
const clientCode =
  error.error.code === 'AUTH_CODE_EXCHANGE_FAILED'
    ? 'AUTH_INVALID_CREDENTIALS' // or AUTH_CODE_EXPIRED if token-related
    : error.error.code;
```

---

## Dimension 2: Security

### ISSUE-005 — `getClientIP()` blindly trusts `X-Forwarded-For` (IP spoofing)

**Severity**: 🔴 HIGH  
**File**: `apps/core-api/src/middleware/auth-rate-limit.ts`, lines 133–141  
**Dimension**: Security  
**Constitution Reference**: Article 5.3 (Input Validation)

**Description**: The rate limiter extracts the client IP from the `X-Forwarded-For` header without any trust validation:

```typescript
function getClientIP(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ip.trim(); // ← blindly trusted, attacker-controlled
  }
  return request.ip || 'unknown';
}
```

An attacker can send `X-Forwarded-For: 1.2.3.4` in any request and be rate-limited against `1.2.3.4` instead of their real IP. This **completely defeats the rate limiter** — a single attacker can cycle through arbitrary IPs and make unlimited login attempts.

`X-Forwarded-For` should only be trusted when the request arrives from a known/trusted proxy (e.g. a configured CIDR range, or Fastify's `trustProxy` setting). When no trusted proxy is configured, the raw socket IP should be used exclusively.

**Fix**:

```typescript
// Option A: Use Fastify's built-in trustProxy (configure in server setup)
// fastify = Fastify({ trustProxy: '10.0.0.0/8' })
// Then use request.ip which Fastify resolves correctly

// Option B: Validate proxy origin in getClientIP
function getClientIP(request: FastifyRequest): string {
  const TRUSTED_PROXY_CIDRS = process.env.TRUSTED_PROXY_CIDRS?.split(',') ?? [];
  const socketIp = request.socket.remoteAddress ?? 'unknown';

  if (TRUSTED_PROXY_CIDRS.length > 0 && isFromTrustedProxy(socketIp, TRUSTED_PROXY_CIDRS)) {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      return ip.trim();
    }
  }
  return socketIp;
}
```

**Note**: This is a **critical security issue** that renders the rate limiter non-functional against any attacker who knows to set the header. It must be fixed before production deployment.

---

### ISSUE-006 — JWT `tenant` claim checked before issuer URL (tenant claim priority confusion)

**Severity**: 🟡 MEDIUM  
**File**: `apps/core-api/src/lib/jwt.ts`, lines 181–188  
**Dimension**: Security

**Description**: `verifyTokenWithTenant()` resolves `tenantSlug` from the custom `payload.tenant` claim _first_, then falls back to the issuer URL:

```typescript
if (payload.tenant) {
  tenantSlug = payload.tenant; // ← attacker-influenced custom claim
} else if (payload.iss) {
  const issuerMatch = payload.iss.match(/\/realms\/([^/]+)$/);
  if (issuerMatch) tenantSlug = issuerMatch[1]; // ← authoritative
}
```

The custom `tenant` claim is not part of the standard JWT structure and may be settable by clients via Keycloak's claim mapping configuration. If an attacker can influence this claim (e.g. via a misconfigured Keycloak mapper), they could redirect JWKS validation to a different realm's endpoint, potentially accepting tokens signed by a realm they control.

The issuer URL (`iss`) is the authoritative identifier. It should be the _primary_ source; the custom `tenant` claim should only be used as a fallback for legacy tokens.

**Fix**:

```typescript
// lib/jwt.ts — reverse priority
if (payload.iss) {
  const issuerMatch = payload.iss.match(/\/realms\/([^/]+)$/);
  if (issuerMatch) tenantSlug = issuerMatch[1];
} else if (payload.tenant) {
  // Legacy fallback — log a warning
  logger.warn(
    { eventId: payload.jti },
    'JWT using legacy tenant claim; migrate to issuer-based detection'
  );
  tenantSlug = payload.tenant;
}
```

---

## Dimension 3: Performance

### ISSUE-007 — Double validation: Fastify AJV + manual Zod on every request

**Severity**: 🟢 LOW  
**File**: `apps/core-api/src/routes/auth.ts`, line 243 (and similar in callback/logout handlers)  
**Dimension**: Performance & Maintainability

**Description**: Every route handler defines a Fastify JSON Schema (validated by AJV at the framework level) _and_ also runs `Schema.safeParse()` manually on the same input:

```typescript
// Route already declares: schema: { querystring: { type: 'object', properties: {...} } }
// But handler also does:
const validation = LoginQuerySchema.safeParse(request.query); // ← redundant second parse
```

This means every authenticated request runs two full input validation passes. For high-traffic endpoints (login, callback), this doubles validation overhead unnecessarily.

**Fix**: Choose one validation strategy:

- **Fastify AJV only** (preferred for performance): Remove manual Zod parse; rely on Fastify to reject invalid input with a 400 before the handler runs.
- **Zod only**: Remove the Fastify JSON Schema from `schema.querystring` and keep the manual parse.

The Zod approach is slightly more ergonomic for TypeScript inference; the AJV approach is faster. Either is acceptable — but not both.

---

## Dimension 4: Maintainability

### ISSUE-008 — Singleton `UserSyncConsumer` initialised with `null as any`

**Severity**: 🟢 LOW  
**File**: `apps/core-api/src/services/user-sync.consumer.ts`, lines 521–523  
**Dimension**: Maintainability & Correctness

**Description**: The exported singleton is constructed with a `null` EventBus, explicitly bypassing TypeScript:

```typescript
export const userSyncConsumer = new UserSyncConsumer(
  null as any // Placeholder - will be initialized in index.ts
);
```

If this singleton is ever accessed before `index.ts` injects the real EventBus (e.g. in test setup, during module loading, or due to a future import order change), it will throw a null reference error at runtime with no helpful message.

**Fix**: Use lazy initialisation or an explicit "not-yet-initialised" guard:

```typescript
// Option A: lazy singleton with factory
let _userSyncConsumer: UserSyncConsumer | null = null;
export function getUserSyncConsumer(): UserSyncConsumer {
  if (!_userSyncConsumer) throw new Error('UserSyncConsumer not initialised — call initUserSyncConsumer() first');
  return _userSyncConsumer;
}
export function initUserSyncConsumer(bus: EventBusService): void {
  _userSyncConsumer = new UserSyncConsumer(bus);
}

// Option B: constructor guard
constructor(private eventBus: EventBusService) {
  if (!eventBus) throw new Error('UserSyncConsumer requires a valid EventBusService');
}
```

---

## Dimension 5: Constitution Compliance

| Article                          | Requirement                                        | Status                                         |
| -------------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| Art. 1.2 (API-First)             | Versioned REST, backward compat error codes        | ⚠️ Violated — ISSUE-001, ISSUE-002, ISSUE-003  |
| Art. 3.4 (Error Format)          | Stable error codes documented in spec              | ⚠️ Violated — ISSUE-003, ISSUE-004             |
| Art. 5.3 (Input Validation)      | All external input validated; injection prevention | ⚠️ Violated — ISSUE-005 (header not validated) |
| Art. 4.1 (Test Coverage)         | ≥80% coverage; no regressions                      | ✅ Tests exist; see TD-001 note                |
| Art. 6.2 (Error Response Format) | Stable codes, no stack traces                      | ⚠️ Partial — ISSUE-003 uses undocumented code  |
| Art. 6.3 (Logging)               | No PII/secrets in logs                             | ✅ Logging reviewed — compliant                |
| Art. 8.1 (Test Types)            | Unit + integration + E2E required                  | ✅ All three present                           |

**Constitution compliance issues are a direct consequence of ISSUE-001 through ISSUE-005 above** — no additional separate findings.

---

## Dimension 6: UX Quality

_Scope note_: Frontend (Phase 7a) is not yet implemented. UX review covers error-facing surface only — what error messages and codes API consumers receive.

| Finding                             | Severity  | Notes                                                                                      |
| ----------------------------------- | --------- | ------------------------------------------------------------------------------------------ |
| `AUTH_TENANT_NOT_FOUND` returns 403 | 🔴 HIGH   | Frontend cannot distinguish "not found" from "forbidden" — same UX treatment will be wrong |
| `INTERNAL_ERROR` code undocumented  | 🟡 MEDIUM | Frontend cannot handle server errors with specific messaging                               |
| `AUTH_TOKEN_MISSING` vs spec        | 🔴 HIGH   | Frontend code generation from spec types will produce wrong error handling                 |

When Phase 7a is implemented, a full UX review against `design-spec.md` and `user-journey.md` will be required.

---

## Issues Register

| ID        | Severity  | Dimension       | File                                    | Description                                                 |
| --------- | --------- | --------------- | --------------------------------------- | ----------------------------------------------------------- |
| ISSUE-001 | 🔴 HIGH   | Correctness     | `routes/auth.ts:273–277`                | `AUTH_TENANT_NOT_FOUND` returns 403 (spec: 404)             |
| ISSUE-002 | 🔴 HIGH   | Correctness     | `middleware/auth.ts:40`                 | `AUTH_TOKEN_MISSING` vs spec-defined `AUTH_MISSING_TOKEN`   |
| ISSUE-005 | 🔴 HIGH   | Security        | `middleware/auth-rate-limit.ts:133–141` | `X-Forwarded-For` blindly trusted — rate limiter bypassable |
| ISSUE-003 | 🟡 MEDIUM | Correctness     | `routes/auth.ts:292,483,644,1060`       | `INTERNAL_ERROR` not in spec error codes                    |
| ISSUE-004 | 🟡 MEDIUM | Correctness     | `routes/auth.ts:461`                    | `AUTH_CODE_EXCHANGE_FAILED` not in spec error codes         |
| ISSUE-006 | 🟡 MEDIUM | Security        | `lib/jwt.ts:181–188`                    | `tenant` claim checked before issuer URL                    |
| ISSUE-007 | 🟢 LOW    | Performance     | `routes/auth.ts:243`                    | Double validation (AJV + Zod) on every request              |
| ISSUE-008 | 🟢 LOW    | Maintainability | `user-sync.consumer.ts:521–523`         | Singleton initialised with `null as any`                    |

---

## Verdict

### ✅ APPROVED WITH NOTES

All 8 issues have been resolved (February 22, 2026):

**HIGH — resolved:**

1. **ISSUE-001**: `AUTH_TENANT_NOT_FOUND` now returns HTTP 404 in all three route handlers (login, callback, refresh); tests updated
2. **ISSUE-002**: `AUTH_TOKEN_MISSING` → `AUTH_MISSING_TOKEN` aligned across middleware, code and all test files
3. **ISSUE-005**: `getClientIP()` now guards `X-Forwarded-For` behind trusted proxy CIDR check (`TRUSTED_PROXY_CIDRS` env var)

**MEDIUM — resolved:** 4. **ISSUE-003**: `INTERNAL_ERROR` → `AUTH_KEYCLOAK_ERROR` in all four catch blocks (login, callback, refresh, JWKS); tests updated 5. **ISSUE-004**: `AUTH_CODE_EXCHANGE_FAILED` added to `AuthErrorCode` enum and spec §8 error table 6. **ISSUE-006**: JWT issuer URL checked before legacy `tenant` claim; warn log emitted on fallback

**LOW — resolved:** 7. **ISSUE-007**: Four redundant Zod `safeParse` blocks removed from login, callback, refresh and logout routes; JWKS params guard retained 8. **ISSUE-008**: Null singleton replaced with lazy factory (`initUserSyncConsumer` / `getUserSyncConsumer`); `index.ts` updated

**Remaining note**: Human review is mandatory before merge (Constitution Article 4.2).

---

## Next Steps

1. **Human review** — at least one human approval required (Constitution Article 4.2) — this is the mandatory second gate
2. **Merge** to main branch after human approval

---

_AI adversarial review completed. This is the first gate — human review is the second gate and is mandatory before merge (Constitution Article 4.2)._
