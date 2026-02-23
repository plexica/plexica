# Tasks: 003 - Authorization System (RBAC + ABAC)

> Ordered task breakdown with parallelism markers and requirement traceability.
> Created by the `forge-scrum` agent via `/forge-tasks`.

| Field  | Value                |
| ------ | -------------------- |
| Status | Pending              |
| Author | forge-scrum          |
| Date   | 2026-02-23           |
| Spec   | [spec.md](./spec.md) |
| Plan   | [plan.md](./plan.md) |

---

## Legend

- `[FR-NNN]` / `[NFR-NNN]` — Requirement being implemented (traceability)
- `[P]` — Parallelizable with other `[P]` tasks in the same phase
- Status: `[ ]` pending, `[x]` done, `[-]` skipped
- **Path**: File path relative to project root

---

## Phase 1: Data Model & Migration

> **Objective**: Define the authorization domain types, constants, and update
> the tenant provisioning DDL to create the normalized authorization tables.
> All migration work must be backward-compatible (zero-downtime, Art. 9.1).

- [ ] **1.1** `[FR-001]` `[FR-003]` `[P]` Define authorization TypeScript interfaces
  - **File**: `apps/core-api/src/modules/authorization/types/authorization.types.ts`
  - **Type**: Create new file
  - **Description**: Define all domain interfaces: `Role`, `Permission`, `Policy`,
    `UserRole`, `AuthorizationResult`, `ConditionTree`, `ConditionNode`,
    `LeafCondition`, `RoleFilters`, `PolicyFilters`, `RolePage`, `PolicyPage`.
    Use strict TypeScript; no `any`. Mark `effect` as `'DENY' | 'FILTER'` literal union.
  - **Spec Reference**: §7 Data Requirements, §4 FR-001, FR-007, FR-008, FR-017
  - **Dependencies**: None
  - **Estimated**: M (1–2h)

- [ ] **1.2** `[FR-001]` `[FR-003]` `[P]` Define authorization barrel export for types
  - **File**: `apps/core-api/src/modules/authorization/types/index.ts`
  - **Type**: Create new file
  - **Description**: Re-export all types from `authorization.types.ts`.
  - **Spec Reference**: §4 FR-001
  - **Dependencies**: Task 1.1
  - **Estimated**: S (< 15 min)

- [ ] **1.3** `[FR-001]` `[FR-002]` `[FR-003]` `[P]` Define core permission constants
  - **File**: `apps/core-api/src/modules/authorization/constants.ts`
  - **Type**: Create new file
  - **Description**: Define colon-separated core permission keys (`users:read`,
    `users:write`, `roles:read`, `roles:write`, `policies:read`, `policies:write`,
    `workspaces:read`, `workspaces:write`, `settings:read`, `settings:write`,
    `plugins:read`, `plugins:write`). Define system role names (`super_admin`,
    `tenant_admin`, `team_admin`, `user`). Define Redis cache key templates
    (`authz:perms:{tenantId}:{userId}`, `authz:role_users:{tenantId}:{roleId}`,
    `authz:ratelimit:{tenantId}`). Define limit constants (MAX_CUSTOM_ROLES = 50,
    CACHE_BASE_TTL = 300, CACHE_JITTER = 30, CACHE_SAFETY_TTL = 900,
    RATE_LIMIT_WINDOW = 60, RATE_LIMIT_MAX = 60).
  - **Spec Reference**: §4 FR-001–FR-003, FR-005; §5 NFR-007, NFR-009, NFR-010
  - **Dependencies**: None
  - **Estimated**: M (1h)

- [ ] **1.4** `[FR-001]` `[FR-003]` `[FR-004]` `[FR-005]` Update tenant provisioning DDL
  - **File**: `apps/core-api/src/services/tenant.service.ts`
  - **Type**: Modify existing
  - **Location**: `createTenantSchema()` / tenant provisioning DDL section
  - **Description**: Replace legacy `CREATE TABLE roles (... permissions JSONB ...)`
    DDL with new normalized schema. Create these tables in order:
    1. `roles` (id, tenant_id, name, description, is_system, created_at, updated_at)
       with UNIQUE(tenant_id, name) and idx_roles_tenant_id index.
    2. `permissions` (id, tenant_id, key, name, description, plugin_id, created_at)
       with UNIQUE(tenant_id, key), idx_permissions_tenant_id, idx_permissions_plugin_id.
    3. `role_permissions` join table with composite PK (role_id, permission_id),
       tenant_id, FK cascades, idx_role_permissions_permission_id, idx_role_permissions_tenant_id.
    4. `user_roles` (user_id, role_id, tenant_id, assigned_at) with composite PK,
       FK cascade on role_id, idx_user_roles_user_id, idx_user_roles_tenant_id.
       Seed system roles (`super_admin`, `tenant_admin`, `team_admin`, `user`) with
       `is_system = true`. Seed core permissions and `role_permissions` entries mapping
       system roles to their permission sets. Call
       `PermissionRegistrationService.registerCorePermissions()` after table creation.
       Preserve backward-compatibility: existing tenant schemas require a data migration
       (see Task 1.5).
  - **Spec Reference**: §7 Data Requirements, §2.1–§2.3 plan, FR-003–FR-005
  - **Dependencies**: Tasks 1.1, 1.3
  - **Estimated**: L (3–4h)

- [ ] **1.5** `[FR-001]` `[FR-018]` Write data migration script (legacy → normalized)
  - **File**: `apps/core-api/src/modules/authorization/migrations/migrate-legacy-permissions.ts`
  - **Type**: Create new file
  - **Description**: For existing tenants: (1) read each role's JSONB `permissions`
    array; (2) convert dot-separated format to colon-separated (`users.read` →
    `users:read`) per Appendix A mapping table; (3) store original JSONB as
    `_permissions_backup` column before dropping; (4) upsert `permissions` rows;
    (5) insert `role_permissions` join entries; (6) verify row counts match before
    committing; (7) drop `permissions` JSONB column. The migration must be
    idempotent (safe to re-run). See plan §2.4 Migrations 001–003.
  - **Spec Reference**: §7 Data Requirements, plan §2.4, Appendix A
  - **Dependencies**: Task 1.4
  - **Estimated**: L (3–4h)

- [ ] **1.6** `[FR-001]` Write migration rollback script
  - **File**: `apps/core-api/src/modules/authorization/migrations/rollback-legacy-permissions.ts`
  - **Type**: Create new file
  - **Description**: Restore JSONB `permissions` column on `roles` from
    `_permissions_backup` column for tenants within 24h of forward migration.
    Log rollback stats. Remove normalized tables created in migration. Idempotent.
  - **Spec Reference**: plan §2.4 (Rollback strategy)
  - **Dependencies**: Task 1.5
  - **Estimated**: M (1–2h)

- [ ] **1.7** `[FR-001]` `[FR-018]` Write migration integration tests
  - **File**: `apps/core-api/src/__tests__/authorization/integration/migration.integration.test.ts`
  - **Type**: Create new file
  - **Description**: Test that the forward migration correctly converts dot-separated
    permissions to colon-separated format; verifies row counts; idempotency check
    (run twice, same result); verifies rollback restores original JSONB data.
    4 integration tests per plan §8.2.
  - **Spec Reference**: plan §8.2 (Data migration row)
  - **Dependencies**: Tasks 1.5, 1.6
  - **Estimated**: M (1–2h)

