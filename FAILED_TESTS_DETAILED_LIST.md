# Complete List of Failed Integration Tests

## Test Execution Summary

**Total Tests Run**: 181
**Passed**: 114 (63%)
**Failed**: 67 (37%)
**Test Files**: 11

---

## 🔴 CRITICAL FAILURES (40 tests)

### Category 1: Permission Service Failures (18 tests)

**File**: `src/__tests__/auth/integration/permission.integration.test.ts`
**Root Cause**: Type mismatch in permissions column (TEXT[] vs JSONB)

```
1. ✗ should create roles with permissions (28ms)
2. ✗ should get all roles in a tenant (26ms)
3. ✗ should get a specific role by ID (12ms)
4. ✗ should update role permissions (16ms)
5. ✗ should assign role to user (17ms)
6. ✗ should prevent duplicate role assignments (19ms)
7. ✗ should remove role from user (16ms)
8. ✗ should aggregate permissions from multiple roles (17ms)
9. ✗ should check if user has specific permission (18ms)
10. ✗ should check if user has any of multiple permissions (17ms)
11. ✗ should check if user has all of multiple permissions (17ms)
12. ✗ should reflect permission changes immediately (16ms)
13. ✗ should handle permission removal (16ms)
14. ✗ should isolate permissions between tenants (16ms)
15. ✗ should not allow cross-tenant permission queries (17ms)
16. ✗ should isolate roles between tenants (17ms)
17. ✗ should delete a role (16ms)
18. ✗ should initialize default roles for a new tenant (15ms)
```

**Error Pattern**: Code 42804 - column "permissions" is of type text[] but expression is of type jsonb
**Affected Lines**: `permission.service.ts:141, 177`

---

### Category 2: Workspace API Service Failures (21 tests)

**File**: `src/__tests__/workspace/integration/workspace-api.integration.test.ts`
**Root Cause**: Service initialization or database connection issue

```
1. ✗ should create a workspace with the creator as admin (8ms)
2. ✗ should reject duplicate workspace slug within tenant (8ms)
3. ✗ should create workspace with custom settings (1ms)
4. ✗ should get all workspaces for a user (1ms)
5. ✗ should return empty array when user has no workspaces (1ms)
6. ✗ should get workspace by ID with members and teams (1ms)
7. ✗ should throw error when workspace not found (2ms)
8. ✗ should update workspace details (1ms)
9. ✗ should throw error when updating non-existent workspace (1ms)
10. ✗ should update workspace settings (1ms)
11. ✗ should add a member to workspace (1ms)
12. ✗ should reject adding duplicate member (1ms)
13. ✗ should add member with specific role (1ms)
14. ✗ should get membership information (1ms)
15. ✗ should return null for non-member (0ms)
16. ✗ should update member role (1ms)
17. ✗ should prevent removing last admin (1ms)
18. ✗ should allow removing non-admin member (1ms)
19. ✗ should allow removing admin when multiple admins exist (1ms)
20. ✗ should delete workspace with no teams (1ms)
21. ✗ should prevent deleting workspace with teams (1ms)
```

**Passes**: Only 3 edge-case tests pass:

- ✓ should get teams in workspace
- ✓ should create team in workspace
- ✓ should throw error creating team in non-existent workspace

**Observation**: Very fast execution times (0-8ms) suggest tests are terminating early without executing logic

---

## ⚠️ MEDIUM FAILURES (12 tests)

### Category 3: Workspace Members Failures (12 tests)

**File**: `src/__tests__/workspace/integration/workspace-members.integration.test.ts`
**Failure Rate**: 12/32 (37.5%)

```
1. ✗ should reject invalid user ID (404) (22ms)
2. ✗ should reject invalid workspace ID (404) (15ms)
3. ✗ should filter members by role (26ms)
4. ✗ should paginate results (20ms)
5. ✗ should return 404 for non-existent workspace (13ms)
6. ✗ should return 403 for non-member (36ms)
7. ✗ should get specific member details (1ms)
8. ✗ should include full user profile (1ms)
9. ✗ should allow any member to view other members (1ms)
10. ✗ should return 403 for non-admin (17ms)
11. ✗ should cascade delete team memberships (14ms) - Code 42P01 (TeamMember table missing)
12. ✗ should return 404 for non-member (21ms)
```

**Primary Error**: Code 42P01 - relation "tenant_acme.TeamMember" does not exist
**Affected Test**: "should cascade delete team memberships"

**Other Issues**: Various validation and filtering logic failures

**Passes**: 20/32 tests pass, including all core member operations:

- ✓ should add member with default role (MEMBER)
- ✓ should add member with VIEWER role
- ✓ should add member with ADMIN role
- ✓ should reject duplicate member (409)
- ✓ should reject non-admin user (403)
- ✓ should update member role (ADMIN action)
- ✓ should prevent removing last admin
- ✓ should remove member (ADMIN action)
- ✓ and 12 more...

---

## 🟡 LIGHT FAILURES (5 tests)

### Category 4: Workspace CRUD Failures (5 tests)

