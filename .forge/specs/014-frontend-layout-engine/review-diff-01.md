# FORGE Adversarial Diff Review: Spec 014 — Frontend Layout Engine

> Dual-model review synthesized from forge-reviewer (Claude) and
> forge-reviewer-codex (GPT-Codex) findings.
>
> This is a **targeted diff review** verifying resolution of the 19 original
> findings (H01–H05, M01–M09, L01–L05) from `review.md` (2026-03-08) across
> the 11 changed files submitted in response to that review.

| Field            | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Spec             | 014 — Frontend Layout Engine                                       |
| Prior Review     | `review.md` — 2026-03-08                                           |
| Diff Review Date | 2026-03-08                                                         |
| Reviewer         | forge-reviewer (Claude) + forge-reviewer-codex (GPT-Codex)         |
| Files Changed    | 11                                                                 |
| Prior Verdict    | 🔴 REQUEST CHANGES (5 HIGH blocking)                               |
| **New Verdict**  | **🟡 CONDITIONAL PASS — 4 issues require resolution before merge** |

---

## Executive Summary

All 5 HIGH severity findings have been resolved. The migration correctly targets
tenant schemas, workspace role resolution now filters by `workspaceId`,
the cache fallback writes to the correct key, PUT routes call manifest
validation, and the feature flag is enforced on all mutation routes. The
implementation is substantially improved.

However, **4 issues introduced or uncovered by the fixes must be resolved**
before merge:

1. **NEW-M01** — `resolveEffectiveRoles` joins on `teams.workspace_id` directly,
   but ADR-024 uses a `team_workspace_assignments` join table. If this
   assumption is wrong the workspace-scoped role query silently returns no rows
   — the H02 fix may be functionally broken.
2. **NEW-M02** — Manifest validation on PUT is silently skipped when the plugin
   is not installed (`getFormSchema` returns `null`). Arbitrary `fieldId`
   values can still be saved — the H04 fix is conditional, not mandatory.
3. **NEW-M03** — `ResolvedColumn` type declares `{ columnId, visibility }` but
   `buildManifestDefaults` emits `{ columnId, order, visible: true }` — a
   structural type mismatch that will produce incorrect UI behavior in
   column-visibility render paths.
4. **L03-PARTIAL** — E2E Journey 4 tests only the post-acknowledgment happy
   path; the `REQUIRED_FIELD_NO_DEFAULT` warning flow (initial 400, `warnings`
   array, re-save with `acknowledgeWarnings: true`) remains unexercised.

7 additional observations are noted but do not block merge (see New Issues
section).

---

## Finding Resolution Status

### HIGH Findings

| ID  | Title                                             | Status        | Notes                                                                                                                                               |
| --- | ------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| H01 | Migration schema placement (multi-tenancy)        | ✅ RESOLVED   | All SQL uses `{tenant_schema}` placeholder; applied per-tenant via `TenantMigrationService`. All 4 indexes also fixed.                              |
| H02 | `resolveEffectiveRoles` ignores `workspaceId`     | ✅ RESOLVED\* | `INNER JOIN teams ON workspace_id` added. **See NEW-M01** — join table assumption needs schema verification against ADR-024.                        |
| H03 | Cache key collision on workspace→tenant fallback  | ✅ RESOLVED   | Fallback path writes explicitly under `'tenant'` key via `writeToCache(tenantId, formId, 'tenant', config)`. Comment at lines 721–723 explains fix. |
| H04 | PUT route does not call `validateAgainstManifest` | ✅ RESOLVED\* | Both tenant and workspace PUT now call `getFormSchema` + `validate`. **See NEW-M02** — validation is silently skipped when plugin not installed.    |
| H05 | Feature flag `layout_engine_enabled` not enforced | ✅ RESOLVED   | `preHandler` hook gates all mutation methods (PUT/POST/DELETE). Returns `404 FEATURE_NOT_AVAILABLE` when disabled.                                  |

### MEDIUM Findings

