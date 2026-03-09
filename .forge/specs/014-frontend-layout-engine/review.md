# FORGE Adversarial Review: Spec 014 — Frontend Layout Engine

> Dual-model review synthesized from forge-reviewer (Claude) and
> forge-reviewer-codex (GPT-Codex) findings.

| Field       | Value                                                         |
| ----------- | ------------------------------------------------------------- |
| Spec        | 014 — Frontend Layout Engine                                  |
| Review Date | 2026-03-08                                                    |
| Reviewer    | forge-reviewer (Claude) + forge-reviewer-codex (GPT-Codex)    |
| Tasks       | T014-01 through T014-31 (T014-32 pending)                     |
| Verdict     | **🔴 REQUEST CHANGES — 5 HIGH severity findings block merge** |

---

## Executive Summary

The Spec 014 implementation is architecturally sound in its patterns, correctly
applies tenant-aware raw SQL, implements fail-open semantics, and follows the
established service/route/middleware structure. However, **five HIGH severity
issues block merge**:

1. The migration creates `layout_configs` in the `core` schema — a direct
   multi-tenancy isolation violation (ADR-002 / NFR-005).
2. Role resolution ignores `workspaceId`, returning roles across all workspaces
   — a security bug allowing privilege escalation across workspaces.
3. The workspace→tenant cache fallback writes under the wrong cache key,
   corrupting future workspace-scoped resolutions.
4. The PUT route does not call `validateAgainstManifest`, leaving FR-020 /
   NFR-012 completely unimplemented.
5. T014-32 (feature flag `layout_engine_enabled`) is marked `[ ]` incomplete
   — Constitution Art. 9.1 requires feature flags for all user-facing changes.

Additionally, 9 MEDIUM and 5 LOW findings require resolution or documented
justification before this PR is approved.

---

## Findings

### HIGH Severity

---

#### FORGE-014-H01 — Schema placement bug in migration (multi-tenancy violation)

| Field     | Value                                                                                    |
| --------- | ---------------------------------------------------------------------------------------- |
| Severity  | **HIGH**                                                                                 |
| Dimension | Security / Correctness                                                                   |
| File      | `packages/database/prisma/migrations/20260308000000_create_layout_configs/migration.sql` |
| Lines     | 21, 48, 53, 57, 62                                                                       |
| Spec Refs | FR-002, NFR-005, ADR-002, Constitution Art. 1.2 §2                                       |

**Description:**
Every SQL statement in the migration targets `"core"."layout_configs"`:

```sql
-- Line 21
CREATE TABLE IF NOT EXISTS "core"."layout_configs" (…)

-- Line 48
CREATE UNIQUE INDEX … ON "core"."layout_configs" …

-- Line 57
CREATE INDEX … ON "core"."layout_configs" …
```

FR-002 explicitly states: _"A `layout_configs` table in the **tenant schema**
stores layout configurations."_ ADR-002 mandates per-tenant schema isolation.
The migration comment on line 3–4 even states _"layout_configs lives in the
TENANT schema"_, but the SQL contradicts this.

**Impact:** All tenants write and read from one shared `core.layout_configs`
table. Tenant A's admin can read and overwrite Tenant B's layout configs.
This is a critical cross-tenant data leakage violation.

**The service layer** (`layout-config.service.ts`) correctly uses
`Prisma.raw(schemaName)` to target tenant schemas at runtime — but the table
does not exist there because the migration only created it in `core`. Every
service call will fail with a "relation does not exist" error in production.

**Fix:**
Replace all `"core"."layout_configs"` references with the tenant schema
template placeholder (e.g., `{tenant_schema}."layout_configs"` or the
project-standard approach). The migration must be applied to each tenant
schema via `TenantMigrationService`, consistent with ADR-002 and the pattern
used by all other tenant-scoped tables. Add an integration test asserting
that tenant A's config is inaccessible from tenant B's schema context
(NFR-005 acceptance criterion).

---

#### FORGE-014-H02 — `resolveEffectiveRoles` ignores `workspaceId` parameter

| Field     | Value                                                 |
| --------- | ----------------------------------------------------- |
| Severity  | **HIGH**                                              |
| Dimension | Security / Correctness                                |
| File      | `apps/core-api/src/services/layout-config.service.ts` |
| Lines     | 786–846                                               |
| Spec Refs | FR-006, FR-007, ADR-024, Constitution Art. 5.1 (RBAC) |

**Description:**
The method signature accepts `_workspaceId` (prefixed with underscore,
never used):

```typescript
// Line 790
private async resolveEffectiveRoles(
  tenantSlug: string,
  userId: string,
  keycloakRoles: string[],
  _workspaceId?: string | null   // ← ignored
): Promise<RoleKey[]> {
```