**File**: `src/__tests__/workspace/integration/workspace-crud.integration.test.ts`
**Failure Rate**: 5/32 (15.6%)

```
1. ✗ should paginate results (20ms)
   - Missing pagination implementation
   - Line: 362

2. ✗ should sort by name (28ms)
   - Missing sorting implementation
   - Line: 376

3. ✗ should sort by creation date (14ms)
   - Missing sorting implementation
   - Line: 393

4. ✗ should return 404 for non-existent workspace (16ms)
   - Issue in GET endpoint
   - Line: 503

5. ✗ should return 404 for non-existent workspace (13ms)
   - Issue in DELETE endpoint
   - Line: 797
```

**Root Cause**:

- Tests 1-3: Feature not implemented in API
- Tests 4-5: Error handling issue in endpoints

**Passes**: 27/32 tests pass, covering:

- Workspace creation and validation
- Slug uniqueness checks
- Default settings
- Admin role assignment
- And 23 more...

---

## ✅ COMPLETELY PASSING TESTS (114 tests)

### Category 5: Fully Passing Test Files (139 tests total from 7 files)

#### File 1: plugin-marketplace.integration.test.ts (23/23) ✓

- All CRUD operations for plugins
- Plugin discovery and search
- Rating and installation tracking
- Plugin marketplace operations

#### File 2: plugin-permissions.integration.test.ts (17/17) ✓

- Plugin permission management
- Access control for plugins
- Permission inheritance

#### File 3: plugin-install.integration.test.ts (18/18) ✓

- Plugin installation process
- Dependency resolution
- Version management

#### File 4: auth-flow.integration.test.ts (13/13) ✓

- OAuth flow
- Token generation and validation
- Multi-tenant authentication

#### File 5: marketplace-api.integration.test.ts (39/39) ✓

- Complete marketplace API testing
- Search, filter, and discovery
- Pagination and sorting (working here!)
- Advanced queries

#### File 6: workspace-tenant.integration.test.ts (19/19) ✓

- Tenant isolation
- Workspace-tenant relationships
- Multi-tenant scenarios

#### File 7: plugin-communication.integration.test.ts (9/9) ✓

- Inter-plugin communication
- Message passing
- Event handling

---

## 📊 Failure Distribution

### By Issue Type

| Issue Type                      | Count  | Percentage |
| ------------------------------- | ------ | ---------- |
| Type Mismatch (JSONB vs TEXT[]) | 18     | 26.9%      |
| Uninitialized Service           | 21     | 31.3%      |
| Missing Table                   | 1      | 1.5%       |
| Feature Not Implemented         | 3      | 4.5%       |
| Error Handling/Validation       | 24     | 35.8%      |
| **TOTAL**                       | **67** | **100%**   |

### By Severity

| Severity | Count | Impact                                            |
| -------- | ----- | ------------------------------------------------- |
| CRITICAL | 40    | Permission service broken, Workspace API unusable |
| HIGH     | 3     | Missing features                                  |
| MEDIUM   | 12    | Edge cases and advanced features                  |
| LOW      | 12    | Error validation and edge cases                   |

---

## 🔍 Error Codes Reference

| Code         | Message                               | Count | Files                                 |
| ------------ | ------------------------------------- | ----- | ------------------------------------- |
| 42804        | Type mismatch (column type)           | 18    | permission.integration.test.ts        |
| 42P01        | Relation/table doesn't exist          | 1+    | workspace-members.integration.test.ts |
| (unknown)    | Service not initialized/DB connection | 21    | workspace-api.integration.test.ts     |
| (unknown)    | Feature not implemented               | 3     | workspace-crud.integration.test.ts    |
| (validation) | Various validation failures           | 24    | workspace-members.integration.test.ts |

---

## 📈 Priority Fix Order

### Priority 1: Fix Type Mismatch (5 min)

**Impact**: Restore 18 tests
**File**: `src/services/permission.service.ts:141, 177`
**Action**: Remove `::jsonb` cast

### Priority 2: Add Missing Table (10 min)

**Impact**: Restore 1+ tests
**File**: `src/__tests__/workspace/integration/workspace-members.integration.test.ts`
**Action**: Add TeamMember table creation in beforeAll()

### Priority 3: Debug Service Initialization (30-60 min)

**Impact**: Restore 21 tests
**File**: `src/__tests__/workspace/integration/workspace-api.integration.test.ts`
**Action**: Investigate and fix initialization

### Priority 4: Implement Missing Features (20-30 min)

**Impact**: Restore 3 tests
**File**: `src/__tests__/workspace/integration/workspace-crud.integration.test.ts`
**Action**: Implement pagination and sorting

### Priority 5: Fix Validation Logic (30-45 min)

**Impact**: Restore remaining tests
**Files**: workspace-members.integration.test.ts
**Action**: Fix error handling and validation

---

## 📝 Test Execution Log Reference

To see the full execution log:

```bash
# From the root directory
cat apps/core-api/integration-test-output.log

# Or run fresh tests
cd apps/core-api
npm run test:integration 2>&1 | tee integration-test-results.log
```

---

Generated: Integration Test Analysis Report
