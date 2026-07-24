# Tech Spec: 008 — PR #77 Review Fixes (Batch 2)

> Lightweight specification for the Quick track. Combines requirements,
> tasks, and acceptance criteria in a single document.
> Created by the `forge-pm` agent via `/forge-quick`.

| Field   | Value                             |
| ------- | --------------------------------- |
| Status  | Draft                             |
| Author  | forge-pm                          |
| Date    | 2026-07-23                        |
| Track   | Quick                             |
| Spec ID | 008                               |

---

## Overview

After the main ADR-023 PKCE remediation (`81984e1`) and a first fix pass
(`a2deaed`), 11 review comments from Copilot and CodeRabbit remain open on
PR #77. These span the auth package (flight cleanup, test assertions), the
core API (proxy role priority, visibility PATCH shape), admin/web frontends
(session expiry error handling, visibility editor save errors), E2E
infrastructure (Keycloak client null safety), and documentation (redirect
URI spec).

Each fix is scoped, test-verified, and follows project rules (no console.log
in production, Zod validation, given/when/then E2E test coverage).

## Requirements

1. **Auth flight cleanup**: `loginFlight` and `callbackFlight` must be cleared in all terminal states (success, failure) so subsequent auth operations are not blocked by stale promises.
2. **Role priority enforcement**: Workspace role selection from a role list must respect admin > member > viewer priority.
3. **Consistent API response shape**: PATCH visibility must return the same `PluginVisibilityEntry[]` shape as GET.
4. **Session expiry error visibility**: When auto-login fails after session expiry, the user must see an error and a fallback redirect instead of silent failure.
5. **Optimistic update rollback on error**: Visibility editor must revert optimistic state when save fails.
6. **Test assertion accuracy**: Post-logout URI test must match the configured `/login` path; PKCE storage key assertion must verify state-derived key format.
7. **ADR-023 compliance in docs**: Infrastructure plan must prescribe exact callback URIs, not wildcards.
8. **Null-safe attribute access**: E2E client must handle missing Keycloak `attributes` with a descriptive error rather than a TypeError.

## Issues

### 1. Auth Flow — `runLogin()` flight not cleared on success

| Field        | Value |
|-------------|-------|
| **File**    | `packages/auth/src/auth-flow.ts` |
| **Problem** | `loginFlight` is set on line 28 but only cleared on `.catch()` (lines 29–31). On success, subsequent `login()` calls return the stale resolved promise and skip the Keycloak redirect, leaving the user stuck. |
| **Fix**     | Replace `.catch()` with `.finally()` so `loginFlight` is nulled on both resolve and reject. |
| **Verification** | Unit test: call `runLogin()` twice where the first resolves successfully; assert the second call invokes `operation` and performs a fresh redirect. E2E: login twice in sequence; confirm both trigger Keycloak redirect. |

### 2. Auth Flow — `runCallback()` flight not cleaned up on all terminal states

| Field        | Value |
|-------------|-------|
| **File**    | `packages/auth/src/auth-flow.ts` |
| **Problem** | `callbackFlight` is set on line 49. The `.finally()` at line 51 clears it, but the catch-all `.catch(() => undefined)` at line 55 can swallow errors from the `.finally()` promise itself. If the `.finally()` callback throws after nulling `callbackFlight` but before settling the state map, the error is swallowed and the state is inconsistent. |
| **Fix**     | Move cleanup logic out of `.finally()` and into dedicated handlers that run unconditionally in both success and failure paths. Use a `settled` helper that always clears `callbackFlight` and updates `settledCallbackStates`. |
| **Verification** | Unit test: simulate a `callbackFlight` promise that both resolves and rejects; confirm `callbackFlight` is nulled in both cases. Verify `settledCallbackStates` is updated only when `callbackGeneration` matches. |

### 3. Proxy Service — Role priority not enforced

