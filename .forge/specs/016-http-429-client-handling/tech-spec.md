# Tech Spec: 016 - HTTP 429 Client-Side Handling

> Lightweight specification for the Quick track. Resolves **TD-023** — adds
> `Retry-After` header parsing, automatic retry logic, and user-facing
> rate-limit notifications across all frontend apps and the shared API client.
> Created by the `forge-pm` agent via `/forge-quick`.

| Field   | Value                    |
| ------- | ------------------------ |
| Status  | Draft                    |
| Author  | forge-pm                 |
| Date    | 2026-03-09               |
| Track   | Quick                    |
| Spec ID | 016                      |
| TD Ref  | TD-023 (decision-log.md) |

---

## 1. Problem Statement

Spec 015 (Security Hardening) added server-side rate limiting to 11 routes
across 3 tiers (AUTH 20/min, ADMIN 60/min, GENERAL 120/min). The server
correctly returns HTTP 429 with a `Retry-After: <seconds>` header and the
Constitution Art. 6.2 error body:

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Try again in 42 seconds.",
    "details": { "scope": "admin", "limit": 60, "windowSeconds": 60, "retryAfter": 42 }
  }
}
```

However, the client stack has **zero handling** for 429 responses:

1. **`packages/api-client`** (`HttpClient.axios` response interceptor) does not
   detect 429 or parse the `Retry-After` header. The error falls through to the
   generic `ApiError` path and is surfaced as a plain "Rate limit exceeded"
   string with no retry semantics.
2. **`apps/web`** has no global 429 interceptor. Individual `onError` handlers
   show generic toast messages like "Failed to save settings" — no mention of
   rate limiting or when to retry.
3. **`apps/super-admin`** has the same gap.

**Impact**: Users see unhelpful error messages and may frantically re-click,
making the rate limit situation worse. No data loss or security risk — UX
degradation only.

**Existing partial work**: `apps/web/src/hooks/useAuthorizationApi.ts` already
contains `parseRetryAfter()` and `makeRateLimitError()` helpers (lines 131–148),
but they are local to the authorization API hook and not used by the shared
`HttpClient`. The login page has a `RateLimitCountdown` component for the
auth-specific 429 case, but no global mechanism exists.

---

## 2. Goals / Non-Goals

### Goals

- **G-01**: HTTP 429 responses are automatically retried by `packages/api-client`
  with exponential back-off, respecting the `Retry-After` header value.
- **G-02**: After max retries are exhausted, the `ApiError` thrown contains the
  parsed `retryAfter` value so frontend apps can display actionable messages.
- **G-03**: Both `apps/web` and `apps/super-admin` show a global toast/banner
  when a 429 error reaches the UI layer (after retries are exhausted),
  telling the user how many seconds to wait.
- **G-04**: Unit tests cover interceptor logic, retry back-off, header parsing,
  and toast rendering.

### Non-Goals

- **NG-01**: No changes to the server-side rate limiting logic (Spec 015 is complete).
- **NG-02**: No queuing/batching of failed requests. After max retries, the
  request is rejected and the caller's `onError` / `catch` handler runs.
- **NG-03**: No offline detection or network-failure retry. This spec covers
  only HTTP 429 responses.
- **NG-04**: No per-route retry policy customization. A single global policy
  applies to all requests through `HttpClient`.

---

## 3. Existing Code Audit

### 3.1 `packages/api-client` — `HttpClient` (client.ts)

- **Built on**: axios ^1.13.5
- **Response interceptor** (lines 50-89): Handles 401 (token refresh + retry),
  then wraps all other errors into `ApiError`. No special-casing for 429.
- **`ApiError` class** (types.ts, lines 84-122): Has convenience getters
  (`isUnauthorized`, `isForbidden`, `isNotFound`, `isValidationError`) but
  **no `isRateLimited` getter** and **no `retryAfter` field**.
- **Existing tests** (`__tests__/client.test.ts`): Uses `axios-mock-adapter`.
  Covers GET/POST/PATCH/PUT/DELETE, auth token injection, 401 refresh, error
  handling for 400/500/network. **No 429 test case exists.**

### 3.2 `apps/web`

- **Toast system**: Sonner library, set up via `components/ToastProvider.tsx`
  (re-exports `toast` from `sonner`). The `<Toaster>` component is rendered
  in the root layout (position: top-right, richColors, closeButton).
- **Global error handling**: No global `QueryClient.defaultOptions.mutations.onError`
  or axios interceptor at the app level. Errors are handled per-mutation via
  individual `onError` callbacks that call `toast.error(...)`.
- **Rate limit awareness**: `useAuthorizationApi.ts` has local `parseRetryAfter()`
  and `makeRateLimitError()` helpers. `RateLimitCountdown` component exists but
  is specific to the login page auth flow.

### 3.3 `apps/super-admin`

- **Toast system**: Sonner library, set up via `components/providers/ToastProvider.tsx`.
  Also has a `hooks/use-toast.ts` hook wrapping Sonner with variant support.
  Some components import `toast` directly from `sonner`, others use `useToast()`.
- **Global error handling**: No global error handler. Per-mutation `onError`
  callbacks show toasts (e.g., `toast.error('Failed to disable plugin')`).
- **Rate limit awareness**: None. No 429 detection anywhere.

### 3.4 Server 429 response shape (reference)

From `apps/core-api/src/middleware/rate-limiter.ts` (lines 193-207):

- Header: `Retry-After: <integer-seconds>` (always an integer, never HTTP-date)
- Header: `X-RateLimit-Limit: <limit>`
- Header: `X-RateLimit-Remaining: 0`
- Body: `{ error: { code: "RATE_LIMIT_EXCEEDED", message: "...", details: { scope, limit, windowSeconds, retryAfter } } }`

---

## 4. Solution Design

### 4.1 `ApiError` enhancement (types.ts)

Add two new fields to `ApiError`:

```typescript
/** Seconds until the client should retry (populated on 429 responses) */
public readonly retryAfter: number | null;

