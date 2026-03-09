# Adversarial Review — Spec 014: Frontend Layout Engine (Pass 3)

**Date**: March 8, 2026  
**Spec**: `.forge/specs/014-frontend-layout-engine/`  
**Reviewer**: FORGE forge-reviewer (Claude)  
**Track**: Feature  
**Pass**: 3 (post-Pass-2 resolution)  
**Verdict**: ❌ **NOT READY FOR MERGE** — 2 new HIGH-severity findings

---

## Executive Summary

Pass 3 reviewed all source files and the full test suite. Two **Pass 2 HIGH findings
(H-001, H-002) are confirmed resolved**; the two MEDIUM findings (M-003, M-004 from
Pass 2) are also confirmed resolved. However, adversarial review uncovered **2 new
HIGH-severity regressions** and **7 new MEDIUM-severity issues** that must be addressed
before merge. The most critical finding is that the frontend `saveLayoutConfig` function
issues an HTTP `PATCH` request while the backend registers only an HTTP `PUT` route —
meaning **no save has ever succeeded from the frontend UI**.

---

## Pass 2 Resolution Status

| Finding | Description                                                | Status                                               |
| ------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| H-001   | VisibilityToggle ARIA label test mismatch (CI blocker)     | ✅ RESOLVED — source and tests match                 |
| H-002   | Zero test coverage for 6 frontend components               | ✅ RESOLVED — 7 new test files with 100+ tests exist |
| M-003   | `LayoutAwareForm` element-children section grouping broken | ✅ RESOLVED — `childSectionMap` injected correctly   |
| M-005   | `LayoutConfigPanel` props non-discriminated union          | ✅ RESOLVED — discriminated union implemented        |

Residual findings from Pass 2 (accepted as post-merge TD):

| Finding | Status                                                            |
| ------- | ----------------------------------------------------------------- |
| M-001   | Still present (stale closure in `loadForms`)                      |
| M-002   | Still present (`buildSaveInput` no `useCallback`, eslint-disable) |
| M-004   | Still present (`savedConfig.updatedBy` renders raw UUID)          |
| L-001   | Still present (`SectionWrapper` missing `label` prop)             |

---

## New Findings — This Pass

### HIGH Severity

---

#### NEW-H-001 — `saveLayoutConfig` uses HTTP PATCH but route is registered as PUT

**Dimension**: Correctness  
**File**: `apps/web/src/api/layout-config.ts` lines 138–146; `apps/core-api/src/routes/layout-config.ts`  
**Spec Reference**: US-003 (Save layout configuration), FR-021 (persist overrides), T014-13

**Description**:

`saveLayoutConfig()` in the API client calls `raw().patch(url, body)`. The corresponding
backend route in `layout-config.ts` is registered with `fastify.put(...)`. Fastify will
return `404 Method Not Allowed` for all `PATCH` requests to this path. The same issue
affects `saveWorkspaceLayoutConfig` (line 228).

The doc comment on line 132 explicitly says `// PUT /api/v1/layout-configs/:formId` but
the implementation calls `.patch()`. This means **every tenant admin save attempt from
the frontend silently fails with a network 404 that is caught and shown as a generic
error** (or, depending on the error handler, a confusing 404 message).

The integration tests in `layout-config.routes.test.ts` use `method: 'PUT'` directly
(bypassing the API client), which is why the tests pass. No test exercises the actual
API client against a running server.

**Impact**: US-003 is entirely non-functional in production. The layout engine cannot
save any configuration from the UI. This is a complete feature regression that ships
silently.

**Fix Required**: Change `raw().patch(url, body)` to `raw().put(url, body)` in
`saveLayoutConfig` and `saveWorkspaceLayoutConfig`. Add an API-client integration test
that invokes `saveLayoutConfig` through the actual client (not `app.inject` directly).

---

#### NEW-H-002 — `ResolvedField` type missing `required` and `defaultValue`; FR-010 client-side silently dead

**Dimension**: Correctness, Test-Spec Coherence  
**File**: `apps/web/src/components/layout-engine/LayoutAwareForm.tsx` lines 380–398; `packages/types/src/layout-engine.ts`  
**Spec Reference**: FR-010 (hidden required field injection), US-005