| Field        | Value |
|-------------|-------|
| **File**    | `services/core-api/src/modules/plugin/services/proxy.service.ts` |
| **Problem** | `[NEEDS CLARIFICATION]` — The current code at HEAD receives `workspaceRole` from `proxy-authorization.service.ts` (determined by DB membership). The review comment references a prior version with `request.user?.roles.find((role) => ['admin', 'member', 'viewer'].includes(role))` that returned whichever role appeared first in the array. If this pattern still exists elsewhere, it must enforce admin > member > viewer priority. |
| **Fix**     | Audit all `roles.find(...)` / `roles.includes(...)` patterns in the proxy chain. Wherever workspace role is derived from a list rather than a single DB field, iterate the priority list `['admin', 'member', 'viewer']` and return the first match. The canonical source of truth must remain the DB `workspaceMember.role` field. |
| **Verification** | Unit test: simulate a user with roles `['member', 'admin']`; assert `'admin'` is selected. Integration: proxy request with user having multiple workspace roles; verify `X-Plexica-User-Role` header contains the highest-priority role. |

### 4. Visibility Routes — PATCH response shape mismatch

| Field        | Value |
|-------------|-------|
| **File**    | `services/core-api/src/modules/plugin/routes/visibility.routes.ts` |
| **Problem** | `[NEEDS CLARIFICATION]` — The current code at HEAD already normalises PATCH to return `PluginVisibilityEntry[]` via `getVisibilityEntries()`. The review comment references a prior version that returned `{ installId, overrides }`. Verify the fix is complete and add an integration test that asserts the PATCH response matches the GET response schema exactly. |
| **Fix**     | If the prior `{ installId, overrides }` pattern survives on any code path, replace it with `PluginVisibilityEntry[]`. Add a Zod response schema assertion in the integration test. |
| **Verification** | Integration test: PATCH visibility, assert response body matches `PluginVisibilityEntry[]` schema (same as GET). |

### 5. Admin — Session expired handler silently swallows login errors

| Field        | Value |
|-------------|-------|
| **File**    | `apps/admin/src/components/auth/session-expired-handler.tsx` |
| **Problem** | Line 21: `void login().catch(() => undefined)` silently swallows all login failures. If Keycloak is unreachable or returns an error, the user sees no feedback and is not redirected. |
| **Fix**     | Add error logging via the Pino logger (or `console.error` in dev builds, guarded by an import.meta.env.DEV check) and redirect to `/login` as a fallback. |
| **Verification** | Unit test: mock `login()` to reject, assert error is logged and a fallback redirect to `/login` occurs. E2E: kill Keycloak, trigger session expiry, confirm user lands on `/login`. |

### 6. Web — Session expired handler silently swallows login errors

| Field        | Value |
|-------------|-------|
| **File**    | `apps/web/src/components/auth/session-expired-handler.tsx` |
| **Problem** | Line 27: `void login().catch(() => undefined)` — same pattern as the admin handler. |
| **Fix**     | Same fix as #5: add error logging (dev console.error) and fallback redirect to `/login`. |
| **Verification** | Same as #5 for the web app. |

### 7. Visibility Editor — Optimistic local updates never clear on save failure

| Field        | Value |
|-------------|-------|
| **File**    | `apps/web/src/components/plugins/visibility-editor.tsx` |
| **Problem** | The `useEffect` at lines 40–49 only clears `localUpdates` when `data` confirms every update was persisted. There is no `isSaveError` branch. If the PATCH fails, `localUpdates` remain set, the "Save" button stays visible, and subsequent toggles compound on stale optimistic state. |
| **Fix**     | Reset `localUpdates` to `[]` when the parent signals save failure. The component receives `isSaving` and `isError` props; when `isError` is true and `localUpdates` is non-empty, clear the local state so the UI reverts to the last known server state. |
| **Verification** | Unit test: simulate `isError=true` while `localUpdates` has entries; assert state is cleared and component re-renders with server data. E2E: toggle visibility, simulate a network failure on save, confirm toggles revert. |

