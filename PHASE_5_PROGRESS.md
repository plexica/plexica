# Phase 5: Plugin Tests - Progress Tracker

**Objective**: Test the plugin marketplace and lifecycle system  
**Start Date**: 2024  
**Target Completion**: ~8-12 hours (2-3 days)

---

## 📊 Overall Progress

- **Status**: 🟡 IN PROGRESS (Task 5.1)
- **Completion**: ~20% (Discovery complete, reorganization in progress)
- **Files Created**: 0 / 10 target files
- **Tests Written**: ~100 existing tests (need reorganization) / ~150 target tests
- **Lines of Code**: ~2,542 lines (existing) / ~4,500 target lines

---

## 📁 Existing Plugin Test Files (Found)

We discovered **5 existing plugin test files** with ~2,542 lines of code:

1. **apps/core-api/src/**tests**/plugin.service.test.ts** (165 lines)
   - Unit tests for PluginRegistryService
   - Coverage: registerPlugin, listPlugins, deletePlugin, deprecatePlugin

2. **apps/core-api/src/**tests**/schemas/plugin-manifest.test.ts** (529 lines)
   - Unit tests for plugin manifest schema validation
   - Coverage: Manifest validation, API section, semver, service names

3. **apps/core-api/src/**tests**/integration/plugin-communication.test.ts** (~900 lines)
   - Integration tests for plugin-to-plugin communication (M2.3)
   - Coverage: Service registry, dependency resolution, shared data

4. **apps/core-api/src/**tests**/services/plugin-api-gateway.test.ts** (~500 lines)
   - Unit tests for API gateway service
   - Coverage: Request routing, authentication, rate limiting

5. **apps/core-api/src/**tests**/services/plugin-service-extended.test.ts** (~448 lines)
   - Extended unit tests for plugin service
   - Coverage: Lifecycle operations, tenant plugin management

**Status**: ✅ Discovery complete, need to reorganize into unit/integration/e2e structure

---

## 🎯 Task Breakdown

### ✅ Task 5.1: Reorganize Existing Plugin Tests (IN PROGRESS)

**Goal**: Move existing tests into organized structure  
**Status**: 🟡 IN PROGRESS  
**Estimated Time**: 30 minutes

**Actions**:

- [x] Create directory structure: `plugin/{unit,integration,e2e}`
- [ ] Move `plugin.service.test.ts` → `plugin/unit/plugin-registry.test.ts`
- [ ] Move `schemas/plugin-manifest.test.ts` → `plugin/unit/plugin-manifest.test.ts`
- [ ] Move `services/plugin-api-gateway.test.ts` → `plugin/unit/plugin-api-gateway.test.ts`
- [ ] Move `services/plugin-service-extended.test.ts` → `plugin/unit/plugin-lifecycle.test.ts`
- [ ] Move `integration/plugin-communication.test.ts` → `plugin/integration/plugin-communication.integration.test.ts`
- [ ] Update import paths (`../../` → `../../../` for moved files)
- [ ] Run tests to verify no breakage

**Current Progress**: 10%

---

### ⏳ Task 5.2: Unit Tests - Plugin Lifecycle & Validation

**Goal**: Create comprehensive unit tests for plugin lifecycle operations  
**Status**: ⏳ TODO  
**Estimated Time**: 2 hours

**Files to create**:

- [ ] `plugin/unit/plugin-version.test.ts` (400 lines, 30 tests)
  - Semver version validation and comparison
  - Version upgrade/downgrade logic
  - Version compatibility checking
  - Beta/RC version handling

- [ ] `plugin/unit/plugin-validation.test.ts` (400 lines, 30 tests)
  - Plugin configuration validation
  - Permission requirements validation
  - Dependency conflict detection
  - Manifest completeness checks

**Target Coverage**:

- Semver version parsing (1.0.0, 1.2.3-beta, 2.0.0-rc.1)
- Version constraints (^1.0.0, ~2.3.4, >=3.0.0)
- Configuration field validation (required fields, types, defaults)
- Permission scope validation (resource, action, description)
- Dependency cycle detection
- Conflicting plugin detection

**Current Progress**: 0%

---

### ⏳ Task 5.3: Integration Tests - Plugin Installation & Lifecycle