**Description**:

`HiddenFieldInjector` in `LayoutAwareForm.tsx` checks:

```typescript
if (resolvedField.required && !resolvedField.defaultValue) { ... }
```

However, the `ResolvedField` type only defines `{ fieldId, order, visibility, readonly }`.
The `required` and `defaultValue` properties are **not on the type**. Both accesses return
`undefined` at runtime; the condition is always falsy; the hidden `<input>` injection
(which carries a default value for server-side consumption) **never executes**.

The tests in `LayoutAwareForm.test.tsx` fabricate `ResolvedField` objects with `required`
and `defaultValue` fields (lines 73–81 of the test file), so the unit tests pass — but
they are testing against data that cannot exist in production. This is a Test-Spec
Coherence failure as well as a functional regression.

The server-side fallback in `layout-readonly-guard.ts` (POST body injection) still
works. However, browser-native form submits (non-fetch) and GET-method forms that
rely on hidden field injection are silently broken.

**Impact**: FR-010 partial regression. Hidden-field injection path in `LayoutAwareForm`
is dead code masked by type-fabricating tests.

**Fix Required**:

1. Add `required?: boolean` and `defaultValue?: string | null` to the `ResolvedField`
   type in `packages/types/src/layout-engine.ts`.
2. Ensure `resolveForUser` in the backend service populates these fields in the
   resolved layout response.
3. Update `LayoutAwareForm.test.tsx` to use the canonical `ResolvedField` type (not
   fabricated extra fields) and verify hidden-field injection with proper mock data.

---

### MEDIUM Severity

---

#### NEW-M-001 — `RequiredFieldWarningDialog` has nested `role="dialog"` (WCAG violation)

**Dimension**: UX Quality, Constitution Compliance (Art. 1.3)  
**File**: `apps/web/src/components/layout-engine/RequiredFieldWarningDialog.tsx` lines 80–94

**Description**:

`RequiredFieldWarningDialog` renders `<Dialog>` from `@plexica/ui` (which itself
applies `role="dialog"` and `aria-modal`) and then renders a child
`<div role="dialog" aria-modal="true">` as its content wrapper. Screen readers will
announce two nested dialog regions. WCAG 2.1 §4.1.2 (Name, Role, Value) requires that
elements have only one appropriate role.

The test mocks `<Dialog>` as a plain `<div>` without `role="dialog"`, so the nesting
is invisible to the test suite.

**Fix**: Remove `role="dialog"` and `aria-modal` from the inner `<div>`. The `@plexica/ui`
`<Dialog>` shell already handles the correct ARIA role.

---

#### NEW-M-002 — `LayoutConfigPanel` `warningItems` hardcodes `"affected roles"` instead of actual role names

**Dimension**: Correctness, UX Quality  
**File**: `apps/web/src/components/layout-engine/LayoutConfigPanel.tsx` lines 431–434  
**Spec Reference**: US-007 (warn which roles are affected by hidden required field)

**Description**:

`warningItems` constructs each warning with `role: 'affected roles'` as a literal string
instead of the actual role name from the API validation response. The
`RequiredFieldWarningDialog` renders this `role` field inline (e.g., `"(hidden for
affected roles)"`), losing the specific role context that US-007 requires the user to see.

US-007 explicitly states: "show which roles would be unable to fill the required field".

**Fix**: Map the API `warnings` array (which includes `affectedRoles: string[]`) into
individual per-role `warningItems`, or pass the full `affectedRoles` list through and
render it in the dialog.

---

#### NEW-M-003 — `detectRequiredFieldWarnings` treats `readonly` as a warning trigger (false positives)

**Dimension**: Correctness  
**File**: `apps/core-api/src/services/layout-config-validation.service.ts` lines 158–163  
**Spec Reference**: FR-011 (warn on hidden required fields), US-007

**Description**:

The `isGloballyHidden` check includes:

```typescript
globalVisibility === 'hidden' || globalVisibility === 'readonly';
```

FR-011 specifies the warning is triggered when a required field "cannot be filled
because it is hidden". A `readonly` required field is **visible** — users can see its
pre-populated value. Setting `required` + `readonly` is a valid configuration (e.g.
auto-filled fields). This generates spurious `REQUIRED_FIELD_NO_DEFAULT` 400 errors
that block valid configurations from saving.