/** True when the server returned 429 Too Many Requests */
get isRateLimited(): boolean {
  return this.statusCode === 429;
}
```

Update the constructor to accept an optional `retryAfter` parameter and
pass it through from the 429 interceptor.

### 4.2 `Retry-After` parsing utility (new file: `retry-after.ts`)

Create `packages/api-client/src/retry-after.ts` with a `parseRetryAfter()`
function. This consolidates the logic currently duplicated in
`apps/web/src/hooks/useAuthorizationApi.ts` (lines 131-141):

```typescript
/**
 * Parse a Retry-After header value into seconds.
 * Handles integer seconds and HTTP-date format.
 * Returns a safe default (60s) if the header is missing or unparseable.
 */
export function parseRetryAfter(header: string | null | undefined): number {
  if (!header) return 60;
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds) && seconds >= 0) return seconds;
  const date = new Date(header).getTime();
  if (!isNaN(date)) return Math.max(1, Math.ceil((date - Date.now()) / 1000));
  return 60;
}
```

### 4.3 429 interceptor with auto-retry (client.ts)

Add a 429-handling block in the existing response interceptor, **before** the
generic `ApiError` construction block. The logic:

1. Detect `status === 429`.
2. Parse `Retry-After` header from `error.response.headers['retry-after']`.
3. If retry count for this request is below `MAX_RETRIES` (default: 2):
   a. Wait for `retryDelay` ms using exponential back-off:
   - Attempt 1: `retryAfterSeconds * 1000` (respect server hint)
   - Attempt 2: `retryAfterSeconds * 1000 * 2` (double the wait)
     b. Retry the original request via `this.axios.request(error.config)`.
4. If retries are exhausted, throw an `ApiError` with `retryAfter` populated.

**Retry tracking**: Use a custom axios config property (`_retryCount`) on
the request config object to track how many times a specific request has been
retried. Axios config is cloned per-retry, so this is safe.

**Configuration**: The `HttpClient` constructor will accept an optional
`retryConfig` in `HttpClientConfig`:

```typescript
export interface RetryConfig {
  /** Maximum number of automatic retries for 429 responses (default: 2) */
  maxRetries?: number;
  /** Whether 429 auto-retry is enabled (default: true) */
  enabled?: boolean;
}
```

### 4.4 Global 429 event emitter

Rather than coupling the HTTP client to React/Sonner, the `HttpClient` will
accept an optional `onRateLimited` callback in `HttpClientConfig`:

```typescript
export interface HttpClientConfig {
  // ... existing fields ...
  /** Called when a 429 response is received after all retries are exhausted */
  onRateLimited?: (retryAfter: number) => void;
}
```

This callback is invoked **after retries are exhausted**, just before the
`ApiError` is thrown. Frontend apps wire this up to their toast system during
client initialization.

### 4.5 `apps/web` — Global 429 toast

In `apps/web/src/main.tsx` (or the module that initializes the API client),
wire the `onRateLimited` callback:

```typescript
import { toast } from 'sonner';