| ID  | Title                                                   | Status        | Notes                                                                                                                                                                                                      |
| --- | ------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01 | `buildManifestDefaults` omits sections and columns      | ✅ RESOLVED\* | Full `FormSchema` overload added; sections and columns populated from manifest. **See NEW-M03** — `ResolvedColumn` type mismatch in emitted shape.                                                         |
| M02 | `strippedFields` audit log always empty                 | ✅ RESOLVED   | `strippedFieldIds` array populated before deletion; log uses the pre-deletion snapshot.                                                                                                                    |
| M03 | `deleteConfig` performs hard DELETE                     | ✅ RESOLVED   | Changed to soft delete via `UPDATE ... SET deleted_at = NOW()`. Minor: `updated_by` not set on soft delete (partial audit trail).                                                                          |
| M04 | `checkWorkspaceAdminRole` misses multi-team membership  | ✅ RESOLVED   | Changed to `findMany` + `members.some(WS_ADMIN_ROLES.has(m.role))`. Correctly handles multiple team memberships.                                                                                           |
| M05 | ETag GET header never set                               | ✅ RESOLVED   | Both tenant and workspace GET handlers set `reply.header('ETag', config.updatedAt.toISOString())`.                                                                                                         |
| M06 | `SaveLayoutConfigInput` type collision between packages | ⚠️ PARTIAL    | `pluginId` removed from shared interface (eliminating the collision). However, types still maintained as separate structural aliases — single-source-of-truth not achieved. Silent drift remains possible. |
| M07 | `LayoutConfigPanel` uses `window.confirm`               | ✅ RESOLVED\* | Replaced with `<Dialog>` components with `role="dialog"`, `aria-modal`, `aria-labelledby`. **See NEW-OBS-01** — potential nested `role="dialog"` if `@plexica/ui`'s `Dialog` also renders that role.       |
| M08 | `ROLE_KEYS` hardcoded in `LayoutConfigPanel`            | ✅ RESOLVED   | Local constant removed; `LAYOUT_ROLE_KEYS` imported from `@plexica/types` consistently across `LayoutConfigPanel` and `FieldConfigTable`.                                                                  |
| M09 | Field labels degrade to raw IDs                         | ✅ RESOLVED   | `listConfigurableForms` now includes `schema: form`; `ConfigurableFormSummary` interface updated. Panel reads `selectedForm?.schema?.fields` with fallback.                                                |

### LOW Findings

| ID  | Title                                                         | Status      | Notes                                                                                                                                     |
| --- | ------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| L01 | `VisibilityToggle` ARIA label announces current state         | ✅ RESOLVED | `nextStateLabel` computed from `nextFieldVisibility`/`nextColumnVisibility`. Label reads both next action and current state.              |
| L02 | Integration tests use `[401, 403]` union assertion            | ✅ RESOLVED | All unauthenticated cases assert exactly `401`; authenticated-but-wrong-role cases assert exactly `403`. Applied consistently throughout. |
| L03 | E2E Journey 4 does not assert `warnings` response body        | ⚠️ PARTIAL  | Journey 4 tests post-acknowledgment path only. `REQUIRED_FIELD_NO_DEFAULT` warning flow (400 → `warnings` → re-save) still not exercised. |
| L04 | `FieldConfigTable` position label uses stale total count      | ✅ RESOLVED | ARIA label uses `sortedFields.length`. **See NEW-OBS-02** — `totalRows` is now dead code.                                                 |
| L05 | `useResolvedLayout` `ResolvedField.readonly` possibly missing | ✅ RESOLVED | `readonly: boolean` now explicitly declared on `ResolvedField`. Mock data updated to include `readonly: false`.                           |

---

## New Issues Introduced by Fixes

### Blocking (must resolve before merge)

---

#### NEW-M01 — `resolveEffectiveRoles` workspace join assumes `teams.workspace_id` direct FK

| Field     | Value                                                 |
| --------- | ----------------------------------------------------- |
| Severity  | **MEDIUM**                                            |
| Dimension | Correctness / Security                                |
| File      | `apps/core-api/src/services/layout-config.service.ts` |
| Spec Refs | ADR-024, H02 fix                                      |

**Description:**
The H02 fix adds:

```sql
INNER JOIN ${schema}."teams" t ON t.id = tm.team_id
WHERE ... AND t.workspace_id = ${workspaceId}
```

This assumes a direct `workspace_id` FK on the `teams` table. ADR-024
documents a `team_workspace_assignments` join table for team-to-workspace
relationships. If the schema uses that join table (not a direct FK), this
query returns **zero rows** for all workspace-scoped role checks — meaning
workspace admins can never save layouts in workspace scope. The security fix
silently inverts to a denial-of-service bug.

**Required action:** Verify the actual `teams` table schema. If
`team_workspace_assignments` is the correct join, rewrite as:

```sql
INNER JOIN ${schema}."team_workspace_assignments" twa
  ON twa.team_id = tm.team_id AND twa.workspace_id = ${workspaceId}
```

Add a regression test asserting workspace-scoped save succeeds for a user
whose team is linked via `team_workspace_assignments`.

---

#### NEW-M02 — PUT manifest validation silently skipped when plugin not installed

| Field     | Value                                       |
| --------- | ------------------------------------------- |
| Severity  | **MEDIUM**                                  |
| Dimension | Data Integrity / Correctness                |
| File      | `apps/core-api/src/routes/layout-config.ts` |
| Spec Refs | FR-020, NFR-012, H04 fix                    |

**Description:**
The H04 fix calls `getFormSchema()` then validates conditionally:

```typescript
const formSchema = await layoutConfigService.getFormSchema(tenantId, pluginId, formId);
if (formSchema) {
  await layoutConfigService.validate(formSchema, body);
}
// saveConfig called regardless
```

When the plugin is not installed for the tenant, `getFormSchema` returns
`null` and validation is bypassed entirely. A config with arbitrary
`fieldId` values (including non-existent fields) can be saved — the same
data integrity gap that H04 was meant to close.

**Required action:** When `formSchema` is `null`, return `404` with error
code `PLUGIN_NOT_INSTALLED` rather than proceeding to save. This also
correctly prevents saving configs for plugins that have been removed.

---

#### NEW-M03 — `ResolvedColumn` type mismatch: `buildManifestDefaults` emits wrong shape

| Field     | Value                                                                                        |
| --------- | -------------------------------------------------------------------------------------------- |
| Severity  | **MEDIUM**                                                                                   |
| Dimension | Correctness / Type Safety                                                                    |
| File      | `apps/core-api/src/services/layout-config.service.ts`, `packages/types/src/layout-config.ts` |
| Spec Refs | FR-006, M01 fix                                                                              |

**Description:**
`ResolvedColumn` in `packages/types/src/layout-config.ts` declares:

```typescript
interface ResolvedColumn {
  columnId: string;
  visibility: ColumnVisibility;
}
```

`buildManifestDefaults` emits for each column:

```typescript
{ columnId, order, visible: true }
```

This shape has `order` (not in interface) and `visible: boolean` (not in
interface), but is **missing `visibility: ColumnVisibility`** (required by
the interface). In strict TypeScript this either raises a compile error or
passes via excess property checks — in either case the value reaching
frontend components has `visibility: undefined`, causing column toggles to
render in an indeterminate state for all users on the fail-open path.

`ResolvedSection` has the same issue: interface declares `{ sectionId,
order }` but emitted shape includes `visible: true` as an extra field.

**Required action:** Align `buildManifestDefaults` to emit the interface-
correct shape:

```typescript
// Column:
{ columnId, visibility: 'visible' as ColumnVisibility }
// Section:
{ sectionId, order, visible: true }  // add visible to ResolvedSection if needed, or remove
```

Run `tsc --noEmit` across the monorepo to surface all shape mismatches.

---

#### NEW-L01 (formerly L03-PARTIAL) — E2E Journey 4: warning flow not tested

| Field     | Value                                                                     |
| --------- | ------------------------------------------------------------------------- |
| Severity  | **LOW**                                                                   |
| Dimension | Test-Spec Coherence                                                       |
| File      | `apps/core-api/src/__tests__/layout-config/e2e/layout-config.e2e.test.ts` |
| Spec Refs | FR-021, spec §8.2 (REQUIRED_FIELD_NO_DEFAULT)                             |

**Description:**
Journey 4 was partially resolved: the post-acknowledgment path is now
tested. However the three-step warning flow specified in FR-021 is still
not covered:

1. Save a config that hides a required field with no default → expect `400`
   with `REQUIRED_FIELD_NO_DEFAULT` and `warnings: [{ fieldId, reason }]`
2. Re-save with `acknowledgeWarnings: true` → expect `200`
3. Resolve the layout for that user → verify hidden required field appears
   with `visibility: 'hidden'` in resolved output

Without step 1, the `REQUIRED_FIELD_NO_DEFAULT` code path (in
`layout-readonly-guard.ts`) is completely untested in E2E.

**Required action:** Add the full three-step sequence to Journey 4. This
can be implemented in under 30 lines and closes the spec compliance gap.

---

### Non-Blocking Observations

These do not block merge but should be logged as technical debt or fixed opportunistically.

| ID         | Severity | File                                  | Description                                                                                                                                                                                                                                                                                      |
| ---------- | -------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NEW-OBS-01 | LOW      | `LayoutConfigPanel.tsx`               | Inner `div` declares `role="dialog"` inside a `<Dialog>` wrapper from `@plexica/ui`. If `@plexica/ui`'s `Dialog` renders its own `[role="dialog"]`, screen readers see nested dialog roles. Verify `@plexica/ui`'s Dialog component does not add this role, or remove the inner `role="dialog"`. |
| NEW-OBS-02 | INFO     | `FieldConfigTable.tsx`                | `totalRows` variable (line 115) is computed but no longer used after L04 fix. Dead code — triggers `no-unused-vars` lint warning in CI.                                                                                                                                                          |
| NEW-OBS-03 | LOW      | `layout-config.ts` (routes)           | H04 error code mismatch: spec §8.2 specifies `400 INVALID_FIELD_REFERENCE`; implementation returns `422 MANIFEST_VALIDATION_FAILED`. Error codes must be stable per Constitution Art. 6.2.                                                                                                       |
| NEW-OBS-04 | LOW      | `layout-config.service.ts`            | M03 soft-delete sets `deleted_at` only; `updated_by` and `updated_at` are not updated. Audit trail shows who last edited the config, not who deleted it. Constitution Art. 6.3 logging standard.                                                                                                 |
| NEW-OBS-05 | LOW      | `layout-config.ts` (routes)           | Feature flag `preHandler` fails open when `tenantId` cannot be resolved from JWT (lines 158–159). Intentional per Art. 9.1 fail-open semantics, but a misconfigured token bypasses the flag gate on mutation routes. Consider logging a `warn` when this fallback fires.                         |
| NEW-OBS-06 | INFO     | `packages/types/src/layout-config.ts` | M06 partial fix: `pluginId` removed from `SaveLayoutConfigInput` but types remain as structural aliases in two packages. Consider re-exporting Zod-inferred type as the single source of truth to prevent future silent drift.                                                                   |
| NEW-OBS-07 | LOW      | `layout-config.service.ts`            | `ResolvedSection` emits `visible: true` as an extra field not declared in the interface. Same structural mismatch pattern as NEW-M03. Lower risk (sections are less frequently toggled) but should be aligned.                                                                                   |