The validation service tests at line 237–244 _explicitly assert this false positive as
expected behavior_, meaning the tests encode the wrong spec interpretation.

**Fix**: Remove `|| globalVisibility === 'readonly'` from the `isGloballyHidden`
condition. Update the corresponding tests to reflect that `readonly` required fields
should **not** generate a warning.

---

#### NEW-M-004 — `buildManifestDefaults` discards manifest `order` values, uses array index

**Dimension**: Correctness  
**File**: `apps/core-api/src/services/layout-config.service.ts` — `buildManifestDefaults` method  
**Spec Reference**: FR-003 (field ordering), FR-004 (section ordering), FR-005 (column ordering)

**Description**:

```typescript
sections.map((s, i) => ({ sectionId: s.sectionId, order: i }));
```

The array index `i` (0, 1, 2, …) is used as the `order` value, discarding `s.order`
from the manifest. If a plugin manifest declares non-sequential or non-zero-indexed
ordering (e.g. `order: 10, 20, 30`), the resolved layout will renumber them to
`0, 1, 2`. This can cause subtle display order mismatches between the manifest's
declared order and the layout engine's resolved order.

The same pattern affects fields and columns.

**Fix**: Use `s.order` (the manifest's declared order) rather than the array index `i`.

---

#### NEW-M-005 — Feature flag `preHandler` silently passes when `tenantSlug` is absent

**Dimension**: Security, Correctness  
**File**: `apps/core-api/src/routes/layout-config.ts` lines 151–158  
**Spec Reference**: NFR-006 (feature flag gate)

**Description**:

```typescript
preHandler: async (request, reply) => {
  if (!request.user?.tenantSlug) return; // silently skip flag check
  const enabled = await featureFlagService.isEnabled('layout_engine_enabled', request.user.tenantSlug);
  if (!enabled) return reply.code(403).send(...);
}
```

If a request reaches this handler with no `tenantSlug` in the JWT (e.g. a service
account or a misconfigured token), the feature flag check is bypassed entirely and the
mutation routes are accessible. The intent was presumably to return early with a 401/403,
not to silently allow the request.

**Fix**: Change `if (!request.user?.tenantSlug) return;` to
`if (!request.user?.tenantSlug) return reply.code(401).send({ error: { code: 'UNAUTHORIZED' } });`.
This maintains security intent while keeping the handler logic correct.

---

#### NEW-M-006 — Core US-007 flow (save with warning dialog) is entirely untested in LayoutConfigPanel tests

**Dimension**: Test-Spec Coherence  
**File**: `apps/web/src/__tests__/layout-engine/LayoutConfigPanel.test.tsx` lines 358–406, 539–564  
**Spec Reference**: US-007, FR-011, T014-28 (acceptance criteria)

**Description**:

The two most critical test scenarios for `LayoutConfigPanel` — (1) the save flow
triggering a `REQUIRED_FIELD_NO_DEFAULT` warning response from the backend, and (2) the
`RequiredFieldWarningDialog` rendering and "Proceed Anyway" / "Cancel" actions — are
acknowledged in the test file as **impossible to test** due to the inability to trigger
the dirty state and invoke `handleSave`. The test stubs `buildSaveInput` / `handleSave`
but cannot exercise them through the UI.

The tests that exist for US-007 coverage only verify that the save button is disabled
when the component is clean. The dirty state, API call, warning interception, and dialog
dismissal paths are completely absent.

This partially invalidates the H-002 resolution. Tests exist, but the most
business-critical acceptance criteria from US-007 have zero coverage.

**Fix**: Either (a) refactor `LayoutConfigPanel` to accept an injectable `onSave`
callback for testability, or (b) extract the save + warning logic into a custom hook
(`useSaveLayoutConfig`) that can be unit tested independently, then add tests for the
hook covering the warning interception, proceed-anyway, and cancel flows.

---

#### NEW-M-007 — `softDeleteByPlugin` N+1 Redis invalidation fetches all historically soft-deleted rows

**Dimension**: Performance, Correctness  
**File**: `apps/core-api/src/services/layout-config.service.ts` — `softDeleteByPlugin` method  
**Spec Reference**: NFR-005 (cache invalidation correctness)

**Description**:

After bulk soft-deleting rows, the service queries:

```typescript
const deleted = await db.layoutConfig.findMany({
  where: { pluginId, tenantId, deletedAt: { not: null } },
});
```

This retrieves **all** historically soft-deleted rows for the plugin+tenant pair, not
just the ones deleted in the current operation. On a tenant with many historical
deletions, this (a) returns a large result set unnecessarily, (b) queues cache
invalidations for keys that are already stale, and (c) exposes deleted config IDs to
in-memory processing unnecessarily.

**Fix**: Capture the IDs before the `updateMany` call, then use those specific IDs for
Redis invalidation:

```typescript
const toDelete = await db.layoutConfig.findMany({
  where: { pluginId, tenantId, deletedAt: null },
  select: { id: true, formId: true, workspaceId: true },
});
await db.layoutConfig.updateMany({ where: { pluginId, tenantId, deletedAt: null }, ... });
// Then invalidate only `toDelete` entries
```

---

### LOW Severity

---

#### NEW-L-001 — ETag optimistic concurrency silently non-functional (header vs body mismatch)

**Dimension**: Correctness  
**File**: `apps/web/src/api/layout-config.ts` lines 138–143; `apps/core-api/src/routes/layout-config.ts`  
**Spec Reference**: Edge Case #5 (concurrent edits), NFR-007

The API client sends ETag as `body.etag` (workaround noted in code comment) but the
backend reads `request.headers['if-match']` only. The ETag-based concurrency guard is
dead. If two admins save simultaneously, the second save will overwrite the first
without any conflict error. This is an accepted workaround but should be tracked as a
known limitation; the current implementation silently gives a false sense of optimistic
locking.

**Recommendation**: Add a code comment noting this is a known gap (Edge Case #5 is
**not** implemented), or add a TODO with a tracking issue. Do not let it appear to
callers as if concurrency protection is active.

---

#### NEW-L-002 — `FieldConfigTable` missing `scope="row"` on row header cells

**Dimension**: UX Quality (Accessibility)  
**File**: `apps/web/src/components/layout-engine/FieldConfigTable.tsx` line 165  
**Spec Reference**: Constitution Art. 1.3 (WCAG 2.1 AA)

`<td role="rowheader">` is used without `scope="row"`. Screen readers use `scope` to
associate header cells with their data cells. Without it, some assistive technologies
will not correctly announce the row context. Add `scope="row"` to each row-header cell.

---

#### NEW-L-003 — No React Query cache invalidation from `LayoutConfigPanel` after save

**Dimension**: UX Quality  
**File**: `apps/web/src/components/layout-engine/LayoutConfigPanel.tsx`; `apps/web/src/hooks/useResolvedLayout.ts`  
**Spec Reference**: FR-017 (60-second staleTime acceptable), NFR-008

After a successful save, `LayoutConfigPanel` does not call
`queryClient.invalidateQueries(['layout-engine', 'resolved', formId])`. Tenant admin
saves take effect on the backend immediately (Redis cache TTL 300s), but the frontend
displays stale resolved layouts for up to 60 seconds — including in the admin's own
`RolePreviewPanel`. The 60-second stale window is documented as acceptable for end
users but is surprising for the admin doing the save.

**Recommendation**: Call `invalidateQueries` after a successful save to give the admin
immediate feedback of their own changes in the preview panel.

---

#### NEW-L-004 — Missing `return` after `reply.code(503).send()` in `layout-readonly-guard` fail-closed path

**Dimension**: Correctness  
**File**: `apps/core-api/src/middleware/layout-readonly-guard.ts` lines 206–210

After sending a 503 in the catch block, the function does not `return`. Fastify will
log a "reply already sent" warning on every Redis failure. The user-visible behavior is
correct (503 is sent once), but the missing `return` is a latent bug that will cause
confusing log noise in production and could mask genuine errors.

**Fix**: Add `return` after `reply.code(503).send(...)`.

---

#### NEW-L-005 — `validateSize` is never called from PUT route handlers

**Dimension**: Correctness  
**File**: `apps/core-api/src/routes/layout-config.ts` PUT handlers  
**Spec Reference**: Edge Case #6 (256 KB JSONB payload guard), NFR-007

`LayoutConfigValidationService.validateSize()` is implemented and tested, but the PUT
route handlers only call `layoutConfigService.validate()` (which calls
`validateAgainstManifest` and `detectRequiredFieldWarnings`). `validateSize` is never
invoked in any route handler. Oversized payloads bypass the 256 KB guard and proceed
directly to the DB, potentially causing PostgreSQL JSON field errors or silent truncation.

**Fix**: Add `if (!validationService.validateSize(body)) return reply.code(400).send({...})`
before the DB write in both tenant-scope and workspace-scope PUT handlers.

---

## Constitution Compliance Check

| Article                            | Requirement                                | Status                                                                             |
| ---------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| Art. 1.2 (Security First)          | SQL injection prevention, RBAC             | ✅ Compliant — Prisma ORM, RBAC guards on all mutation routes                      |
| Art. 1.2 (Multi-Tenancy Isolation) | Tenant data isolation                      | ✅ Compliant — `tenantId` filter on all queries                                    |
| Art. 1.2 (API-First)               | Versioned REST API                         | ✅ Compliant — `/api/v1/layout-configs`                                            |
| Art. 1.2 (Test-Driven)             | ≥80% coverage                              | ⚠️ Partial — US-007 save/warning flow untested (NEW-M-006)                         |
| Art. 1.3 (UX Standards)            | WCAG 2.1 AA                                | ⚠️ Partial — nested `role="dialog"` (NEW-M-001), missing `scope="row"` (NEW-L-002) |
| Art. 2.1 (Stack)                   | Approved technologies                      | ✅ Compliant                                                                       |
| Art. 3.3 (Data Patterns)           | Prisma ORM, parameterized queries          | ✅ Compliant                                                                       |
| Art. 3.4 (API Standards)           | REST conventions, pagination, error format | ⚠️ PATCH vs PUT mismatch (NEW-H-001)                                               |
| Art. 4.1 (Coverage)                | ≥80% overall, ≥85% core modules            | ⚠️ See NEW-M-006 — US-007 paths uncovered                                          |
| Art. 5.1 (Auth/AuthZ)              | RBAC, tenant validation                    | ⚠️ Feature flag silently skips on missing tenantSlug (NEW-M-005)                   |
| Art. 6.1 (Error Handling)          | Graceful error responses                   | ⚠️ Missing `return` in 503 path (NEW-L-004)                                        |
| Art. 8.1 (Test Types)              | Unit, integration, E2E                     | ⚠️ US-007 acceptance paths not covered (NEW-M-006)                                 |
| Art. 9.1 (Zero-Downtime)           | Backward-compatible migrations             | ✅ Compliant                                                                       |

---

## Findings Summary

### All NEW findings this pass

| ID        | Severity | Dimension                        | Description                                                                          | Blocks Merge?                  |
| --------- | -------- | -------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------ |
| NEW-H-001 | HIGH     | Correctness                      | PATCH vs PUT HTTP method mismatch — saves never succeed                              | ✅ Yes                         |
| NEW-H-002 | HIGH     | Correctness, Test-Spec Coherence | `ResolvedField` missing `required`/`defaultValue` — FR-010 hidden injection dead     | ✅ Yes                         |
| NEW-M-001 | MEDIUM   | UX/Accessibility                 | Nested `role="dialog"` in `RequiredFieldWarningDialog`                               | No (fix pre-merge recommended) |
| NEW-M-002 | MEDIUM   | Correctness, UX                  | `warningItems` hardcodes `"affected roles"` string instead of actual role names      | No                             |
| NEW-M-003 | MEDIUM   | Correctness                      | `readonly` treated as warning trigger — false positives on valid configs             | No (register as TD)            |
| NEW-M-004 | MEDIUM   | Correctness                      | `buildManifestDefaults` uses array index instead of manifest `order`                 | No (register as TD)            |
| NEW-M-005 | MEDIUM   | Security                         | Feature flag preHandler silently passes when tenantSlug absent                       | No (fix pre-merge recommended) |
| NEW-M-006 | MEDIUM   | Test-Spec Coherence              | US-007 save + warning dialog flow is completely untested                             | No (register as TD)            |
| NEW-M-007 | MEDIUM   | Performance                      | `softDeleteByPlugin` fetches all historical soft-deleted rows for Redis invalidation | No (register as TD)            |
| NEW-L-001 | LOW      | Correctness                      | ETag concurrency silently non-functional                                             | No (document as known gap)     |
| NEW-L-002 | LOW      | Accessibility                    | Missing `scope="row"` on row header cells in `FieldConfigTable`                      | No                             |
| NEW-L-003 | LOW      | UX Quality                       | No React Query invalidation after save — stale preview for admin                     | No                             |
| NEW-L-004 | LOW      | Correctness                      | Missing `return` after 503 in readonly guard fail-closed path                        | No                             |
| NEW-L-005 | LOW      | Correctness                      | `validateSize` never called from route handlers — 256 KB guard bypassed              | No                             |

### Residual findings (from Pass 2, still open)

| ID    | Severity | Description                                                        | Disposition         |
| ----- | -------- | ------------------------------------------------------------------ | ------------------- |
| M-001 | MEDIUM   | Stale `loadForms` closure in `LayoutConfigPanel`                   | TD-026 (post-merge) |
| M-002 | MEDIUM   | `buildSaveInput` missing `useCallback`, eslint-disable suppression | TD-027 (post-merge) |
| M-004 | MEDIUM   | `savedConfig.updatedBy` renders raw UUID                           | TD-028 (post-merge) |
| L-001 | LOW      | `SectionWrapper` missing `label` prop                              | TD-029 (post-merge) |

---

## Required Actions Before Merge

1. **Fix NEW-H-001**: Change `.patch()` to `.put()` in `saveLayoutConfig` and
   `saveWorkspaceLayoutConfig` in `apps/web/src/api/layout-config.ts`.

2. **Fix NEW-H-002**: Add `required?: boolean` and `defaultValue?: string | null` to
   `ResolvedField` in `packages/types`, populate these fields from the backend
   `resolveForUser` response, and fix the `LayoutAwareForm.test.tsx` fabricated type
   mismatch.

3. **Fix NEW-M-001** (recommended pre-merge): Remove `role="dialog"` / `aria-modal`
   from the inner `<div>` in `RequiredFieldWarningDialog.tsx`.

4. **Fix NEW-M-005** (recommended pre-merge): Change silent skip on missing `tenantSlug`
   in feature flag preHandler to a 401 response.

---

## Recommended TD Registrations (post-merge)

| TD ID  | Finding          | Description                                                |
| ------ | ---------------- | ---------------------------------------------------------- |
| TD-026 | M-001 (residual) | Stale `loadForms` closure                                  |
| TD-027 | M-002 (residual) | `buildSaveInput` no `useCallback`                          |
| TD-028 | M-004 (residual) | `updatedBy` renders raw UUID                               |
| TD-029 | L-001 (residual) | `SectionWrapper` missing `label`                           |
| TD-030 | NEW-M-003        | `readonly` false positive in `detectRequiredFieldWarnings` |
| TD-031 | NEW-M-004        | `buildManifestDefaults` uses array index for `order`       |
| TD-032 | NEW-M-006        | US-007 save + warning dialog untested                      |
| TD-033 | NEW-M-007        | `softDeleteByPlugin` N+1 Redis invalidation                |
| TD-034 | NEW-L-001        | ETag concurrency non-functional — document as known gap    |
| TD-035 | NEW-L-002        | Missing `scope="row"` in `FieldConfigTable`                |
| TD-036 | NEW-L-003        | No React Query invalidation after save                     |
| TD-037 | NEW-L-004        | Missing `return` in 503 path in `layout-readonly-guard`    |
| TD-038 | NEW-L-005        | `validateSize` not called from route handlers              |
| TD-039 | NEW-M-002        | `warningItems` hardcodes role string                       |

---

_Review completed: March 8, 2026_  
_Methodology: FORGE adversarial review, 7 dimensions_  
_Next step: Fix NEW-H-001 and NEW-H-002, then request Pass 4 review_