The DB query at line 815–821 fetches team member roles across **all**
workspaces in the tenant:

```typescript
const teamRoles = await db.$queryRaw<RawTeamRoleRow[]>(
  Prisma.sql`
    SELECT DISTINCT tm.role
    FROM ${schema}."team_members" tm
    WHERE tm.user_id = ${userId}
    -- ← NO workspace filter
  `
);
```

**Impact:** A user who is `ADMIN` in Workspace A and `VIEWER` in Workspace B
will receive both `ADMIN` and `VIEWER` roles when resolving layouts for
Workspace B. Since "most permissive wins", they will see `ADMIN` visibility
in Workspace B — granting access to fields they should not see. This violates
ADR-024's per-workspace role scoping and spec FR-006.

**Fix:**
When `workspaceId` is provided, add a JOIN to filter team memberships to
teams associated with that workspace:

```sql
SELECT DISTINCT tm.role
FROM {schema}."team_members" tm
INNER JOIN {schema}."team_workspace_assignments" twa
  ON twa.team_id = tm.team_id
WHERE tm.user_id = $userId
  AND twa.workspace_id = $workspaceId  -- ← add this
```

The exact join table name must be verified against the schema. Add a test
covering the cross-workspace privilege isolation scenario from ADR-024.

---

#### FORGE-014-H03 — Cache key collision on workspace→tenant fallback

| Field     | Value                                                 |
| --------- | ----------------------------------------------------- |
| Severity  | **HIGH**                                              |
| Dimension | Correctness                                           |
| File      | `apps/core-api/src/services/layout-config.service.ts` |
| Lines     | 705–724                                               |
| Spec Refs | FR-009, NFR-011                                       |

**Description:**
When a workspace config does not exist, the code falls back to the tenant
config — but then writes that tenant config under the workspace-scope cache key:

```typescript
// Line 705–722
const scopeLabel = workspaceId ? `workspace:${workspaceId}` : 'tenant'; // Line 706

let config = await this.loadFromCache(tenantId, formId, scopeLabel); // Uses workspace key

if (!config) {
  config = await this.getConfig(tenantSlug, formId, scopeType, workspaceId);

  // Workspace config not found — fall back to tenant config
  if (!config && workspaceId) {
    config = await this.getConfig(tenantSlug, formId, 'tenant', null); // Fetches tenant config
  }

  if (config) {
    await this.writeToCache(tenantId, formId, scopeLabel, config); // Writes to workspace key!
  }
}
```

**Impact:**

1. The workspace-scope cache now contains tenant-scope data for this workspace.
   If a workspace config is later created, the next request will serve the
   stale tenant config from cache until TTL expires (up to 5 minutes).
2. FR-009 requires workspace overrides to _"fully replace"_ tenant configs —
   but the cache conflation means the correct workspace config will be missed
   during the TTL window after creation.

**Fix:**
When falling back from workspace to tenant config, resolve the scope label
for cache purposes based on the **actual config found**, not the requested
scope. Either: (a) do not cache fallback configs under the workspace key
(only cache under `tenant` key), or (b) when a fallback occurs, write the
fetched config under the `tenant` scope key and invalidate the workspace key:

```typescript
if (!config && workspaceId) {
  config = await this.getConfig(tenantSlug, formId, 'tenant', null);
  if (config) {
    // Write to the TENANT key, not the workspace key
    await this.writeToCache(tenantId, formId, 'tenant', config);
  }
}
```

---

#### FORGE-014-H04 — PUT route does not call `validateAgainstManifest`

| Field     | Value                                         |
| --------- | --------------------------------------------- |
| Severity  | **HIGH**                                      |
| Dimension | Correctness / Security                        |
| File      | `apps/core-api/src/routes/layout-config.ts`   |
| Lines     | 255–298 (tenant PUT), 444–497 (workspace PUT) |
| Spec Refs | FR-020, NFR-012, Constitution Art. 4.1        |

**Description:**
FR-020 requires: _"Backend API validates submitted field overrides against the
plugin manifest's `formSchema`. Overrides referencing non-existent `fieldId`
or `sectionId` values are rejected with `400 INVALID_FIELD_REFERENCE`."_
NFR-012 requires: _"Validation must reject 100% of configs referencing
non-existent field IDs."_

Both PUT handlers (tenant and workspace scope) call `parseBody()` for Zod
schema validation, then directly call `layoutConfigService.saveConfig()`.
Neither calls `layoutConfigService.validate()` (which wraps
`layoutConfigValidationService.validateAgainstManifest()`).

`LayoutConfigValidationService` was implemented in T014-06 and is tested in
T014-25 — but it is never invoked on the write path.