const apiClient = new TenantApiClient({
  baseUrl: API_BASE_URL,
  onRateLimited: (retryAfter) => {
    toast.warning(`You're making requests too quickly. Please wait ${retryAfter} seconds.`, {
      duration: Math.min(retryAfter * 1000, 10_000),
    });
  },
});
```

This ensures every 429 that exhausts retries shows a consistent, actionable
warning toast regardless of which page or mutation triggered it.

### 4.6 `apps/super-admin` — Global 429 toast

Same pattern as `apps/web`, wired into the `AdminApiClient` initialization
in `apps/super-admin/src/App.tsx` or wherever the client singleton is created:

```typescript
import { toast } from 'sonner';

const apiClient = new AdminApiClient({
  baseUrl: API_BASE_URL,
  onRateLimited: (retryAfter) => {
    toast.warning(`Rate limit reached. Please wait ${retryAfter} seconds before retrying.`, {
      duration: Math.min(retryAfter * 1000, 10_000),
    });
  },
});
```

### 4.7 Deprecate local `parseRetryAfter` in `useAuthorizationApi.ts`

After the shared utility is in place, update
`apps/web/src/hooks/useAuthorizationApi.ts` to import `parseRetryAfter` from
`@plexica/api-client` instead of maintaining its own copy. Add a
`@deprecated` JSDoc comment on the local functions (`parseRetryAfter`,
`makeRateLimitError`) and re-export from the shared package.

---

## 5. Task Breakdown

### T016-01: 429 interceptor + Retry-After parsing in `packages/api-client`

**Points**: 3  
**Estimated**: 3h

| Subtask  | Description                                                                                         |
| -------- | --------------------------------------------------------------------------------------------------- |
| T016-01a | Create `packages/api-client/src/retry-after.ts` with `parseRetryAfter()` function                   |
| T016-01b | Add `retryAfter: number \| null` field and `isRateLimited` getter to `ApiError` class in `types.ts` |
| T016-01c | Add `RetryConfig` and `onRateLimited` callback to `HttpClientConfig` interface in `types.ts`        |
| T016-01d | Export new symbols from `packages/api-client/src/index.ts`                                          |

**Acceptance Criteria**:

- Given a 429 response with `Retry-After: 42` header, when `parseRetryAfter()` is called, then it returns `42`.
- Given a 429 response with no `Retry-After` header, when `parseRetryAfter()` is called, then it returns `60` (safe default).
- Given an `ApiError` with `statusCode: 429`, when `isRateLimited` is checked, then it returns `true`.
- Given an `ApiError` with `statusCode: 429` and `retryAfter: 42`, when `retryAfter` is accessed, then it returns `42`.

---

### T016-02: Auto-retry with exponential back-off in `packages/api-client`

**Points**: 5  
**Estimated**: 4h

| Subtask  | Description                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------- |
| T016-02a | Add 429 detection block in `HttpClient` response interceptor (before generic `ApiError` path)      |
| T016-02b | Implement retry logic with `_retryCount` tracking on axios config                                  |
| T016-02c | Implement exponential back-off delay: `retryAfterMs * 2^(attempt-1)` capped at 30s                 |
| T016-02d | After max retries exhausted, call `onRateLimited` callback then throw `ApiError` with `retryAfter` |
| T016-02e | Ensure 429 retries do NOT conflict with 401 refresh logic (429 check runs first)                   |

**Acceptance Criteria**:

- Given a 429 response with `Retry-After: 1` and `maxRetries: 2`, when the first retry succeeds with 200, then the caller receives the successful response (total: 2 requests).
- Given a 429 response that persists for all retries with `maxRetries: 2`, when all retries are exhausted, then `onRateLimited` is called with the parsed `retryAfter` value, and an `ApiError` with `isRateLimited === true` is thrown.
- Given a 429 response with `maxRetries: 0` (retries disabled via `retryConfig.maxRetries`), when the 429 is received, then no retry is attempted, `onRateLimited` is called, and `ApiError` is thrown immediately.
- Given a 429 response with `retryConfig.enabled: false`, when the 429 is received, then no retry is attempted.
- Given a 429 response, when retry delay is calculated, then the delay respects `retryAfterSeconds * 1000 * 2^(attempt-1)` with a cap at 30,000ms.

---

### T016-03: Global 429 toast/banner in `apps/web`

**Points**: 2  
**Estimated**: 2h

| Subtask  | Description                                                                                               |
| -------- | --------------------------------------------------------------------------------------------------------- |
| T016-03a | Locate or create the API client initialization module in `apps/web`                                       |
| T016-03b | Wire `onRateLimited` callback to show a Sonner warning toast with retry countdown                         |
| T016-03c | Update `apps/web/src/hooks/useAuthorizationApi.ts` to import `parseRetryAfter` from `@plexica/api-client` |

**Acceptance Criteria**:

- Given a 429 response that exhausts retries in `apps/web`, when the error propagates to the UI, then a warning toast is displayed with the message "You're making requests too quickly. Please wait N seconds."
- Given the toast is displayed, when the user reads it, then the toast auto-dismisses after `min(retryAfter * 1000, 10000)` ms.
- Given `useAuthorizationApi.ts`, when `parseRetryAfter` is referenced, then it imports from `@plexica/api-client` (no local copy).

---

### T016-04: Global 429 toast/banner in `apps/super-admin`

**Points**: 2  
**Estimated**: 2h

| Subtask  | Description                                                                       |
| -------- | --------------------------------------------------------------------------------- |
| T016-04a | Locate or create the API client initialization module in `apps/super-admin`       |
| T016-04b | Wire `onRateLimited` callback to show a Sonner warning toast with retry countdown |

**Acceptance Criteria**:

- Given a 429 response that exhausts retries in `apps/super-admin`, when the error propagates to the UI, then a warning toast is displayed with the message "Rate limit reached. Please wait N seconds before retrying."
- Given the toast is displayed, when the user reads it, then the toast auto-dismisses after `min(retryAfter * 1000, 10000)` ms.

---

### T016-05: Unit tests

**Points**: 5  
**Estimated**: 5h

| Subtask  | Description                                                                                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| T016-05a | Tests for `parseRetryAfter()`: integer seconds, HTTP-date, missing header, invalid value, zero, negative                      |
| T016-05b | Tests for `ApiError.isRateLimited` getter and `retryAfter` field                                                              |
| T016-05c | Tests for 429 interceptor: single retry success, all retries exhausted, retries disabled, `onRateLimited` callback invocation |
| T016-05d | Tests for exponential back-off timing (mock timers)                                                                           |
| T016-05e | Tests for `apps/web` 429 toast rendering (mock Sonner)                                                                        |
| T016-05f | Tests for `apps/super-admin` 429 toast rendering (mock Sonner)                                                                |

**Acceptance Criteria**:

- All new tests pass with `pnpm test` in `packages/api-client`, `apps/web`, and `apps/super-admin`.
- `packages/api-client` test coverage for new code ≥ 90%.
- No regressions in existing `client.test.ts` test suite.

---

## 6. File List

### Files to Create

| Path                                                     | Type    | Description                                                               |
| -------------------------------------------------------- | ------- | ------------------------------------------------------------------------- |
| `packages/api-client/src/retry-after.ts`                 | Utility | `parseRetryAfter()` function for Retry-After header parsing               |
| `packages/api-client/__tests__/retry-after.test.ts`      | Test    | Unit tests for `parseRetryAfter()`                                        |
| `packages/api-client/__tests__/rate-limit-retry.test.ts` | Test    | Unit tests for 429 interceptor, retry logic, and `onRateLimited` callback |

### Files to Modify

| Path                                                       | Change Description                                                                                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/api-client/src/types.ts`                         | Add `retryAfter` field to `ApiError`, add `isRateLimited` getter, add `RetryConfig` interface, add `onRateLimited` to `HttpClientConfig` |
| `packages/api-client/src/client.ts`                        | Add 429 detection + auto-retry logic in response interceptor, accept `retryConfig` and `onRateLimited` from config                       |
| `packages/api-client/src/index.ts`                         | Export `parseRetryAfter` and `RetryConfig` type                                                                                          |
| `packages/api-client/__tests__/client.test.ts`             | Add 429-specific test cases (interceptor behavior, no conflict with 401 logic)                                                           |
| `packages/api-client/__tests__/types.test.ts`              | Add tests for `ApiError.isRateLimited` and `retryAfter` field                                                                            |
| `apps/web/src/hooks/useAuthorizationApi.ts`                | Replace local `parseRetryAfter` with import from `@plexica/api-client`; deprecate local helpers                                          |
| `apps/web/src/main.tsx` (or API client init module)        | Wire `onRateLimited` callback to Sonner toast                                                                                            |
| `apps/super-admin/src/App.tsx` (or API client init module) | Wire `onRateLimited` callback to Sonner toast                                                                                            |