### 8. Admin Auth Store Test — Post-logout URI assertion mismatch

| Field        | Value |
|-------------|-------|
| **File**    | `packages/auth/__tests__/admin-auth-store.test.ts` |
| **Problem** | The test at line 186 asserts `logoutUrl` was called with `'https://admin.example.com/'` but ADR-023 registers the post-logout redirect URI as `https://admin.example.com/login` in `plexica-admin-client.ts`. |
| **Fix**     | Update the assertion on line 186 from `'https://admin.example.com/'` to `'https://admin.example.com/login'`. |
| **Verification** | Run the test suite; confirm the assertion passes. Verify `plexica-admin-client.ts` `attributes['post.logout.redirect.uris']` matches. |

### 9. PKCE Keycloak Test — Verifier should be scoped by state key

| Field        | Value |
|-------------|-------|
| **File**    | `packages/auth/__tests__/pkce-keycloak.test.ts` |
| **Problem** | The test at line 40 checks isolation for overlapping states but does not explicitly assert that the sessionStorage key is derived from the `state` parameter. A regression could change the key format without the test catching it. |
| **Fix**     | Add an explicit assertion that the sessionStorage key follows the `plexica_oidc_request:{state}` pattern (per `authorization-request.ts:storageKey()`). Verify that two different states produce different storage keys. |
| **Verification** | Run the test suite; confirm the new assertion passes. Manually inspect the storage key format in a debug run. |

### 10. Infrastructure Plan — Wildcard redirect URI does not match ADR-023

| Field        | Value |
|-------------|-------|
| **File**    | `.forge/specs/001-infrastructure-setup/plan.md` §4.3 |
| **Problem** | Line 171 prescribes `http://localhost:3000/*` as the valid redirect URI for the `plexica-web` client. ADR-023 requires exact callback URIs (e.g. `http://localhost:3000/callback`). Wildcards are forbidden by PKCE best practices. |
| **Fix**     | Change line 171 from `http://localhost:3000/*` to `http://localhost:3000/callback`. |
| **Verification** | Review the rendered plan.md. Confirm ADR-023 compliance. |

### 11. E2E Keycloak Admin Client — `attributes` accessed without null check

| Field        | Value |
|-------------|-------|
| **File**    | `e2e/keycloak/plexica-admin-client.ts` |
| **Problem** | Line 68 casts `actual.attributes` as `Record<string, unknown> | undefined`. Line 72 accesses `attributes['post.logout.redirect.uris']` without optional chaining. If `attributes` is undefined, this throws a TypeError at runtime instead of a descriptive assertion error. |
| **Fix**     | Add optional chaining: `attributes?.['post.logout.redirect.uris']`. If the value is missing/undefined, throw a descriptive error (e.g., `"post-logout redirect URI is not configured"`). |
| **Verification** | Unit test: call `assertPlexicaAdminConfiguration` with `attributes: undefined`; assert it throws a descriptive error, not TypeError. E2E: run the admin client reconciliation against a Keycloak instance without the attribute; confirm a clean error message. |

---

## Tasks

1. **Fix auth-flow.ts flight cleanup** — `runLogin()` `.catch()` → `.finally()`.
2. **Fix auth-flow.ts callback cleanup** — Ensure `callbackFlight` is cleared in all terminal states.
3. **Audit proxy role priority** — Enforce admin > member > viewer where role is derived from a list.
4. **Normalise visibility PATCH response** — Add integration test asserting `PluginVisibilityEntry[]`.
5. **Fix admin session-expired-handler.tsx** — Error logging + fallback redirect.
6. **Fix web session-expired-handler.tsx** — Same pattern as #5.
7. **Fix visibility-editor.tsx** — Clear `localUpdates` on save failure.
8. **Fix admin-auth-store.test.ts assertion** — Update post-logout URI.
9. **Fix pkce-keycloak.test.ts** — Add state-derived storage key assertion.
10. **Fix plan.md §4.3** — Wildcard → exact callback URI.
11. **Fix plexica-admin-client.ts** — Optional chaining on `attributes`.