---

## NFR Compliance (Updated)

| NFR     | Category       | Status     | Notes                                                                       |
| ------- | -------------- | ---------- | --------------------------------------------------------------------------- |
| NFR-001 | Performance    | ✅ PASS    | No regressions found                                                        |
| NFR-002 | Scalability    | ✅ PASS    | No regressions found                                                        |
| NFR-003 | Reliability    | ✅ PASS    | Fail-open semantics consistent                                              |
| NFR-004 | Security       | ✅ PASS    | H02 fixed; workspace role isolation restored                                |
| NFR-005 | Security       | ✅ PASS    | H01 fixed; tenant schema placement correct                                  |
| NFR-006 | Security       | ✅ PASS    | M02 fixed; audit trail now captures stripped field IDs before deletion      |
| NFR-007 | Security       | ✅ PASS    | M04 fixed; multi-team membership handled                                    |
| NFR-008 | Availability   | ✅ PASS    | M01 fixed; fail-open path returns complete section/column defaults          |
| NFR-009 | Scalability    | ✅ PASS    | No issues                                                                   |
| NFR-010 | Accessibility  | ✅ PASS    | M07, L01, L04 all resolved; NEW-OBS-01 needs verification                   |
| NFR-011 | Caching        | ✅ PASS    | H03 fixed; cache key collision eliminated                                   |
| NFR-012 | Data Integrity | ⚠️ PARTIAL | H04 partially fixed; NEW-M02 — validation skipped when plugin not installed |

---

## Blocking Conditions for Merge

The following must be resolved before this PR is approved:

1. **NEW-M01** — Verify `teams.workspace_id` FK exists in actual schema (vs. `team_workspace_assignments` join table). Fix query if needed; add regression test for workspace-scoped save.
2. **NEW-M02** — Return `404 PLUGIN_NOT_INSTALLED` when `getFormSchema` returns `null` in PUT handlers; do not proceed to `saveConfig`.
3. **NEW-M03** — Fix `buildManifestDefaults` column shape to emit `visibility: ColumnVisibility` (not `visible: boolean + order`). Run `tsc --noEmit` to verify no shape mismatches remain.
4. **NEW-L01** — Add full three-step warning flow to E2E Journey 4 (initial 400 with `REQUIRED_FIELD_NO_DEFAULT`, re-save with `acknowledgeWarnings: true`, resolved layout verification).

---

## Recommended TD Entries

If any non-blocking observations are deferred, add to `.forge/knowledge/decision-log.md`:

- **TD-025** (NEW-OBS-01): Verify `@plexica/ui` Dialog does not add nested `role="dialog"` in `LayoutConfigPanel` — WCAG focus management risk.
- **TD-026** (NEW-OBS-03): Error code mismatch — spec specifies `INVALID_FIELD_REFERENCE` (400); implementation returns `MANIFEST_VALIDATION_FAILED` (422). Stabilize error code per Constitution Art. 6.2.
- **TD-027** (NEW-OBS-04): Soft delete (`deleteConfig`) does not update `updated_by` — partial audit trail. Constitution Art. 6.3 compliance gap.
- **TD-028** (NEW-OBS-06): `SaveLayoutConfigInput` remains a structural alias in `@plexica/types` rather than a Zod-inferred re-export — silent drift risk remains.

---

_Diff review completed: 2026-03-08_
_Reviewers: forge-reviewer (Claude Sonnet) + forge-reviewer-codex (GPT-Codex)_
_Prior review: `review.md` (2026-03-08) — 5 HIGH, 9 MEDIUM, 5 LOW_
_This review: 0 HIGH, 3 MEDIUM, 1 LOW blocking; 7 non-blocking observations_