### Files to Reference (Read-only)

| Path                                                          | Purpose                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------- |
| `.forge/constitution.md`                                      | Art. 6.2 error format, Art. 1.3 UX standards (actionable errors) |
| `apps/core-api/src/middleware/rate-limiter.ts`                | Server 429 response shape and `Retry-After` header format        |
| `apps/core-api/src/lib/rate-limit-config.ts`                  | 3-tier rate limit configuration (AUTH/ADMIN/GENERAL)             |
| `apps/web/src/components/auth/RateLimitCountdown.tsx`         | Existing 429 UI pattern (reference for consistency)              |
| `apps/web/src/components/ToastProvider.tsx`                   | Sonner toast configuration in `apps/web`                         |
| `apps/super-admin/src/components/providers/ToastProvider.tsx` | Sonner toast configuration in `apps/super-admin`                 |
| `apps/super-admin/src/hooks/use-toast.ts`                     | Custom toast hook wrapping Sonner                                |
| `.forge/knowledge/decision-log.md`                            | TD-023 entry                                                     |

---

## 7. Acceptance Criteria (Overall)

| #     | Given                                                    | When                               | Then                                                                                      |
| ----- | -------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| AC-01 | The server returns HTTP 429 with `Retry-After: 5`        | The `HttpClient` makes the request | The client automatically retries up to 2 times with exponential back-off before throwing  |
| AC-02 | The server returns 429 on first attempt and 200 on retry | The client retries                 | The caller receives the successful response transparently                                 |
| AC-03 | The server returns 429 on all attempts (3 total)         | Max retries are exhausted          | An `ApiError` with `isRateLimited === true` and `retryAfter === N` is thrown              |
| AC-04 | A 429 `ApiError` reaches the UI in `apps/web`            | The `onRateLimited` callback fires | A Sonner warning toast shows "You're making requests too quickly. Please wait N seconds." |
| AC-05 | A 429 `ApiError` reaches the UI in `apps/super-admin`    | The `onRateLimited` callback fires | A Sonner warning toast shows "Rate limit reached. Please wait N seconds before retrying." |
| AC-06 | The `Retry-After` header is missing                      | `parseRetryAfter()` is called      | Returns 60 (safe default)                                                                 |
| AC-07 | The `Retry-After` header contains an HTTP-date           | `parseRetryAfter()` is called      | Returns the correct number of seconds until that date                                     |
| AC-08 | `retryConfig.enabled` is set to `false`                  | A 429 response is received         | No retry is attempted; `ApiError` is thrown immediately                                   |
| AC-09 | All existing tests in `packages/api-client`              | `pnpm test` is run                 | All pass with no regressions                                                              |
| AC-10 | The `parseRetryAfter` in `useAuthorizationApi.ts`        | The file is inspected              | It imports from `@plexica/api-client` instead of defining locally                         |