**Impact:** An admin can save layout configs with arbitrary `fieldId` values
that do not exist in any plugin manifest. These will be stored and returned
on reads, but silently skipped during resolution (not an error). The
`INVALID_FIELD_REFERENCE` error code documented in spec §8.2 can never be
returned. FR-020 and the entire validation service implementation are dead
code.

**Fix:**
In both PUT handlers, after `parseBody()` succeeds and before calling
`saveConfig()`, fetch the plugin manifest for the `formId` and call
`layoutConfigService.validate()`. Return `400 INVALID_FIELD_REFERENCE` if
validation fails:

```typescript
// After parseBody:
const formSchema = await layoutConfigService.getFormSchemaForPlugin(
  ctx.tenantId,
  body.pluginId,
  formId
);
if (!formSchema) {
  return reply.code(404).send({
    error: { code: 'PLUGIN_NOT_FOUND', message: `No form schema for formId "${formId}"` },
  });
}
const validation = layoutConfigService.validate(body, formSchema);
if (!validation.valid && !body.acknowledgeWarnings) {
  return reply.code(400).send({
    error: { code: validation.errorCode, message: validation.message },
  });
}
```

Note: `getFormSchema` is currently `private` on the service — it must be
exposed or a dedicated method added for use by the route layer.

---

#### FORGE-014-H05 — T014-32 incomplete: no feature flag backend enforcement

| Field     | Value                                                                            |
| --------- | -------------------------------------------------------------------------------- |
| Severity  | **HIGH**                                                                         |
| Dimension | Correctness / Test-Spec Coherence                                                |
| File      | `apps/core-api/src/routes/layout-config.ts`, `apps/web/src/lib/feature-flags.ts` |
| Lines     | tasks.md line 529 (`[ ] T014-32`)                                                |
| Spec Refs | Constitution Art. 9.1, T014-32 acceptance criteria                               |

**Description:**
`tasks.md` shows T014-32 as `[ ]` (pending). Constitution Art. 9.1 states:
_"Feature flags required for all user-facing changes."_ The `layout_engine_enabled`
feature flag is referenced in the decision log and in the frontend
`feature-flags.ts`, but:

- No layout config route checks a feature flag.
- The backend has no flag gate — a disabled tenant still gets full API
  access to all layout config endpoints.
- The admin panel route returns a live page regardless of flag state.

**Impact:**
The feature cannot be rolled out gradually per-tenant as mandated by
Constitution Art. 9.1. A tenant with the flag disabled would still have all
layout config endpoints active and data-modifiable.

**Fix:**
Implement the backend flag gate per T014-32 acceptance criteria:

- Read `layout_engine_enabled` from the tenant feature flags table.
- When disabled: `GET /api/v1/layout-configs/:formId/resolved` returns
  manifest defaults; all admin mutation routes return `404`.
- This can be a route-level `preHandler` or a per-request check inside
  `resolveTenantContext`.

---

### MEDIUM Severity

---

#### FORGE-014-M01 — `buildManifestDefaults` omits sections and columns

| Field     | Value                                                 |
| --------- | ----------------------------------------------------- |
| Severity  | MEDIUM                                                |
| Dimension | Correctness                                           |
| File      | `apps/core-api/src/services/layout-config.service.ts` |
| Lines     | 986–999                                               |
| Spec Refs | FR-004, FR-005, NFR-008                               |

**Description:**
The `buildManifestDefaults()` method — used both for the fail-open path
(NFR-008) and when no config exists — always returns `sections: []` and
`columns: []`:

```typescript
// Lines 986–999
private buildManifestDefaults(formId: string, fields: FormSchema['fields']): ResolvedLayout {
  return {
    formId,
    source: 'manifest',
    sections: [],          // ← always empty
    fields: fields.map(…),
    columns: [],           // ← always empty
  };
}
```

When the manifest has sections and columns (the normal case), users on the
fail-open path receive no column visibility and no section ordering — so all
columns are invisible and sections are rendered in undefined order.

**Fix:**
Pass the full `FormSchema` to `buildManifestDefaults` and populate sections
and columns from manifest defaults:

```typescript
private buildManifestDefaults(formId: string, formSchema: FormSchema): ResolvedLayout {
  return {
    formId,
    source: 'manifest',
    sections: formSchema.sections.map((s, i) => ({ sectionId: s.sectionId, order: i })),
    fields: formSchema.fields.map((f, i) => ({ fieldId: f.fieldId, order: i, visibility: 'visible', readonly: false })),
    columns: formSchema.columns.map((c) => ({ columnId: c.columnId, visibility: 'visible' })),
  };
}
```

Update all call sites to pass the full schema.

---

#### FORGE-014-M02 — `strippedFields` audit log always empty