## Acceptance Criteria

- Given a successful login, when `runLogin()` is called again, then a fresh redirect is initiated (flight is not stale).
- Given a callback that resolves, when `callbackFlight` is checked, then it is null and `settledCallbackStates` contains the state.
- Given a callback that rejects, when `callbackFlight` is checked, then it is null.
- Given a user with roles `['member', 'admin']`, when the proxy determines workspace role, then `admin` is selected.
- Given a PATCH to visibility, when the response is received, then its shape matches `PluginVisibilityEntry[]`.
- Given a session expiry, when `login()` fails, then an error is logged and the user is redirected to `/login`.
- Given a visibility save failure, when `isError` transitions to true, then `localUpdates` is cleared.
- Given the admin auth store test, when `logout()` is called, then the post-logout URI assertion matches `https://admin.example.com/login`.
- Given the PKCE test for state isolation, when storage keys are inspected, then they follow the `plexica_oidc_request:{state}` pattern.
- Given the infrastructure plan §4.3, when read, then the redirect URI is `http://localhost:3000/callback`.
- Given a Keycloak client without `attributes`, when `assertPlexicaAdminConfiguration` is called, then it throws a descriptive error (not TypeError).

---

## Implementation Targets

> **Note**: All paths are relative to the project root.

### Files to Modify

| # | Path | Change Description |
|---|------|---------------------|
| 1 | `packages/auth/src/auth-flow.ts` | `runLogin()`: replace `.catch()` with `.finally()` to clear `loginFlight` on all settle paths |
| 2 | `packages/auth/src/auth-flow.ts` | `runCallback()`: refactor cleanup into unconditional handler that runs on both resolve and reject |
| 3 | `services/core-api/src/modules/plugin/services/proxy.service.ts` | Audit and enforce role priority in any `roles.find(...)` pattern; verify `access.workspaceRole` is always the highest-priority role |
| 4 | `services/core-api/src/modules/plugin/routes/visibility.routes.ts` | Verify PATCH returns `PluginVisibilityEntry[]`; add Zod response schema assertion |
| 5 | `apps/admin/src/components/auth/session-expired-handler.tsx` | Replace `.catch(() => undefined)` with logging + fallback redirect |
| 6 | `apps/web/src/components/auth/session-expired-handler.tsx` | Same as #5 |
| 7 | `apps/web/src/components/plugins/visibility-editor.tsx` | Add `isError` branch in `useEffect` to clear `localUpdates` |
| 8 | `packages/auth/__tests__/admin-auth-store.test.ts` | Line 186: update URI from `/` to `/login` |
| 9 | `packages/auth/__tests__/pkce-keycloak.test.ts` | Add assertion for `storageKey(state)` format |
| 10 | `.forge/specs/001-infrastructure-setup/plan.md` | Line 171: `http://localhost:3000/*` → `http://localhost:3000/callback` |
| 11 | `e2e/keycloak/plexica-admin-client.ts` | Line 72: add `?.` optional chaining + descriptive error |

### Files to Reference (Read-only)

| Path | Purpose |
|------|---------|
| `.forge/constitution.md` | Validate against architecture rules (no console.log, E2E tests, strict mode) |
| `packages/auth/src/authorization-request.ts` | Reference `storageKey()` format for test assertions |
| `e2e/keycloak/plexica-admin-client.ts` | Current implementation of `assertPlexicaAdminConfiguration` |

---

## Cross-References

| Document | Path |
| -------- | ---- |
| Constitution | `.forge/constitution.md` |
| Architecture | `.forge/architecture/architecture.md` |
| ADR-023 | `.forge/knowledge/adr/ADR-023-admin-pkce-migration.md` |
| Infrastructure Plan | `.forge/specs/001-infrastructure-setup/plan.md` |