---

## 8. Test Strategy

### 8.1 Unit Tests — `packages/api-client`

**File**: `packages/api-client/__tests__/retry-after.test.ts`

| Test Case                  | Input                             | Expected Output          |
| -------------------------- | --------------------------------- | ------------------------ |
| Integer seconds            | `"42"`                            | `42`                     |
| Zero seconds               | `"0"`                             | `0`                      |
| Negative seconds (invalid) | `"-5"`                            | `60` (default)           |
| HTTP-date (future)         | `"Sun, 09 Mar 2026 12:00:00 GMT"` | Positive integer (delta) |
| HTTP-date (past)           | `"Sun, 01 Jan 2020 00:00:00 GMT"` | `1` (minimum)            |
| Null                       | `null`                            | `60` (default)           |
| Undefined                  | `undefined`                       | `60` (default)           |
| Empty string               | `""`                              | `60` (default)           |
| Non-numeric string         | `"abc"`                           | `60` (default)           |

**File**: `packages/api-client/__tests__/rate-limit-retry.test.ts`

| Test Case                             | Scenario                                                             |
| ------------------------------------- | -------------------------------------------------------------------- |
| Single retry succeeds                 | 429 → 200 (2 requests total)                                         |
| All retries fail                      | 429 → 429 → 429 (3 requests, then `ApiError` thrown)                 |
| `onRateLimited` called                | After max retries, callback receives `retryAfter` value              |
| `onRateLimited` not called on success | 429 → 200, callback never called                                     |
| Retries disabled via config           | `retryConfig: { enabled: false }` → no retry, immediate throw        |
| `maxRetries: 0`                       | Same as disabled — no retry                                          |
| Back-off timing                       | Mock timers verify delay doubles per attempt                         |
| Back-off cap at 30s                   | `Retry-After: 20` → attempt 2 delay = `min(40_000, 30_000) = 30_000` |
| `retryAfter` field on `ApiError`      | Verify `apiError.retryAfter` matches parsed header                   |
| `isRateLimited` getter                | `ApiError(429).isRateLimited === true`                               |
| No conflict with 401                  | 401 still triggers refresh, 429 still triggers retry                 |
| Headers forwarded to retry            | Auth token preserved on retry request                                |