| Field     | Value                                                   |
| --------- | ------------------------------------------------------- |
| Severity  | MEDIUM                                                  |
| Dimension | Correctness / Security                                  |
| File      | `apps/core-api/src/middleware/layout-readonly-guard.ts` |
| Lines     | 106–124                                                 |
| Spec Refs | FR-021, NFR-006, Constitution Art. 6.3                  |

**Description:**
The middleware deletes read-only fields from `mutableBody` (which is a
reference to the same object as `body`) **before** the log statement checks
which fields were stripped:

```typescript
// Lines 106–124
for (const fieldId of readonlyFieldIds) {
  if (Object.prototype.hasOwnProperty.call(mutableBody, fieldId)) {
    delete mutableBody[fieldId];   // ← field deleted here
    stripped = true;
  }
}

if (stripped) {
  logger.info({
    strippedFields: [...readonlyFieldIds].filter((id) =>
      Object.prototype.hasOwnProperty.call(body, id)  // ← body === mutableBody, field already gone
    ),
  }, …);
}
```

Because `body` and `mutableBody` are the same object reference, every field
was deleted before the `.filter()` check. `strippedFields` is always `[]` in
the log.

**Fix:**
Capture the stripped fields list during the deletion loop:

```typescript
const stripped: string[] = [];
for (const fieldId of readonlyFieldIds) {
  if (Object.prototype.hasOwnProperty.call(mutableBody, fieldId)) {
    delete mutableBody[fieldId];
    stripped.push(fieldId);
  }
}

if (stripped.length > 0) {
  logger.info({ formId, tenantId, userId: request.user.id, strippedFields: stripped }, …);
}
```

---

#### FORGE-014-M03 — `deleteConfig` performs hard DELETE instead of soft delete

| Field     | Value                                                 |
| --------- | ----------------------------------------------------- |
| Severity  | MEDIUM                                                |
| Dimension | Correctness                                           |
| File      | `apps/core-api/src/services/layout-config.service.ts` |
| Lines     | 477–479                                               |
| Spec Refs | FR-024 ("soft-deleted"), US-010 (revert path)         |

**Description:**
`deleteConfig()` executes a hard `DELETE`:

```typescript
// Line 477–479
await db.$executeRaw(
  Prisma.sql`DELETE FROM ${schema}."layout_configs" WHERE id = ${existing.id}::uuid`
);
```

FR-024 states: _"all layout configs referencing that plugin's forms are
soft-deleted (marked `deleted_at`)."_ The `deleted_at` column exists
precisely for this purpose.

While FR-024 specifically addresses plugin uninstall, the admin-initiated
DELETE endpoint must also use soft-delete to: (a) preserve the `previous_version`
chain for potential recovery, and (b) prevent data loss when an admin
accidentally deletes a config. The `revertConfig` path also cannot work
after a hard delete.

**Fix:**
Change to a soft delete in `deleteConfig()`:

```sql
UPDATE {schema}."layout_configs"
SET deleted_at = NOW(), updated_by = $userId, updated_at = NOW()
WHERE id = $id::uuid
```

Ensure `getConfig()` already filters `AND deleted_at IS NULL` (it does —
lines 222–238), so soft-deleted records are correctly excluded from reads.

---

#### FORGE-014-M04 — `checkWorkspaceAdminRole` uses `findFirst`, misses multi-team membership

| Field     | Value                                             |
| --------- | ------------------------------------------------- |
| Severity  | MEDIUM                                            |
| Dimension | Correctness / Security                            |
| File      | `apps/core-api/src/routes/layout-config.ts`       |
| Lines     | 665–678                                           |
| Spec Refs | FR-007 ("most permissive wins"), ADR-024, NFR-007 |

**Description:**
`checkWorkspaceAdminRole` uses `db.teamMember.findFirst` — it returns the
first matching team membership and checks only that one role:

```typescript
// Lines 665–677
const member = await db.teamMember.findFirst({
  where: {
    userId,
    team: { workspaceTeams: { some: { workspaceId } } },
  },
  select: { role: true },
});

if (!member) return false;
return WS_ADMIN_ROLES.has(member.role); // checks only the first row
```

If a user is `MEMBER` in Team A and `ADMIN` in Team B, both associated with
the same workspace, `findFirst` may return the `MEMBER` record first (no
ORDER BY) — denying admin access incorrectly.

**Fix:**
Use `findMany` and check whether _any_ returned role is in `WS_ADMIN_ROLES`:

```typescript
const members = await db.teamMember.findMany({
  where: {
    userId,
    team: { workspaceTeams: { some: { workspaceId } } },
  },
  select: { role: true },
});

return members.some((m) => WS_ADMIN_ROLES.has(m.role));
```

---

#### FORGE-014-M05 — ETag GET header never set; round-trip relies on body field