---

## Phase 2: Backend RBAC Engine

> **Objective**: Implement the full RBAC authorization engine — Redis caching,
> all 9 RBAC API endpoints, refactored middleware, and plugin integration.
> Depends on Phase 1 completion.

### Phase 2a: Services (parallelizable after Phase 1)

- [ ] **2.1** `[FR-019]` `[NFR-002]` `[NFR-007]` `[NFR-008]` `[P]` Implement PermissionCacheService
  - **File**: `apps/core-api/src/modules/authorization/permission-cache.service.ts`
  - **Type**: Create new file
  - **Description**: Redis-backed permission cache. Implement all methods per
    plan §4.3: `getUserPermissions()`, `setUserPermissions()` (jittered TTL:
    `base 300s ± random(-30,+30)`, safety fallback 900s), `invalidateForRole()`
    (lookup `authz:role_users:{tenantId}:{roleId}` SET, DEL each user's perms key),
    `invalidateForUser()`, `invalidateForTenant()` (SCAN pattern),
    `debouncedInvalidateForRole()` (500ms window, NFR-010). Graceful fallback to
    returning `null` on Redis errors; log warning but never throw. Use key schema
    from Appendix B: `authz:perms:{tenantId}:{userId}`, `authz:role_users:{tenantId}:{roleId}`.
  - **Spec Reference**: FR-019, NFR-002, NFR-007, NFR-008, Edge Case #7, #8
  - **Dependencies**: Tasks 1.1, 1.3
  - **Estimated**: L (3–4h)

- [ ] **2.2** `[FR-003]` `[FR-004]` `[FR-005]` `[FR-006]` `[FR-018]` `[FR-019]` `[P]` Implement RoleService
  - **File**: `apps/core-api/src/modules/authorization/role.service.ts`
  - **Type**: Create new file
  - **Description**: Implement all methods per plan §4.2. Key behaviors:
    `createRole()` — check custom role count < 50 (422 CUSTOM_ROLE_LIMIT_EXCEEDED
    if exceeded, NFR-009), validate name uniqueness within tenant (409), insert
    role + role_permissions, call `debouncedInvalidateForRole()`.
    `updateRole()` / `deleteRole()` — guard `is_system = true` (403 SYSTEM_ROLE_IMMUTABLE,
    FR-004). `assignRoleToUser()` — upsert user_roles, SADD to role→users index,
    flush user perms cache. `removeRoleFromUser()` — delete from user_roles,
    SREM from index, flush user perms cache. `getUserPermissions()` — JOIN
    user_roles + role_permissions + permissions, return `key[]` (union of all
    role permissions, FR-006). All queries scoped by `tenantId`.
  - **Spec Reference**: FR-003–FR-006, FR-018, FR-019, NFR-009, Edge Cases #1, #2, #8, #9, #10
  - **Dependencies**: Tasks 1.1, 1.3, 2.1
  - **Estimated**: L (4–6h)

- [ ] **2.3** `[FR-011]` `[FR-012]` `[FR-013]` `[P]` Implement PermissionRegistrationService
  - **File**: `apps/core-api/src/modules/authorization/permission-registration.service.ts`
  - **Type**: Create new file
  - **Description**: Implement per plan §4.4:
    `registerPluginPermissions(tenantId, pluginId, perms[])` — check for key
    conflicts (409, Edge Case #4), upsert `permissions` rows with plugin_id,
    call `invalidateForTenant()`.
    `removePluginPermissions(tenantId, pluginId)` — delete from `role_permissions`
    where permission has this plugin_id (FR-013), delete from `permissions`,
    call `invalidateForTenant()`.
    `registerCorePermissions(tenantId)` — idempotent upsert of all core permissions
    and system role-permission mappings.
  - **Spec Reference**: FR-011, FR-012, FR-013, Edge Case #4
  - **Dependencies**: Tasks 1.1, 1.3, 2.1
  - **Estimated**: M (2–3h)

- [ ] **2.4** `[FR-001]` `[FR-002]` `[FR-006]` `[FR-010]` `[FR-016]` `[NFR-003]` `[NFR-005]` `[P]` Implement AuthorizationService
  - **File**: `apps/core-api/src/modules/authorization/authorization.service.ts`
  - **Type**: Create new file
  - **Description**: Central authorization decision engine per plan §4.1.
    `authorize(userId, tenantId, requiredPermissions[])`:
    (1) try `PermissionCacheService.getUserPermissions()` → cache hit path;
    (2) on cache miss: call `RoleService.getUserPermissions()`, set cache;
    (3) call `matchesPermission()` for each required perm (wildcard-aware);
    (4) log decision at `info` level with `{userId, tenantId, required, decision}` (NFR-003);
    (5) return `AuthorizationResult`. On any error: log error, return DENY (NFR-005).
    `matchesPermission(userPerm, required)`: handle `*:*` (matches everything),
    `resource:*` (matches all actions on resource), `resource:sub:*` etc. Use
    segment-by-segment wildcard matching.
    `isSuperAdmin(roles[])`: check for `super_admin` role — used by caller to
    skip ABAC evaluation (FR-016).
    `getUserEffectivePermissions(userId, tenantId)`: return expanded permission
    list (wildcards listed as-is; actual expansion shown separately).
  - **Spec Reference**: FR-001, FR-002, FR-006, FR-010, FR-016, NFR-003, NFR-005, Edge Cases #1, #6, #7
  - **Dependencies**: Tasks 1.1, 1.3, 2.1, 2.2
  - **Estimated**: L (3–4h)

### Phase 2b: DTOs & Guards (parallelizable)

- [ ] **2.5** `[FR-001]` `[FR-005]` `[P]` Create role Zod DTOs
  - **Files**:
    - `apps/core-api/src/modules/authorization/dto/create-role.dto.ts` — `{ name: z.string().min(1).max(100), description: z.string().max(500).optional(), permissionIds: z.array(z.string().uuid()).max(200) }`
    - `apps/core-api/src/modules/authorization/dto/update-role.dto.ts` — all fields optional via `.partial()`
    - `apps/core-api/src/modules/authorization/dto/assign-role.dto.ts` — `{ roleId: z.string().uuid() }`
    - `apps/core-api/src/modules/authorization/dto/index.ts` — barrel export
  - **Type**: Create new files
  - **Description**: Zod validation schemas for role creation, update, and assignment.
    Validate per spec §8 request shapes. Export TypeScript types via `z.infer<>`.
  - **Spec Reference**: FR-001, FR-005, plan §3.2–§3.7
  - **Dependencies**: None
  - **Estimated**: S (45 min)

- [ ] **2.6** `[NFR-010]` `[P]` Implement auth management rate limiter guard
  - **File**: `apps/core-api/src/modules/authorization/guards/rate-limiter.guard.ts`
  - **Type**: Create new file
  - **Description**: Fastify preHandler plugin implementing 60 mutations/tenant/min
    sliding window using Redis INCR + EXPIRE pattern (reuse pattern from
    `apps/core-api/src/middleware/rate-limiter.ts`). Key:
    `authz:ratelimit:{tenantId}`. On limit exceeded: return 429 with
    `{ error: { code: 'RATE_LIMIT_EXCEEDED', message: '...' } }` and
    `Retry-After` header (seconds until window resets). Per-tenant isolation.
    Also create `apps/core-api/src/modules/authorization/guards/index.ts` barrel.
  - **Spec Reference**: NFR-010, Edge Case #13
  - **Dependencies**: Task 1.3
  - **Estimated**: M (1–2h)

### Phase 2c: API Routes

- [ ] **2.7** `[FR-003]` `[FR-004]` `[FR-005]` `[FR-006]` `[FR-016]` `[FR-024]` `[NFR-004]` `[NFR-010]` Implement authorization route plugin
  - **File**: `apps/core-api/src/routes/authorization.ts`
  - **Type**: Create new file
  - **Description**: Fastify route plugin registering 9 endpoints per plan §3.1–§3.9:
    - `GET  /api/v1/roles` — Bearer + `roles:read`; paginated list with `meta.customRoleCount`
    - `POST /api/v1/roles` — Bearer + `roles:write`; rate-limited; 422 on limit exceeded
    - `PUT  /api/v1/roles/:id` — Bearer + `roles:write`; rate-limited; 403 on system role
    - `DELETE /api/v1/roles/:id` — Bearer + `roles:write`; rate-limited; 204
    - `GET  /api/v1/permissions` — Bearer + `roles:read`; returns `data[]` + `groups{}`
    - `POST /api/v1/users/:id/roles` — Bearer + `users:write`; rate-limited
    - `DELETE /api/v1/users/:id/roles/:roleId` — Bearer + `users:write`; rate-limited
    - `GET  /api/v1/me/roles` — Bearer only (no permission check, FR-024)
    - `GET  /api/v1/me/permissions` — Bearer only; returns `data[]` + `wildcards[]`
      All write endpoints apply rate limiter guard. Error responses use standard
      `{ error: { code, message, details? } }` format (Art. 6.2). 403 responses
      MUST NOT include permission names (NFR-004).
  - **Spec Reference**: FR-003–FR-006, FR-016, FR-018–FR-019, FR-024, NFR-004, NFR-010, plan §3.1–§3.9
  - **Dependencies**: Tasks 2.2, 2.4, 2.5, 2.6
  - **Estimated**: L (5–6h)

### Phase 2d: Middleware Refactor & Integration

- [ ] **2.8** `[FR-016]` `[NFR-003]` `[NFR-004]` `[NFR-005]` Refactor `requirePermission()` middleware
  - **File**: `apps/core-api/src/middleware/auth.ts`
  - **Type**: Modify existing
  - **Location**: Lines 245–296 (`requirePermission` and `getUserPermissions`)
  - **Description**: Replace direct DB query in `requirePermission()` with call
    to `AuthorizationService.authorize()`. **Fix NFR-004 violation**: change 403
    response body from `"Required permission(s): ${permissions.join(', ')}"` to
    generic `"You do not have permission to perform this action"`. Add `info`-level
    audit log on every authorization decision (NFR-003). Return DENY on any
    unexpected error — never throw past this boundary (NFR-005). Wildcard matching
    is now handled by `AuthorizationService`.
  - **Spec Reference**: FR-016, NFR-003, NFR-004, NFR-005
  - **Dependencies**: Task 2.4
  - **Estimated**: M (2–3h)

- [ ] **2.9** `[NFR-004]` Refactor `requireRole()` middleware
  - **File**: `apps/core-api/src/middleware/auth.ts`
  - **Type**: Modify existing
  - **Location**: Lines 204–231 (`requireRole`)
  - **Description**: Remove role names from 403 response body. Replace with
    generic `"You do not have the required role to perform this action"`.
    No other functional changes.
  - **Spec Reference**: NFR-004
  - **Dependencies**: None (can be done independently)
  - **Estimated**: S (30 min)

- [ ] **2.10** `[FR-011]` `[FR-013]` Integrate PermissionRegistrationService into plugin lifecycle
  - **File**: `apps/core-api/src/modules/plugin/` (plugin install/uninstall handlers)
  - **Type**: Modify existing
  - **Location**: Plugin install and uninstall hook functions
  - **Description**: On plugin install: call
    `PermissionRegistrationService.registerPluginPermissions(tenantId, pluginId, manifest.permissions)`.
    On plugin uninstall: call `removePluginPermissions(tenantId, pluginId)`.
    Handle Edge Case #4: if `registerPluginPermissions` throws conflict, abort
    plugin install and return error to caller.
  - **Spec Reference**: FR-011, FR-012, FR-013, Edge Case #4
  - **Dependencies**: Task 2.3
  - **Estimated**: M (1–2h)

- [ ] **2.11** `[FR-003]` Deprecate legacy permission service
  - **File**: `apps/core-api/src/services/permission.service.ts`
  - **Type**: Modify existing
  - **Location**: Entire file
  - **Description**: Add `@deprecated` JSDoc comment at class level. Replace
    `getUserPermissions()` implementation with delegation to
    `AuthorizationService.getUserEffectivePermissions()`. Keep all existing
    exports intact for backward compatibility during migration. Do NOT delete file.
  - **Spec Reference**: plan §5 Files to Modify
  - **Dependencies**: Task 2.4
  - **Estimated**: M (45 min–1h)

- [ ] **2.12** `[FR-003]` Register authorization routes in application bootstrap
  - **File**: `apps/core-api/src/routes/` (index or app.ts / main route registration)
  - **Type**: Modify existing
  - **Location**: Route registration section
  - **Description**: Import and register the `authorization` route plugin.
    Ensure it is registered before any middleware that depends on the new
    `requirePermission()` behavior.
  - **Spec Reference**: plan §5 Files to Modify
  - **Dependencies**: Task 2.7
  - **Estimated**: S (20–30 min)

---

## Phase 3: Frontend Authorization UI

> **Objective**: Build 6 screens and 12 components for role management and
> ABAC policy editing. Depends on Phase 2 API endpoints being available.

### Phase 3a: API Hooks (foundation for all UI)

- [ ] **3.1** `[FR-003]` `[FR-005]` `[FR-024]` Create authorization API client and React Query hooks
  - **Files**:
    - `apps/web/src/hooks/useAuthorizationApi.ts` — raw fetch wrappers for all authorization endpoints (list roles, create/update/delete role, list permissions, assign/remove user role, get me/roles, get me/permissions)
    - `apps/web/src/hooks/useRoles.ts` — React Query hooks: `useRoles(filters)`, `useRole(id)`, `useCreateRole()`, `useUpdateRole()`, `useDeleteRole()`; invalidate on mutation
    - `apps/web/src/hooks/usePermissions.ts` — `usePermissions(filters)` returning data + groups
    - `apps/web/src/hooks/usePolicies.ts` — `usePolicies(filters)`, `useCreatePolicy()`, `useUpdatePolicy()`, `useDeletePolicy()`
  - **Type**: Create new files
  - **Description**: Use `apps/web/src/lib/api-client.ts` for HTTP calls. Hooks use
    React Query v5 pattern (`useQuery`, `useMutation`). Handle 429 Retry-After
    headers. Include error boundary-compatible error shapes.
  - **Spec Reference**: FR-003, FR-005, FR-024, plan §3
  - **Dependencies**: Phase 2 complete
  - **Estimated**: M (2–3h)

### Phase 3b: Primitive Components (parallelizable)

- [ ] **3.2** `[FR-023]` `[FR-017]` `[P]` Create SystemRoleBadge and EffectBadge components
  - **Files**:
    - `apps/web/src/components/authorization/SystemRoleBadge.tsx` — Lock icon (lucide-react) + "System" text badge; all edit controls disabled when present
    - `apps/web/src/components/authorization/EffectBadge.tsx` — DENY (red variant) / FILTER (blue variant) using `@plexica/ui` Badge component
  - **Type**: Create new files
  - **Description**: Pure presentational components. `SystemRoleBadge` renders
    a lock icon and "System" label; parent controls can use `isSystem` prop to
    conditionally render it (FR-023). `EffectBadge` accepts `effect: 'DENY' | 'FILTER'`.
    Both must meet WCAG 2.1 AA color contrast.
  - **Spec Reference**: FR-017, FR-023, §9 UX/UI Requirements
  - **Dependencies**: Task 3.1
  - **Estimated**: S (45 min)

- [ ] **3.3** `[FR-020]` `[FR-021]` `[P]` Create PermissionGroupAccordion and WildcardPermissionRow
  - **Files**:
    - `apps/web/src/components/authorization/PermissionGroupAccordion.tsx` — collapsible accordion section per permission source ("Core", plugin name). Renders a list of `WildcardPermissionRow` items.
    - `apps/web/src/components/authorization/WildcardPermissionRow.tsx` — checkbox row for a permission key; if the permission ends in `*`, checking it auto-selects all sub-permissions; unchecking a sub-permission unchecks the wildcard row.
  - **Type**: Create new files
  - **Description**: `PermissionGroupAccordion` accepts `{ source: string, permissions: Permission[], selected: string[], onChange: (selected: string[]) => void }`.
    `WildcardPermissionRow` handles FR-021 auto-select/deselect logic. Both
    components are controlled (no internal state). Accessible keyboard navigation,
    ARIA attributes, WCAG 2.1 AA.
  - **Spec Reference**: FR-020, FR-021, §9 UX/UI Requirements
  - **Dependencies**: Tasks 3.1, 3.2
  - **Estimated**: L (3–4h)

- [ ] **3.4** `[FR-022]` `[FR-008]` `[P]` Create ABAC condition builder components
  - **Files**:
    - `apps/web/src/components/authorization/ConditionBuilder.tsx` — recursive root component for building nested AND/OR/NOT condition trees
    - `apps/web/src/components/authorization/ConditionRow.tsx` — single leaf condition (attribute selector, operator dropdown, value input)
    - `apps/web/src/components/authorization/ConditionGroup.tsx` — AND/OR combinator wrapper with add-condition and add-group buttons
    - `apps/web/src/components/authorization/NotGroup.tsx` — NOT wrapper with dashed border styling
    - `apps/web/src/components/authorization/ConditionLimitIndicator.tsx` — live usage counter showing conditions used/20 and depth used/5; red when at limit
  - **Type**: Create new files
  - **Description**: `ConditionBuilder` is the entry point; accepts `value: ConditionTree`
    and `onChange`. Renders recursive `ConditionGroup` / `NotGroup` / `ConditionRow`
    tree. `ConditionRow` attribute selector shows namespaces (`user.*`, `resource.*`,
    `environment.*`, `tenant.*`) and typed operators per attribute type. Disable
    "add" buttons when depth ≥ 5 or conditions ≥ 20 (FR-008).
    Feature-flag gated: only render when `abac_enabled`.
  - **Spec Reference**: FR-008, FR-022, §7 ABAC Condition Schema
  - **Dependencies**: Task 3.1
  - **Estimated**: L (4–6h)

- [ ] **3.5** `[FR-007]` `[P]` Create PolicySummary and RoleAssignmentDialog components
  - **Files**:
    - `apps/web/src/components/authorization/PolicySummary.tsx` — auto-generates plain-English summary of a policy's condition tree (e.g., "Allow when user.teamId equals resource.teamId AND resource.status is not archived")
    - `apps/web/src/components/authorization/RoleAssignmentDialog.tsx` — modal dialog for adding/removing roles from a user; shows current roles, diff preview of changes, confirm/cancel
  - **Type**: Create new files
  - **Description**: `PolicySummary` walks the condition tree recursively and
    generates a human-readable string. `RoleAssignmentDialog` uses `@plexica/ui`
    Dialog component; accepts `userId`, `currentRoles`, `availableRoles`;
    calls `useUpdateUserRoles` mutation on confirm.
  - **Spec Reference**: FR-006, FR-007, FR-018, FR-022
  - **Dependencies**: Tasks 3.1, 3.2
  - **Estimated**: M (2–3h)

### Phase 3c: Screens

- [ ] **3.6** `[FR-003]` `[FR-004]` `[FR-005]` `[FR-023]` Implement Role List screen
  - **File**: `apps/web/src/routes/access-control.roles.tsx`
  - **Type**: Create new file
  - **Description**: TanStack Router route. DataTable with columns: Name,
    Type (System/Custom badge via `SystemRoleBadge`), Permissions count, Users
    count, Actions (Edit/Delete — disabled for system roles, FR-023). Search input,
    type filter (System/Custom), source filter (Core/plugin). Custom role counter:
    "N/50 custom roles" in table header meta. Delete triggers confirmation dialog.
    Empty state with "Create your first role" CTA.
  - **Spec Reference**: FR-003, FR-004, FR-005, FR-023, plan §3.1
  - **Dependencies**: Tasks 3.1, 3.2, 3.3
  - **Estimated**: L (3–4h)

- [ ] **3.7** `[FR-003]` `[FR-004]` `[FR-020]` Implement Role Detail and Role Editor screens
  - **Files**:
    - `apps/web/src/routes/access-control.roles.$roleId.tsx` — Role Detail; two tabs: "Permissions" (read-only accordion grouped by source) and "Users" (list of assigned users with remove button for custom roles)
    - `apps/web/src/routes/access-control.roles.create.tsx` — Role Editor (create mode); form with name, description, `PermissionGroupAccordion` for selection, summary section; submit → POST /api/v1/roles
    - `apps/web/src/routes/access-control.roles.$roleId.edit.tsx` — Role Editor (edit mode, pre-filled from detail query); submit → PUT /api/v1/roles/:id; system roles: all inputs read-only, `SystemRoleBadge` displayed
  - **Type**: Create new files
  - **Description**: Reuse `PermissionGroupAccordion` and `WildcardPermissionRow`
    from Task 3.3. Edit mode redirects to list on success. Handle 409
    ROLE_NAME_CONFLICT and 422 CUSTOM_ROLE_LIMIT_EXCEEDED with toast errors.
    Handle 403 SYSTEM_ROLE_IMMUTABLE gracefully. Unsaved changes prompt on navigate-away.
  - **Spec Reference**: FR-003, FR-004, FR-005, FR-020, FR-021, FR-023, plan §3.3
  - **Dependencies**: Tasks 3.1, 3.2, 3.3
  - **Estimated**: L (3–4h)

- [ ] **3.8** `[FR-006]` `[FR-018]` Implement User Role Assignment screen
  - **File**: `apps/web/src/routes/access-control.users.tsx`
  - **Type**: Create new file
  - **Description**: DataTable listing users in the tenant with their assigned roles
    (chips). "Manage Roles" button opens `RoleAssignmentDialog`. Filter by role.
    Changes trigger role-scoped cache flush on backend (handled by API).
  - **Spec Reference**: FR-006, FR-018, FR-019
  - **Dependencies**: Tasks 3.1, 3.5
  - **Estimated**: L (3–4h)

- [ ] **3.9** `[FR-007]` `[FR-009]` `[FR-017]` Implement ABAC Policy List and Policy Editor screens
  - **Files**:
    - `apps/web/src/routes/access-control.policies.tsx` — Policy List; feature-flag gated: when `abac_enabled` is false, show info banner "Attribute-based access policies are coming soon." and hide "Create Policy" CTA. When enabled: DataTable with Name, Resource, Effect (`EffectBadge`), Source, Priority, Active toggle, Actions.
    - `apps/web/src/routes/access-control.policies.create.tsx` — Policy Editor (create); form with name, resource pattern, effect selector, priority, `ConditionBuilder`, `ConditionLimitIndicator`, `PolicySummary` preview; submit → POST /api/v1/policies
    - `apps/web/src/routes/access-control.policies.$policyId.edit.tsx` — Policy Editor (edit); pre-filled; source `core`/`plugin` → all fields read-only; source `tenant_admin` → editable; submit → PUT /api/v1/policies/:id
  - **Type**: Create new files
  - **Description**: Per Appendix C feature flag behavior: GET returns empty when
    flag off; POST/PUT/DELETE return 404. Handle 422 CONDITION_TREE_LIMIT_EXCEEDED
    with field-level errors. `PolicySummary` updates live as conditions change.
  - **Spec Reference**: FR-007–FR-009, FR-014–FR-015, FR-017, FR-022, Appendix C
  - **Dependencies**: Tasks 3.1, 3.2, 3.4, 3.5
  - **Estimated**: L (4–5h)

### Phase 3d: Navigation

- [ ] **3.10** `[FR-020]` Add "Access Control" navigation section to sidebar
  - **Files**:
    - `apps/web/src/routes/__root.tsx` (or root layout file)
    - `apps/web/src/components/Layout/Sidebar.tsx` (or equivalent sidebar component)
  - **Type**: Modify existing
  - **Description**: Add "Access Control" nav group to sidebar with three links:
    "Roles" → `/access-control/roles`, "Users" → `/access-control/users`,
    "Policies" → `/access-control/policies`. "Policies" link should only be
    visible when `abac_enabled` feature flag is true (or shown but grayed).
    Use appropriate icon (e.g., Shield from lucide-react).
  - **Spec Reference**: FR-020, plan §5 Files to Modify
  - **Dependencies**: Tasks 3.6, 3.7, 3.8, 3.9
  - **Estimated**: S (30–45 min)

---

## Phase 4: ABAC Data Model & Feature Flag

> **Objective**: Create the `policies` table, recursive Zod condition schema,
> `ConditionValidatorService`, `PolicyService`, and ABAC route plugin with
> feature-flag gate. Depends on Phase 1 (DDL patterns) and Phase 2 (route patterns).

- [ ] **4.1** `[FR-007]` `[FR-008]` `[FR-017]` Add `policies` table DDL to tenant provisioning
  - **File**: `apps/core-api/src/services/tenant.service.ts`
  - **Type**: Modify existing
  - **Location**: Tenant provisioning section (after roles/permissions DDL from Task 1.4)
  - **Description**: Add `policies` table creation (Migration 004 in plan §2.4):
    id, tenant_id, name, resource, effect CHECK('DENY','FILTER'), conditions JSONB
    DEFAULT '{}', priority INTEGER DEFAULT 0, source CHECK('core','plugin',
    'super_admin','tenant_admin'), plugin_id, is_active BOOLEAN DEFAULT true,
    created_at, updated_at. Add UNIQUE(tenant_id, name), CHECK(jsonb_typeof(conditions)
    = 'object'), CHECK(octet_length(conditions::text) <= 65536).
    Add indexes: idx_policies_tenant_id, idx_policies_resource(tenant_id, resource),
    idx_policies_source(tenant_id, source).
  - **Spec Reference**: FR-007, FR-008, FR-017, plan §2.1 policies table
  - **Dependencies**: Task 1.4
  - **Estimated**: M (1h)

- [ ] **4.2** `[FR-008]` `[P]` Implement recursive ABAC condition tree Zod schema
  - **Files**:
    - `apps/core-api/src/modules/authorization/dto/condition-tree.dto.ts` — recursive Zod schema for `ConditionTree`
    - `apps/core-api/src/modules/authorization/dto/create-policy.dto.ts` — full policy creation schema with condition tree
    - `apps/core-api/src/modules/authorization/dto/update-policy.dto.ts` — partial update schema
  - **Type**: Create new files
  - **Description**: `condition-tree.dto.ts` uses `z.lazy()` for recursion. Schema
    must match the JSONB structure from spec §7: leaf node `{ attribute, operator,
value }`, combinator nodes `{ all: [...] }`, `{ any: [...] }`, `{ not: {...} }`.
    Valid operators: `equals`, `notEquals`, `contains`, `in`, `greaterThan`,
    `lessThan`, `exists`. Zod validates structure shape only (depth/count limits
    are checked by `ConditionValidatorService` after parsing).
    `create-policy.dto.ts`: `{ name: z.string().min(1).max(200), resource: z.string().min(1).max(200), effect: z.enum(['DENY','FILTER']), priority: z.number().int().min(0).default(0), conditions: ConditionTreeSchema }`.
  - **Spec Reference**: FR-008, plan §4.6
  - **Dependencies**: Task 1.1
  - **Estimated**: M (2h)

- [ ] **4.3** `[FR-008]` `[P]` Implement ConditionValidatorService
  - **File**: `apps/core-api/src/modules/authorization/condition-validator.service.ts`
  - **Type**: Create new file
  - **Description**: Per plan §4.6:
    `validate(conditions)` — returns `ValidationResult { valid: boolean, errors: string[] }`;
    calls `measureDepth()` and `countConditions()` internally; also checks
    `octet_length(JSON.stringify(conditions)) <= 65536`.
    `measureDepth(node)` — recursive DFS; returns max depth from this node.
    `countConditions(node)` — recursive count of all leaf condition nodes.
    On validation failure, return error code `CONDITION_TREE_LIMIT_EXCEEDED`
    with details indicating which limit was exceeded (depth > 5, conditions > 20,
    or payload > 64 KB). Edge Case #12.
  - **Spec Reference**: FR-008, Edge Case #12, plan §4.6
  - **Dependencies**: Tasks 1.1, 4.2
  - **Estimated**: M (1–2h)

- [ ] **4.4** `[FR-007]` `[FR-008]` `[FR-009]` `[FR-014]` `[FR-015]` Implement PolicyService
  - **File**: `apps/core-api/src/modules/authorization/policy.service.ts`
  - **Type**: Create new file
  - **Description**: Per plan §4.5:
    `listPolicies(tenantId, filters)` — paginated; respects feature flag.
    `createPolicy(tenantId, data)` — call `ConditionValidatorService.validate()`;
    on fail: throw 422. Validate uniqueness (409 POLICY_NAME_CONFLICT).
    `updatePolicy(tenantId, policyId, data)` — guard `source IN ('core','plugin')`
    → 403 POLICY_SOURCE_IMMUTABLE (FR-009). Re-validate conditions.
    `deletePolicy(tenantId, policyId)` — same source immutability guard.
    `registerPluginPolicies(tenantId, pluginId, policies[])` — insert policies
    with `source = 'plugin'` (FR-014).
    Feature flag check: if `tenants.settings.features.abac_enabled` is false,
    createPolicy/updatePolicy/deletePolicy throw 404 FEATURE_NOT_AVAILABLE.
  - **Spec Reference**: FR-007–FR-009, FR-014–FR-015, Edge Case #3, plan §4.5
  - **Dependencies**: Tasks 1.1, 4.1, 4.2, 4.3
  - **Estimated**: M (3–4h)

- [ ] **4.5** `[FR-007]` `[FR-009]` `[FR-017]` `[NFR-010]` Implement policies route plugin
  - **File**: `apps/core-api/src/routes/policies.ts`
  - **Type**: Create new file
  - **Description**: Fastify route plugin registering 4 endpoints per plan §3.10–§3.13:
    - `GET  /api/v1/policies` — Bearer + `policies:read`; returns empty array when
      `abac_enabled = false` with `meta.featureEnabled = false`
    - `POST /api/v1/policies` — Bearer + `policies:write`; rate-limited; 404 when
      flag off; 422 on condition limit exceeded
    - `PUT  /api/v1/policies/:id` — Bearer + `policies:write`; rate-limited;
      403 POLICY_SOURCE_IMMUTABLE for core/plugin policies
    - `DELETE /api/v1/policies/:id` — Bearer + `policies:write`; rate-limited; 204
      All errors in standard `{ error: { code, message, details? } }` format.
  - **Spec Reference**: FR-007–FR-009, FR-017, NFR-010, plan §3.10–§3.13, Appendix C
  - **Dependencies**: Tasks 2.6, 4.4
  - **Estimated**: M (2–3h)

- [ ] **4.6** `[FR-007]` Register policies routes in application bootstrap
  - **File**: `apps/core-api/src/routes/` (index or app.ts)
  - **Type**: Modify existing
  - **Location**: Route registration section (alongside authorization routes from Task 2.12)
  - **Description**: Import and register the `policies` route plugin.
  - **Spec Reference**: plan §5 Files to Modify
  - **Dependencies**: Task 4.5
  - **Estimated**: S (15 min)

---

## Phase 5: Testing

> **Objective**: Full test suite targeting ~249 tests. Authorization module
> must reach ≥ 85% coverage; security code (AuthorizationService, cache
> invalidation, requirePermission) must reach 100% (Constitution Art. 4.1).

### Phase 5a: Unit Tests (parallelizable per component)

- [ ] **5.1** `[NFR-002]` `[NFR-007]` `[NFR-008]` `[P]` Unit tests — PermissionCacheService
  - **File**: `apps/core-api/src/__tests__/authorization/unit/permission-cache.service.unit.test.ts`
  - **Type**: Create new file
  - **Description**: 15 tests per plan §8.1. Mock Redis client. Test: GET on
    cache hit/miss, SET with jittered TTL distribution (statistical range check),
    `invalidateForRole()` lookup and batch DEL, `invalidateForUser()` single DEL,
    `invalidateForTenant()` SCAN+DEL pattern, `debouncedInvalidateForRole()` 500ms
    debounce (use fake timers), Redis failure fallback (returns null, logs warning).
  - **Spec Reference**: NFR-002, NFR-007, NFR-008, FR-019
  - **Dependencies**: Task 2.1
  - **Estimated**: M (1–2h)

- [ ] **5.2** `[FR-003]` `[FR-004]` `[FR-005]` `[FR-006]` `[P]` Unit tests — RoleService
  - **File**: `apps/core-api/src/__tests__/authorization/unit/role.service.unit.test.ts`
  - **Type**: Create new file
  - **Description**: 18 tests per plan §8.1. Mock Prisma. Test: `createRole()`
    success, name conflict (409), 50-role limit (422), system role create attempt.
    `updateRole()` / `deleteRole()` with system role guard (403). `assignRoleToUser()`
    success and duplicate (409). `removeRoleFromUser()` not-assigned (404).
    `getUserPermissions()` union correctness. Cache invalidation called on mutation.
  - **Spec Reference**: FR-003–FR-006, NFR-009, Edge Cases #8, #9
  - **Dependencies**: Task 2.2
  - **Estimated**: M (1–2h)

- [ ] **5.3** `[FR-001]` `[FR-002]` `[FR-006]` `[FR-010]` `[FR-016]` `[P]` Unit tests — AuthorizationService
  - **File**: `apps/core-api/src/__tests__/authorization/unit/authorization.service.unit.test.ts`
  - **Type**: Create new file
  - **Description**: 20 tests per plan §8.1 (security code = 100% coverage required).
    Mock PermissionCacheService, RoleService. Test: cache hit path, cache miss →
    DB fetch path, `matchesPermission()` with exact match / `*:*` wildcard /
    `resource:*` wildcard / `resource:sub:*` wildcard / non-matching wildcard.
    `isSuperAdmin()` true/false. Fail-closed on Redis error. Fail-closed on
    DB error. Audit log called with correct fields. DENY when no roles.
    DENY when RBAC fails (ABAC cannot override, FR-010). User with multiple
    roles: permissions are union (FR-006).
  - **Spec Reference**: FR-001, FR-002, FR-006, FR-010, FR-016, NFR-003, NFR-005
  - **Dependencies**: Task 2.4
  - **Estimated**: M (2h)

- [ ] **5.4** `[FR-011]` `[FR-012]` `[FR-013]` `[P]` Unit tests — PermissionRegistrationService
  - **File**: `apps/core-api/src/__tests__/authorization/unit/permission-registration.service.unit.test.ts`
  - **Type**: Create new file
  - **Description**: 10 tests per plan §8.1. Test: `registerPluginPermissions()`
    success (namespaced keys), conflict detection aborts (Edge Case #4),
    `removePluginPermissions()` cascades to role_permissions (FR-013),
    `registerCorePermissions()` idempotent upsert. Verify cache invalidation called.
  - **Spec Reference**: FR-011, FR-012, FR-013, Edge Case #4
  - **Dependencies**: Task 2.3
  - **Estimated**: S (1h)

- [ ] **5.5** `[NFR-004]` `[NFR-005]` `[P]` Unit tests — refactored requirePermission middleware
  - **File**: `apps/core-api/src/__tests__/authorization/unit/require-permission.unit.test.ts`
  - **Type**: Create new file
  - **Description**: 8 tests per plan §8.1. Test: 403 response body does NOT
    contain permission names (NFR-004 regression test). Audit log called on
    ALLOW and DENY. Fail-closed when AuthorizationService throws (NFR-005).
    Wildcard permission resolved correctly (delegates to AuthorizationService).
  - **Spec Reference**: NFR-004, NFR-005
  - **Dependencies**: Task 2.8
  - **Estimated**: S (45 min)

- [ ] **5.6** `[NFR-010]` `[P]` Unit tests — rate limiter guard
  - **File**: `apps/core-api/src/__tests__/authorization/unit/rate-limiter.guard.unit.test.ts`
  - **Type**: Create new file
  - **Description**: 6 tests per plan §8.1. Test: under-limit request passes,
    at-limit request (60th) passes, over-limit (61st) returns 429 with Retry-After
    header, per-tenant isolation (tenant A limit does not affect tenant B), Redis
    failure falls through gracefully (do not block request on Redis error).
  - **Spec Reference**: NFR-010, Edge Case #13
  - **Dependencies**: Task 2.6
  - **Estimated**: S (45 min)

- [ ] **5.7** `[FR-001]` `[FR-005]` `[P]` Unit tests — Zod DTOs
  - **File**: `apps/core-api/src/__tests__/authorization/unit/dtos.unit.test.ts`
  - **Type**: Create new file
  - **Description**: 12+ tests per plan §8.1. Test all DTO schemas: valid inputs,
    invalid types, boundary values (name min/max length, permissionIds max count),
    UUID format validation, recursive condition tree schema (valid tree, invalid
    operator, missing required field, deeply nested valid tree). Verify `z.infer<>`
    types align with domain interfaces.
  - **Spec Reference**: FR-001, FR-005, FR-008
  - **Dependencies**: Tasks 2.5, 4.2
  - **Estimated**: M (1–2h)

- [ ] **5.8** `[FR-007]` `[FR-008]` `[FR-009]` `[P]` Unit tests — PolicyService & ConditionValidatorService
  - **File**: `apps/core-api/src/__tests__/authorization/unit/policy.service.unit.test.ts`
  - **Type**: Create new file
  - **Description**: 27 tests per plan §8.1 (PolicyService: 12; ConditionValidator: 15).
    ConditionValidator: depth limit = 5 (pass/fail boundary), condition count = 20
    (pass/fail boundary), payload 64 KB limit, `measureDepth()` and `countConditions()`
    correct on nested trees, error code `CONDITION_TREE_LIMIT_EXCEEDED` with details.
    PolicyService: CRUD success paths, source immutability guard (403), feature
    flag gate (404), condition validation called and error propagated (422).
  - **Spec Reference**: FR-007–FR-009, FR-014–FR-015, Edge Cases #3, #12
  - **Dependencies**: Tasks 4.3, 4.4
  - **Estimated**: M (2h)

- [ ] **5.9** `[FR-020]` `[FR-021]` `[FR-022]` `[FR-023]` `[P]` Unit tests — frontend components
  - **Files** (co-located or in `apps/web/src/__tests__/`):
    - Tests for: `PermissionGroupAccordion`, `WildcardPermissionRow`, `ConditionBuilder`,
      `PolicySummary`, `RoleAssignmentDialog`, `SystemRoleBadge`, `EffectBadge`
  - **Type**: Create new files
  - **Description**: 30 tests per plan §8.1. Use Vitest + React Testing Library.
    `WildcardPermissionRow`: checking wildcard selects all sub-items, unchecking
    any sub-item unchecks wildcard.
    `PermissionGroupAccordion`: renders all sources, collapses/expands.
    `ConditionBuilder`: add condition, add group, remove condition, depth
    indicator updates, add button disabled at depth 5.
    `PolicySummary`: renders human-readable text for various tree shapes.
    `SystemRoleBadge`: renders lock icon and "System" text.
    `EffectBadge`: correct color variant for DENY vs FILTER.
    `RoleAssignmentDialog`: shows diff preview, calls mutation on confirm.
  - **Spec Reference**: FR-020–FR-023, §9 UX/UI Requirements
  - **Dependencies**: Tasks 3.2, 3.3, 3.4, 3.5
  - **Estimated**: L (3–4h)

### Phase 5b: Integration Tests (parallelizable per group)

- [ ] **5.10** `[FR-003]` `[FR-004]` `[FR-005]` `[P]` Integration tests — role CRUD and system role immutability
  - **File**: `apps/core-api/src/__tests__/authorization/integration/roles.integration.test.ts`
  - **Type**: Create new file
  - **Description**: 16 tests per plan §8.2. Use `buildTestApp()` + `testContext`.
    Test: GET /roles (empty, with data, pagination, search, type filter).
    POST /roles success (201), name conflict (409), 50-role limit (422).
    PUT /roles/:id success, system role immutable (403), name conflict (409).
    DELETE /roles/:id success (204), system role blocked (403), not found (404).
    All checks include cross-tenant isolation (role from tenant A not visible in tenant B).
  - **Spec Reference**: FR-003–FR-005, FR-023, NFR-006, Edge Cases #9
  - **Dependencies**: Task 2.7
  - **Estimated**: M (2h)

- [ ] **5.11** `[FR-006]` `[FR-018]` `[FR-024]` `[P]` Integration tests — user role assignment and me endpoints
  - **File**: `apps/core-api/src/__tests__/authorization/integration/user-roles.integration.test.ts`
  - **Type**: Create new file
  - **Description**: 14 tests. POST /users/:id/roles: success, user not in tenant
    (404), role not found (404), duplicate (409). DELETE /users/:id/roles/:roleId:
    success, role not assigned (404). GET /me/roles: returns correct role list.
    GET /me/permissions: returns union of all role permissions + wildcards list.
  - **Spec Reference**: FR-006, FR-018, FR-024
  - **Dependencies**: Task 2.7
  - **Estimated**: M (1–2h)

- [ ] **5.12** `[FR-019]` `[NFR-002]` `[NFR-007]` `[P]` Integration tests — permission cache invalidation
  - **File**: `apps/core-api/src/__tests__/authorization/integration/permission-cache.integration.test.ts`
  - **Type**: Create new file
  - **Description**: 6 tests. Test: role permission change triggers role-scoped
    flush (not tenant-wide); user role assignment change flushes only that user;
    Redis unavailable falls back to DB (log warning, correct result returned);
    jittered TTL is within 270–330s range; debounced flush batches rapid changes.
  - **Spec Reference**: FR-019, NFR-002, NFR-007, NFR-008
  - **Dependencies**: Task 2.1
  - **Estimated**: M (1–2h)

- [ ] **5.13** `[NFR-010]` `[P]` Integration tests — rate limiting on write endpoints
  - **File**: `apps/core-api/src/__tests__/authorization/integration/rate-limiting.integration.test.ts`
  - **Type**: Create new file
  - **Description**: 4 tests. Test: 60th mutation returns 200, 61st returns 429
    with Retry-After header; per-tenant isolation; window resets after 60s.
  - **Spec Reference**: NFR-010
  - **Dependencies**: Task 2.7
  - **Estimated**: S (1h)

- [ ] **5.14** `[FR-011]` `[FR-013]` `[P]` Integration tests — plugin permission registration
  - **File**: `apps/core-api/src/__tests__/authorization/integration/plugin-permissions.integration.test.ts`
  - **Type**: Create new file
  - **Description**: 8 tests. Plugin install registers permissions (namespaced
    by plugin_id), visible in GET /permissions. Duplicate key aborts install
    (Edge Case #4). Uninstall removes permissions from roles and permissions table
    (FR-013). Re-install after uninstall: permissions re-registered.
  - **Spec Reference**: FR-011–FR-013, Edge Case #4
  - **Dependencies**: Task 2.10
  - **Estimated**: M (1–2h)

- [ ] **5.15** `[FR-007]` `[FR-008]` `[FR-009]` `[P]` Integration tests — policy CRUD
  - **File**: `apps/core-api/src/__tests__/authorization/integration/policies.integration.test.ts`
  - **Type**: Create new file
  - **Description**: 14 tests. GET /policies with feature flag off (empty array,
    featureEnabled=false). POST /policies: success (201), flag off (404), condition
    limit exceeded (422 CONDITION_TREE_LIMIT_EXCEEDED with details). PUT /policies/:id:
    success, core policy immutable (403). DELETE /policies/:id: success, plugin policy
    immutable (403). Condition depth 5 passes, depth 6 fails.
  - **Spec Reference**: FR-007–FR-009, FR-015–FR-017, Edge Case #12
  - **Dependencies**: Task 4.5
  - **Estimated**: M (1–2h)

- [ ] **5.16** `[NFR-006]` `[P]` Integration tests — cross-tenant isolation
  - **File**: `apps/core-api/src/__tests__/authorization/integration/cross-tenant.integration.test.ts`
  - **Type**: Create new file
  - **Description**: 4 tests. Verify: roles from tenant A are not accessible via
    tenant B token; permissions from tenant A do not bleed into tenant B; policy
    created in tenant A not visible to tenant B. Each test uses two separate
    provisioned test tenants.
  - **Spec Reference**: NFR-006, FR-006
  - **Dependencies**: Tasks 2.7, 4.5
  - **Estimated**: M (1h)

### Phase 5c: E2E Tests

- [ ] **5.17** `[FR-001]` `[FR-006]` `[FR-010]` Full RBAC flow E2E tests
  - **File**: `apps/core-api/src/__tests__/authorization/e2e/rbac-flow.e2e.test.ts`
  - **Type**: Create new file
  - **Description**: 7 tests per plan §8.3. Test: assign role to user → check
    permission → access resource. Custom role lifecycle: create → assign → verify
    access → delete. Super admin `*:*` wildcard access (FR-016 — standard flow,
    audit logged). Permission cache: change role perms → verify cache flush →
    re-check shows updated permissions.
  - **Spec Reference**: FR-001, FR-006, FR-010, FR-016
  - **Dependencies**: Tasks 2.7, 2.8
  - **Estimated**: M (2h)

- [ ] **5.18** `[FR-020]` `[FR-021]` `[FR-023]` Frontend UI E2E tests (Playwright)
  - **File**: `apps/web/e2e/authorization.e2e.ts` (or equivalent Playwright path)
  - **Type**: Create new file
  - **Description**: 7 tests per plan §8.3. Role UI flow: navigate to Roles →
    create role → select permissions via accordion → wildcard auto-select →
    save → verify in list. System role: verify edit/delete disabled. User role
    assignment UI. Policy editor (feature flag gated): create policy with condition
    builder → verify summary. Accessibility: keyboard navigation for accordion,
    dialog, condition builder (WCAG 2.1 AA, Constitution Art. 1.3).
  - **Spec Reference**: FR-020, FR-021, FR-022, FR-023, §9 UX/UI Requirements
  - **Dependencies**: Tasks 3.6, 3.7, 3.8, 3.9
  - **Estimated**: L (3h)

---

## Phase 6: Polish & Documentation

- [ ] **6.1** `[NFR-003]` `[NFR-004]` Adversarial review and security audit
  - **Command**: `/forge-review .forge/specs/003-authorization/`
  - **Expected**: All HIGH severity findings resolved; MEDIUM severity documented
  - **Focus areas**: NFR-004 (no permission names in 403), NFR-006 (tenant
    isolation), fail-closed behavior (NFR-005), Redis cache key namespace
    collisions, SQL injection surface (parameterized queries only — Constitution §5.3)
  - **Dependencies**: All implementation phases complete
  - **Estimated**: M (1–2h review + fixes)

- [ ] **6.2** `[NFR-003]` `[P]` Update AUTHORIZATION.md to reference Spec 003
  - **File**: `docs/AUTHORIZATION.md`
  - **Type**: Modify existing
  - **Description**: Add deprecation notice at top: the ABAC ALLOW effect and
    INCONCLUSIVE evaluation state described in this document are superseded by
    Spec 003. Add reference link to spec.md as authoritative source. Per spec
    §10 Out of Scope note.
  - **Spec Reference**: Spec §10 (Superseded documentation)
  - **Dependencies**: None (can be done anytime)
  - **Estimated**: S (20 min)

- [ ] **6.3** `[NFR-003]` `[P]` Update security-architecture.md to reference Spec 003
  - **File**: `docs/security-architecture.md`
  - **Type**: Modify existing
  - **Description**: Add deprecation notice: prior ABAC model (ALLOW effect,
    INCONCLUSIVE state) is superseded by Spec 003 deny-only model.
    Reference spec.md §10 for details.
  - **Spec Reference**: Spec §10 (Superseded documentation)
  - **Dependencies**: None (can be done anytime)
  - **Estimated**: S (15 min)

- [ ] **6.4** `[FR-003]` `[P]` Run full test suite and verify coverage thresholds
  - **Command**: `cd apps/core-api && pnpm test:coverage`
  - **Expected**:
    - Authorization module overall: ≥ 85%
    - `authorization.service.ts` + `permission-cache.service.ts` + refactored `requirePermission`: 100%
    - Frontend components: ≥ 80%
    - No overall project coverage decrease
  - **Dependencies**: All phases complete
  - **Estimated**: S (run + review)

- [ ] **6.5** `[ALL]` Final CI green check
  - **Commands**: `pnpm lint && pnpm build && pnpm test`
  - **Expected**: All checks pass, no TypeScript errors, no ESLint violations
  - **Dependencies**: Task 6.4
  - **Estimated**: S (15 min)

---

## Summary

| Metric               | Value                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| Total tasks          | 43                                                                                                |
| Total phases         | 6 (Phase 1: 7, Phase 2: 12, Phase 3: 10, Phase 4: 6, Phase 5: 18 [sub-tasks grouped], Phase 6: 5) |
| Parallelizable tasks | 31 tasks marked `[P]`                                                                             |
| Requirements covered | 24/24 FRs covered, 10/10 NFRs covered                                                             |
| Planned tests        | ~249 (156 unit + 77 integration + 16 E2E)                                                         |

**Estimated total effort**: 52–70 hours (aligns with plan's ~52 story points;
upper bound accounts for test writing time).

---

## Cross-References

| Document           | Path                                                        |
| ------------------ | ----------------------------------------------------------- |
| Spec               | `.forge/specs/003-authorization/spec.md`                    |
| Plan               | `.forge/specs/003-authorization/plan.md`                    |
| Design Spec        | `.forge/specs/003-authorization/design-spec.md`             |
| User Journey       | `.forge/specs/003-authorization/user-journey.md`            |
| Constitution       | `.forge/constitution.md`                                    |
| ADR-002            | `.forge/knowledge/adr/adr-002-database-multi-tenancy.md`    |
| ADR-006            | `.forge/knowledge/adr/adr-006-fastify-framework.md`         |
| ADR-007            | `.forge/knowledge/adr/adr-007-prisma-orm.md`                |
| ADR-017 (required) | `.forge/knowledge/adr/adr-017-abac-engine.md` (not created) |