**File**: `packages/api-client/__tests__/types.test.ts` (additions)

| Test Case                                      | Assertion                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| `ApiError.isRateLimited` returns true for 429  | `new ApiError({ statusCode: 429, ... }).isRateLimited === true`  |
| `ApiError.isRateLimited` returns false for 400 | `new ApiError({ statusCode: 400, ... }).isRateLimited === false` |
| `ApiError.retryAfter` is null by default       | `new ApiError({ statusCode: 400, ... }).retryAfter === null`     |
| `ApiError.retryAfter` is set when provided     | `new ApiError({ ..., retryAfter: 30 }).retryAfter === 30`        |

### 8.2 Unit Tests — Frontend toast rendering

**Location**: `apps/web/src/__tests__/unit/rate-limit-toast.test.ts` and
`apps/super-admin/src/__tests__/unit/rate-limit-toast.test.ts`

Both test files:

1. Mock `sonner` module (`vi.mock('sonner', ...)`).
2. Simulate invoking the `onRateLimited` callback with a known `retryAfter` value.
3. Assert that `toast.warning()` was called with the correct message and duration.

### 8.3 Test Framework & Tooling

- **Framework**: Vitest (already configured in all three packages)
- **HTTP mocking**: `axios-mock-adapter` (already a devDependency in `packages/api-client`)
- **Timer mocking**: `vi.useFakeTimers()` for back-off delay verification
- **Toast mocking**: `vi.mock('sonner')` for frontend toast assertion

---

## 9. Definition of Done

- [ ] `parseRetryAfter()` utility created and exported from `@plexica/api-client`
- [ ] `ApiError` class has `retryAfter` field and `isRateLimited` getter
- [ ] `HttpClient` response interceptor detects 429 and retries with exponential back-off
- [ ] `onRateLimited` callback is supported in `HttpClientConfig`
- [ ] `apps/web` shows Sonner warning toast on 429 (after retries exhausted)
- [ ] `apps/super-admin` shows Sonner warning toast on 429 (after retries exhausted)
- [ ] Local `parseRetryAfter` in `useAuthorizationApi.ts` replaced with shared import
- [ ] All unit tests pass (`pnpm test` in all three packages)
- [ ] No regressions in existing test suites
- [ ] TypeScript strict mode — no `any` types
- [ ] Code reviewed via `/forge-review`

---

## Cross-References

| Document                      | Path                                                  |
| ----------------------------- | ----------------------------------------------------- |
| Constitution                  | `.forge/constitution.md` (Art. 1.3, 6.2, 9.2)         |
| TD-023 entry                  | `.forge/knowledge/decision-log.md`                    |
| Spec 015 (Security Hardening) | `.forge/specs/015-security-hardening/`                |
| Rate limit middleware         | `apps/core-api/src/middleware/rate-limiter.ts`        |
| Rate limit config             | `apps/core-api/src/lib/rate-limit-config.ts`          |
| Existing RateLimitCountdown   | `apps/web/src/components/auth/RateLimitCountdown.tsx` |