**Goal**: Test complete plugin install/uninstall flows with real database  
**Status**: ⏳ TODO  
**Estimated Time**: 3 hours

**Files to create**:

- [ ] `plugin/integration/plugin-install.integration.test.ts` (600 lines, 35 tests)
  - POST /plugins (register plugin to marketplace)
  - POST /tenants/:id/plugins/:pluginId/install
  - POST /tenants/:id/plugins/:pluginId/activate
  - POST /tenants/:id/plugins/:pluginId/deactivate
  - DELETE /tenants/:id/plugins/:pluginId (uninstall)
  - Configuration updates (PATCH /tenants/:id/plugins/:pluginId/configuration)

- [ ] `plugin/integration/plugin-marketplace.integration.test.ts` (500 lines, 30 tests)
  - GET /plugins (list all available plugins)
  - GET /plugins/:pluginId (get plugin details)
  - GET /plugins/:pluginId/stats (installation stats)
  - PUT /plugins/:pluginId (update plugin)
  - DELETE /plugins/:pluginId (remove from marketplace)
  - Filtering by category, status, search
  - Pagination support

**Target Coverage**:

- Plugin registration by super admin
- Installation to specific tenant
- Plugin activation/deactivation toggle
- Configuration persistence across restarts
- Uninstall with cleanup verification
- Multi-tenant installations
- Version management (install specific version)

**Current Progress**: 0%

---

### ⏳ Task 5.4: Integration Tests - Plugin Permissions & Security

**Goal**: Test plugin permission enforcement and security boundaries  
**Status**: ⏳ TODO  
**Estimated Time**: 2 hours

**File to create**:

- [ ] `plugin/integration/plugin-permissions.integration.test.ts` (500 lines, 30 tests)

**Target Coverage**:

- Plugin requesting API access (via manifest permissions)
- Permission enforcement (deny if not granted)
- Tenant-scoped vs global plugin access
- Plugin capability verification
- Unauthorized plugin access prevention
- Plugin API authentication
- Cross-tenant isolation (plugin in tenant A can't access tenant B data)

**Current Progress**: 0%

---

### ⏳ Task 5.5: E2E Tests - Plugin Installation Workflows

**Goal**: Test complete end-to-end plugin workflows  
**Status**: ⏳ TODO  
**Estimated Time**: 3 hours

**File to create**:

- [ ] `plugin/e2e/plugin-installation.e2e.test.ts` (700 lines, 25 tests)

**Target Coverage**:

- Complete workflow: publish → install → configure → enable → use → disable → uninstall
- Multi-tenant plugin installation (same plugin in 2+ tenants with different configs)
- Plugin upgrade flow (install v1.0.0 → upgrade to v1.1.0)
- Plugin downgrade/rollback (v1.1.0 → v1.0.0)
- Uninstall with data cleanup verification
- Configuration persistence (restart doesn't lose config)
- Large-scale installation (10+ plugins in one tenant)
- Plugin dependencies (install plugin A that requires plugin B)

**Current Progress**: 0%

---

### ⏳ Task 5.6: E2E Tests - Plugin Isolation & Concurrency

**Goal**: Test plugin data isolation and concurrent operations  
**Status**: ⏳ TODO  
**Estimated Time**: 2 hours

**Files to create**:

- [ ] `plugin/e2e/plugin-isolation.e2e.test.ts` (500 lines, 20 tests)
  - Plugin data isolation between tenants
  - Same plugin installed in multiple tenants (different configs, separate data)
  - Plugin uninstall doesn't affect other tenants
  - Plugin upgrade in tenant A doesn't affect tenant B

- [ ] `plugin/e2e/plugin-concurrent.e2e.test.ts` (400 lines, 15 tests)
  - Concurrent plugin installations (10+ at once)
  - Race conditions on version conflicts
  - Concurrent activate/deactivate operations
  - Performance under load (50+ concurrent operations)

**Current Progress**: 0%

---

## 📁 Final Target Structure

```
apps/core-api/src/__tests__/plugin/
├── unit/                                              # 6 files, ~70 tests
│   ├── plugin-registry.test.ts                       # 10 tests (moved from plugin.service.test.ts)
│   ├── plugin-manifest.test.ts                       # 30 tests (moved from schemas/plugin-manifest.test.ts)
│   ├── plugin-api-gateway.test.ts                    # 20 tests (moved from services/plugin-api-gateway.test.ts)
│   ├── plugin-lifecycle.test.ts                      # 25 tests (moved from services/plugin-service-extended.test.ts)
│   ├── plugin-version.test.ts                        # 30 tests ✨ NEW
│   └── plugin-validation.test.ts                     # 30 tests ✨ NEW
│
├── integration/                                       # 4 files, ~95 tests
│   ├── plugin-communication.integration.test.ts      # ~35 tests (moved from integration/plugin-communication.test.ts)
│   ├── plugin-install.integration.test.ts            # 35 tests ✨ NEW
│   ├── plugin-marketplace.integration.test.ts        # 30 tests ✨ NEW
│   └── plugin-permissions.integration.test.ts        # 30 tests ✨ NEW
│
└── e2e/                                               # 3 files, ~60 tests
    ├── plugin-installation.e2e.test.ts               # 25 tests ✨ NEW
    ├── plugin-isolation.e2e.test.ts                  # 20 tests ✨ NEW
    └── plugin-concurrent.e2e.test.ts                 # 15 tests ✨ NEW
```

**Total**: 13 files, ~225 tests, ~4,500 lines

---

## 🔧 Plugin System Architecture (Reference)

### Core Models

```typescript
Plugin (Global Registry)
├── id: string (plugin-{name})
├── name: string
├── version: string (semver)
├── status: AVAILABLE | DEPRECATED
├── manifest: JSON (capabilities, permissions, endpoints)
├── createdAt: Date
└── updatedAt: Date

TenantPlugin (Per-Tenant Installation)
├── id: string
├── tenantId: string (FK)
├── pluginId: string (FK)
├── status: ACTIVE | INACTIVE | INSTALLING | FAILED
├── enabled: boolean
├── configuration: JSON
├── installedAt: Date
└── lastActivated: Date
```

### Key API Endpoints

**Global Registry (Super Admin Only)**:

- `POST /api/plugins` - Register plugin
- `GET /api/plugins` - List plugins
- `GET /api/plugins/:pluginId` - Get plugin details
- `PUT /api/plugins/:pluginId` - Update plugin
- `DELETE /api/plugins/:pluginId` - Delete plugin
- `GET /api/plugins/:pluginId/stats` - Installation stats

**Tenant Plugin Management**:

- `POST /api/tenants/:id/plugins/:pluginId/install` - Install plugin
- `POST /api/tenants/:id/plugins/:pluginId/activate` - Activate plugin
- `POST /api/tenants/:id/plugins/:pluginId/deactivate` - Deactivate plugin
- `DELETE /api/tenants/:id/plugins/:pluginId` - Uninstall plugin
- `PATCH /api/tenants/:id/plugins/:pluginId/configuration` - Update config
- `GET /api/tenants/:id/plugins` - List installed plugins

---

## ⚠️ Testing Notes

1. **Plugin Manifest**: All plugins have a `manifest` JSON that defines capabilities, permissions, API endpoints, and dependencies. Use `validatePluginManifest()` for validation.

2. **Super Admin Only**: Plugin registration/deletion requires super admin role. Use `testContext.auth.getRealSuperAdminToken()`.

3. **Tenant Isolation**: Each tenant has independent plugin installations. Same plugin can have different configs per tenant.

4. **Lifecycle Hooks**: Plugins can define lifecycle hooks (install, uninstall, activate, deactivate) that execute custom logic.

5. **Version Management**: Plugins use semver. Test upgrade paths and version compatibility.

---

## 📚 Key Reference Files

- **Plugin Types**: `apps/core-api/src/types/plugin.types.ts`
- **Manifest Schema**: `apps/core-api/src/schemas/plugin-manifest.schema.ts`
- **Plugin Routes**: `apps/core-api/src/routes/plugin.ts`
- **Plugin Service**: `apps/core-api/src/services/plugin.service.ts`
- **Test Infrastructure**: `test-infrastructure/helpers/test-context.helper.ts`

---

## 🎯 Next Immediate Actions

1. **Complete Task 5.1** (Reorganize existing tests):
   - Move 5 test files into new structure
   - Update import paths
   - Verify all tests pass

2. **Start Task 5.2** (Create version & validation unit tests)

---

**Last Updated**: Phase 5 start (Task 5.1 in progress)