| Field     | Value                                                                            |
| --------- | -------------------------------------------------------------------------------- |
| Severity  | MEDIUM                                                                           |
| Dimension | Correctness                                                                      |
| File      | `apps/core-api/src/routes/layout-config.ts`, `apps/web/src/api/layout-config.ts` |
| Lines     | routes: 220–246; api client lines ~143                                           |
| Spec Refs | Edge Case #5 (ETag / 409 CONFLICT), FR-015                                       |

**Description:**
The spec (Edge Case #5) documents optimistic concurrency via `If-Match` /
`ETag` headers. The PUT handler correctly reads `request.headers['if-match']`
— but the GET handlers (`GET /layout-configs/:formId` and the workspace
equivalent) never set an `ETag` response header.

Without a response `ETag`, the admin UI frontend cannot obtain the ETag
from standard HTTP header semantics. The API client works around this by
using `updatedAt` from the response body — but no test exercises the full
round-trip (GET → extract ETag → PUT with If-Match → expect 409 on
concurrent edit).

**Fix:**
Add `reply.header('ETag', config.updatedAt.toISOString())` to both GET
handlers. Update the integration test (T014-26 acceptance criterion "concurrent
edit conflict (409) verified") to test the full HTTP header round-trip, not
just a direct service-level call.

---

#### FORGE-014-M06 — `SaveLayoutConfigInput` type collision between packages

| Field     | Value                                                                                      |
| --------- | ------------------------------------------------------------------------------------------ |
| Severity  | MEDIUM                                                                                     |
| Dimension | Maintainability                                                                            |
| File      | `packages/types/src/layout-config.ts`, `apps/core-api/src/schemas/layout-config.schema.ts` |
| Spec Refs | T014-01 (types), T014-04 (schemas)                                                         |

**Description:**
`packages/types/src/layout-config.ts` exports `SaveLayoutConfigInput` as a
hand-written TypeScript interface. `apps/core-api/src/schemas/layout-config.schema.ts`
exports a separate `SaveLayoutConfigInput` as `z.infer<typeof saveLayoutConfigSchema>`.

The route file imports from the schema package (`import type { SaveLayoutConfigInput }
from '../schemas/layout-config.schema.js'`). Frontend components import from
`@plexica/types`. These two types can drift silently — no TypeScript error
will surface until the types diverge in a breaking way.

**Fix:**
Remove the hand-written interface from `@plexica/types` and re-export the
inferred Zod type instead, or export the Zod schema from a shared package so
the inferred type is the single source of truth. The canonical type must be
the one validated by Zod (the backend source of truth for the wire format).

---

#### FORGE-014-M07 — `LayoutConfigPanel` uses `window.confirm` for destructive confirmations

| Field     | Value                                                         |
| --------- | ------------------------------------------------------------- |
| Severity  | MEDIUM                                                        |
| Dimension | UX Quality / Accessibility                                    |
| File      | `apps/web/src/components/layout-engine/LayoutConfigPanel.tsx` |
| Spec Refs | NFR-010, Constitution Art. 1.3 (WCAG 2.1 AA)                  |

**Description:**
`LayoutConfigPanel` uses `window.confirm()` for two flows:

- "Reset to defaults" confirmation
- "You have unsaved changes — switch form?" confirmation

`window.confirm()` violates WCAG 2.1 AA (SC 4.1.3 Status Messages; SC 4.1.2
Name, Role, Value): it cannot be styled to match the design system, it is
not keyboard-navigable in all screen reader / browser combinations, it is
blocked in sandboxed iframes, and it provides no focus management (WCAG 2.1
SC 2.4.3).

The same file correctly implements `RequiredFieldWarningDialog` as a
proper focus-trapped modal for the required-field flow.

**Fix:**
Replace both `window.confirm()` calls with the existing
`RequiredFieldWarningDialog` pattern (or a generic `ConfirmationDialog`
component from `@plexica/ui` if one exists). Both dialogs should: trap
focus, return focus to the trigger on close, be dismissible via Esc,
have initial focus on the Cancel/safe action, and use `role="alertdialog"`.

---

#### FORGE-014-M08 — `ROLE_KEYS` hardcoded in `LayoutConfigPanel`, duplicating `@plexica/types`

| Field     | Value                                                         |
| --------- | ------------------------------------------------------------- |
| Severity  | MEDIUM                                                        |
| Dimension | Maintainability                                               |
| File      | `apps/web/src/components/layout-engine/LayoutConfigPanel.tsx` |
| Lines     | ~645–653                                                      |
| Spec Refs | FR-006 (RoleKey definition), T014-01                          |

**Description:**
`LayoutConfigPanel` defines its own local `ROLE_KEYS` array (the set of
roles rendered as column headers in the config table). `@plexica/types`
exports `LAYOUT_ROLE_KEYS` for exactly this purpose (T014-01). The
duplication means a new role added to `RoleKey` in the types package will
not appear in the admin panel column headers until a manual update to this
file.

**Fix:**
Remove the local `ROLE_KEYS` constant and import `LAYOUT_ROLE_KEYS` from
`@plexica/types`.

---

#### FORGE-014-M09 — Field labels degrade to raw IDs when `formSchema.schema` is absent

| Field     | Value                                                         |
| --------- | ------------------------------------------------------------- |
| Severity  | MEDIUM                                                        |
| Dimension | UX Quality                                                    |
| File      | `apps/web/src/components/layout-engine/LayoutConfigPanel.tsx` |
| Lines     | ~588                                                          |
| Spec Refs | FR-012 (admin panel field display), US-008                    |

**Description:**
When building the field list for the config table, `LayoutConfigPanel`
attempts `selectedForm.schema.fields.find(f => f.fieldId === o.fieldId)?.label`
to get a human-readable label. When `selectedForm.schema` is absent (which
is the common case because `ConfigurableFormSummary` from
`GET /api/v1/layout-configs/forms` does not carry a `schema` property),
the fallback is `label: o.fieldId` — showing raw IDs like `crm.first-name`
instead of "First Name".

**Impact:** Admins in production see machine-readable field IDs as column
labels in the layout configuration table — violating US-008's acceptance
criterion: _"a table is displayed with columns: Field Name, …"_.

**Fix:**
The `GET /api/v1/layout-configs/forms` endpoint should include the full
`FormSchema` (or at minimum `fields[].label`) in each `ConfigurableFormSummary`
response. Alternatively, the admin panel should make a secondary request to
load the full form schema when a form is selected. The current `fieldCount` /
`sectionCount` / `columnCount` in `ConfigurableFormSummary` is insufficient
for the label resolution the panel requires.

---

### LOW Severity

---

#### FORGE-014-L01 — `VisibilityToggle` ARIA label announces current state, not next state

| Field     | Value                                                        |
| --------- | ------------------------------------------------------------ |
| Severity  | LOW                                                          |
| Dimension | Accessibility / UX Quality                                   |
| File      | `apps/web/src/components/layout-engine/VisibilityToggle.tsx` |
| Spec Refs | NFR-010, Constitution Art. 1.3 (WCAG 2.1 SC 4.1.2)           |

**Description:**
The ARIA label on the cycling toggle button reads the **current** state
(e.g., `"Budget visibility for ADMIN: editable"`). WCAG 2.1 SC 4.1.2 and
the WAI-ARIA Authoring Practices Guide for toggle buttons recommend that
activation controls describe the **next** action or **next** state — e.g.,
`"Set Budget visibility for ADMIN to read-only"`.

**Fix:**
Update the ARIA label template to describe the next state in the cycle:

```typescript
const nextLabel = NEXT_STATE_LABELS[currentState];
ariaLabel = `Set ${fieldLabel} visibility for ${role}: ${nextLabel}`;
```

---

#### FORGE-014-L02 — Integration test authorization assertions use `[401, 403]` union

| Field     | Value                                                                                |
| --------- | ------------------------------------------------------------------------------------ |
| Severity  | LOW                                                                                  |
| Dimension | Test-Spec Coherence                                                                  |
| File      | `apps/core-api/src/__tests__/layout-config/integration/layout-config.routes.test.ts` |
| Spec Refs | NFR-007 (RBAC enforcement)                                                           |

**Description:**
Several authorization-related integration tests accept either 401 or 403:

```typescript
expect([401, 403]).toContain(resp.statusCode);
```

This masks a real distinction: 401 means unauthenticated (missing/invalid
token); 403 means authenticated but unauthorized (wrong role). A test that
intends to verify _role-based_ access control (NFR-007) should assert
exactly `403`, not allow `401` to silently pass.

**Fix:**
Split each ambiguous assertion into the specific code expected by the
test scenario. Unauthenticated request tests should assert `401`;
authenticated-but-wrong-role tests should assert `403`.

---

#### FORGE-014-L03 — E2E Journey 4 does not assert `warnings` in response body

| Field     | Value                                                                     |
| --------- | ------------------------------------------------------------------------- |
| Severity  | LOW                                                                       |
| Dimension | Test-Spec Coherence                                                       |
| File      | `apps/core-api/src/__tests__/layout-config/e2e/layout-config.e2e.test.ts` |
| Spec Refs | FR-011, US-007 (required field warning flow)                              |

**Description:**
The E2E test for Journey 4 (required field warning flow) saves a config hiding
a required field and asserts `statusCode === 200`. It does not assert:

1. That the initial save returns `400 REQUIRED_FIELD_NO_DEFAULT`.
2. That the response body contains `warnings` with the affected field IDs.
3. That a re-save with `acknowledgeWarnings: true` succeeds.

**Fix:**
Add assertions for all three steps of the required-field acknowledgement
flow. This is the only E2E coverage for FR-011.

---

#### FORGE-014-L04 — `FieldConfigTable` position label uses stale total count for boundary

| Field     | Value                                                        |
| --------- | ------------------------------------------------------------ |
| Severity  | LOW                                                          |
| Dimension | Accessibility / UX Quality                                   |
| File      | `apps/web/src/components/layout-engine/FieldConfigTable.tsx` |
| Spec Refs | NFR-010 (WCAG 2.1 AA), Design Spec §field-config-table       |

**Description:**
The screen-reader position announcement says `"position X of N"` where N is
derived from `totalRows` (which includes stale/removed fields). The `down`
arrow button's disabled boundary is calculated from `sortedFields.length - 1`
(which excludes stale rows). For forms with stale references, the
announcement `"position 3 of 7"` may be read when there are only 5 active
rows — a minor WCAG SC 1.3.1 (Info and Relationships) discrepancy.

**Fix:**
Use `sortedFields.length` (active fields only) as the denominator in the
position announcement label, consistent with the boundary logic.

---

#### FORGE-014-L05 — `useResolvedLayout` `ResolvedField.readonly` field possibly missing from type

| Field     | Value                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------- |
| Severity  | LOW                                                                                                      |
| Dimension | Correctness                                                                                              |
| File      | `packages/types/src/layout-config.ts`, `apps/web/src/__tests__/layout-engine/useResolvedLayout.test.tsx` |
| Spec Refs | T014-01 (types), spec §8.1 (resolved layout response shape)                                              |

**Description:**
The service sets `readonly: vis === 'readonly'` on `ResolvedField` (lines
896–897). The test file's `MOCK_LAYOUT` does not include a `readonly` field
on `ResolvedField` objects. If `ResolvedField` in `@plexica/types` does not
declare `readonly: boolean`, TypeScript strict mode will not catch the
missing property in test mocks, and consuming components could receive
`undefined` for `readonly` instead of `false`.

**Fix:**
Verify that `ResolvedField` in `packages/types/src/layout-config.ts` declares
`readonly: boolean` (not optional). Update `MOCK_LAYOUT` in the test file to
include the `readonly` field on every field entry.

---

## Test Coverage Assessment

### Backend

| Area                      | Coverage Assessment     | Note                                                                                                       |
| ------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| Resolution engine (unit)  | High (≥ 20 test cases)  | FR-007/FR-008/FR-009 well covered                                                                          |
| Validation service (unit) | High                    | FR-010/FR-011/FR-020 covered                                                                               |
| API routes (integration)  | Moderate                | Authorization unions weaken RBAC tests (L02)                                                               |
| Read-only guard (unit)    | Unknown (file not read) | Needs verification                                                                                         |
| E2E                       | Partial                 | Journey 4 assertions incomplete (L03)                                                                      |
| **Tenant isolation**      | **NOT VERIFIED**        | **H01 means table doesn't exist in tenant schema — all integration tests against core schema are invalid** |

### Frontend

| Component           | Coverage Assessment     | Note                                             |
| ------------------- | ----------------------- | ------------------------------------------------ |
| `LayoutAwareForm`   | Good                    | States tested per T014-28                        |
| `LayoutAwareTable`  | Unknown (file not read) | Likely adequate per T014-28 description          |
| `VisibilityToggle`  | Unknown (file not read) | ARIA assertions needed for L01 fix               |
| `useResolvedLayout` | Good                    | Error/loading/cache states covered               |
| `LayoutConfigPanel` | No dedicated test file  | Largest component (750+ lines) has no unit tests |

**Critical gap:** `LayoutConfigPanel` — the most complex frontend component —
has no dedicated test file. It is only indirectly covered by the E2E test.
This does not meet the ≥ 80% coverage threshold per task definition of done.

---

## Spec FR Compliance Matrix

| FR     | Description (short)                  | Status         | Finding                      |
| ------ | ------------------------------------ | -------------- | ---------------------------- |
| FR-001 | Plugin `formSchemas` manifest ext    | ✅ PASS        |                              |
| FR-002 | `layout_configs` table               | ❌ FAIL (HIGH) | H01                          |
| FR-003 | Field visibility per role            | ✅ PASS        |                              |
| FR-004 | Section ordering                     | ⚠️ PARTIAL     | M01 (empty default)          |
| FR-005 | Column visibility per role           | ⚠️ PARTIAL     | M01 (empty default)          |
| FR-006 | `RoleKey` type definition            | ✅ PASS        |                              |
| FR-007 | Most permissive wins                 | ❌ FAIL (HIGH) | H02                          |
| FR-008 | Visibility cascade                   | ✅ PASS        |                              |
| FR-009 | Workspace override (full replace)    | ❌ FAIL (HIGH) | H03                          |
| FR-010 | Auto-inject hidden required defaults | ✅ PASS        |                              |
| FR-011 | Required field warning               | ✅ PASS        |                              |
| FR-012 | Admin config interface               | ⚠️ PARTIAL     | M09 (raw ID labels)          |
| FR-013 | Field reordering                     | ✅ PASS        |                              |
| FR-014 | Role preview panel                   | ✅ PASS        |                              |
| FR-015 | PUT save endpoint                    | ❌ FAIL (HIGH) | H04 (no manifest validation) |
| FR-016 | GET read endpoint                    | ✅ PASS        |                              |
| FR-017 | Client-side staleTime 60s            | ✅ PASS        |                              |
| FR-018 | Store previous version on save       | ✅ PASS        |                              |
| FR-019 | Revert to previous version           | ✅ PASS        |                              |
| FR-020 | Validate against manifest            | ❌ FAIL (HIGH) | H04                          |
| FR-021 | Server-side read-only enforcement    | ⚠️ PARTIAL     | M02 (broken audit log)       |
| FR-022 | Audit log on config changes          | ✅ PASS        |                              |
| FR-023 | List configurable forms              | ✅ PASS        |                              |
| FR-024 | Soft-delete on plugin uninstall      | ⚠️ PARTIAL     | M03 (admin DELETE is hard)   |
| FR-025 | `<LayoutAwareForm>` wrapper          | ✅ PASS        |                              |
| FR-026 | `<LayoutAwareTable>` wrapper         | ✅ PASS        |                              |

**Pass: 17/26 · Partial: 5/26 · Fail: 4/26**

---

## NFR Compliance Matrix

| NFR     | Category       | Status            | Note                                                       |
| ------- | -------------- | ----------------- | ---------------------------------------------------------- |
| NFR-001 | Performance    | ✅ LIKELY         | Resolution path is efficient; no N+1 found                 |
| NFR-002 | Performance    | ✅ PASS           | React Query staleTime set correctly                        |
| NFR-003 | Performance    | ✅ LIKELY         | Save path is straightforward DB write                      |
| NFR-004 | Performance    | ✅ PASS           | 200-field manifest test in T014-25                         |
| NFR-005 | Security       | ❌ FAIL (HIGH)    | H01 — table in wrong schema, cross-tenant leakage possible |
| NFR-006 | Security       | ⚠️ PARTIAL        | M02 — enforcement works, but audit trail broken            |
| NFR-007 | Security       | ⚠️ PARTIAL        | M04 — findFirst for workspace role check                   |
| NFR-008 | Availability   | ⚠️ PARTIAL        | M01 — fail-open returns incomplete defaults                |
| NFR-009 | Scalability    | ✅ PASS           | No design issues found                                     |
| NFR-010 | Accessibility  | ⚠️ PARTIAL        | M07, L01, L04 found                                        |
| NFR-011 | Caching        | ❌ PARTIAL (HIGH) | H03 — cache key collision on fallback                      |
| NFR-012 | Data Integrity | ❌ FAIL (HIGH)    | H04 — validation service never called on write path        |

---

## Blocking Conditions for Merge

The following must be resolved before this PR is approved:

1. **H01** — Fix migration to target tenant schemas. Verify all integration tests pass against tenant schemas, not `core`.
2. **H02** — Fix `resolveEffectiveRoles` to filter by `workspaceId`. Add cross-workspace privilege isolation test.
3. **H03** — Fix cache key assignment in workspace→tenant fallback path.
4. **H04** — Call `validateAgainstManifest` in both PUT route handlers before `saveConfig`.
5. **H05** — Implement `layout_engine_enabled` backend enforcement (complete T014-32).

MEDIUM findings (M01–M09) must be either fixed or have documented justification
in the decision log before approval. LOW findings (L01–L05) may be resolved
in a follow-up ticket but should be logged as technical debt.

---

## Recommended Follow-up TD Entries

If any MEDIUM findings are deferred, add to `.forge/knowledge/decision-log.md`:

- **TD-021** (M01): `buildManifestDefaults` omits sections/columns — users on fail-open path see no columns
- **TD-022** (M03): Admin-initiated DELETE is hard delete — no recovery path for accidental config deletion
- **TD-023** (M09): Admin panel shows raw field IDs when form schema not included in `ConfigurableFormSummary`
- **TD-024** (M07): `window.confirm` in `LayoutConfigPanel` — WCAG 2.1 AA violation

---

_Review completed: 2026-03-08_
_Reviewers: forge-reviewer (Claude Sonnet) + forge-reviewer-codex (GPT-Codex)_
_Next step: address HIGH findings, then re-run `/forge-review --diff` on the fixes._
