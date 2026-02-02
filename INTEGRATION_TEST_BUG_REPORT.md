# Integration Test Errors - Detailed Bug Report

## 🔴 BUG #1: Permission Service Type Mismatch

### Location

- **Service**: `src/services/permission.service.ts:141, 177`
- **Test**: `src/__tests__/auth/integration/permission.integration.test.ts:52, 86`

### Problem

The permission service expects `permissions` column to be `JSONB`, but creates it as `TEXT[]`

### Code Analysis

#### In permission.service.ts (Line 141)

```typescript
await db.$executeRawUnsafe(
  `
  INSERT INTO "${schemaName}".roles (id, name, description, permissions, created_at, updated_at)
  VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())  // ❌ Casting to JSONB
  `,
  id,
  name,
  description || null,
  JSON.stringify(permissions) // Stringified array
);
```

#### In permission.integration.test.ts (Line 52)

```typescript
await db.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS tenant_acme_corp.roles (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    permissions TEXT[] NOT NULL DEFAULT '{}',  // ❌ Defined as TEXT[]
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
```

### Error Message

```
Invalid `prisma.$executeRawUnsafe()` invocation:
Raw query failed. Code: `42804`. Message: `column "permissions" is of type text[] but expression is of type jsonb`
```

### Causes 18 Test Failures

All tests in `permission.integration.test.ts` that interact with roles fail because:

1. INSERT fails due to type mismatch
2. No roles are created
3. Subsequent queries fail

### Solution Options

#### Option A: Change service to use TEXT[] (Recommended)

More aligned with the test expectations and simpler semantics.

**Changes needed**:

1. In `permission.service.ts` line 141: Remove `::jsonb` cast
2. In `permission.service.ts` line 177: Remove `::jsonb` cast
3. Handle JSON parsing in TypeScript instead of SQL

**Example**:

```typescript
// Line 138-147
await db.$executeRawUnsafe(
  `
  INSERT INTO "${schemaName}".roles (id, name, description, permissions, created_at, updated_at)
  VALUES ($1, $2, $3, $4, NOW(), NOW())
  `,
  id,
  name,
  description || null,
  permissions // Pass array directly, PostgreSQL will handle it as TEXT[]
);
```

#### Option B: Change test to use JSONB

Align test schema with actual service expectation.

**Changes needed**:

1. In `permission.integration.test.ts` line 52: Change to `permissions JSONB NOT NULL DEFAULT '[]'::jsonb`
2. In `permission.integration.test.ts` line 86: Same change

**Example**:

```typescript
await db.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS tenant_acme_corp.roles (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,  // Changed to JSONB
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
```

---

## 🔴 BUG #2: Missing TeamMember Table

### Location

- **Test**: `src/__tests__/workspace/integration/workspace-members.integration.test.ts`
- **Database Schema**: `tenant_acme` (test tenant)

### Problem

The test queries the `TeamMember` table which doesn't exist in the test database schema

### Error Message

```
prisma:error
Invalid `prisma.$executeRaw()` invocation:

Raw query failed. Code: `42P01`. Message: `relation "tenant_acme.TeamMember" does not exist`
```

### Affected Test

- `should cascade delete team memberships` (Line ~680)

### Cause Analysis

When removing a workspace member, the service attempts to cascade delete team memberships:

```typescript
// Likely in workspace-members service
await db.$executeRaw`
  DELETE FROM ${Prisma.raw(`"${tenantSchema}"."TeamMember"`)}
  WHERE memberId IN (SELECT id FROM ${Prisma.raw(`"${tenantSchema}"."WorkspaceMember"`)})
`;
```

### Solutions

#### Option A: Create TeamMember Table in Test Setup

Add table creation in `beforeAll` hook:

```typescript
await db.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "${tenantSchema}".TeamMember (
    id TEXT PRIMARY KEY,
    teamId TEXT NOT NULL,
    memberId TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teamId) REFERENCES "${tenantSchema}".Team(id),
    FOREIGN KEY (memberId) REFERENCES "${tenantSchema}".WorkspaceMember(id),
    UNIQUE(teamId, memberId)
  )
`);
```

#### Option B: Skip This Test for Now

Mark test as skipped until feature is fully implemented:

```typescript
it.skip('should cascade delete team memberships', async () => {
  // Implementation pending
});
```

#### Option C: Check Prisma Schema Migration

Verify that the Prisma schema has been migrated correctly and that the TeamMember table exists in actual migrations.

```bash
# Check current migrations
ls -la prisma/migrations/

# Run migrations on test database
npm run db:migrate:test
```

---

## 🔴 BUG #3: Workspace API Service Initialization Issue

### Location

- **Test**: `src/__tests__/workspace/integration/workspace-api.integration.test.ts`
- **Failure Rate**: 21/24 tests (87.5%)

### Problem

Nearly all tests in this file are failing, suggesting a fundamental setup issue rather than individual test logic problems.

### Affected Tests

```
✗ should create a workspace with the creator as admin
✗ should reject duplicate workspace slug within tenant
✗ should create workspace with custom settings
✗ should get all workspaces for a user
✗ should return empty array when user has no workspaces
✗ should get workspace by ID with members and teams
✗ should throw error when workspace not found
✗ should update workspace details
✗ should throw error when updating non-existent workspace
✗ should update workspace settings
✗ should add a member to workspace
✗ should reject adding duplicate member
✗ should add member with specific role
✗ should get membership information
✗ should return null for non-member
✗ should update member role
✗ should prevent removing last admin
✗ should allow removing non-admin member
✗ should allow removing admin when multiple admins exist
✗ should delete workspace with no teams
✗ should prevent deleting workspace with teams
```

### Passing Tests

Only 3 tests pass, and they seem to be minimal:

```
✓ should get teams in workspace (returns empty array probably)
✓ should create team in workspace (minimal setup)
✓ should throw error creating team in non-existent workspace (error path)
```

### Root Cause Analysis

The likely issues are:

1. **Service Not Initialized**
   - WorkspaceService might not be instantiated
   - Database connection issues
   - Transaction handling failures

2. **Missing Database Setup**
   - Test tenant might not exist
   - Required tables might not be created
   - Seed data missing

3. **Authentication/Authorization Issues**
   - Tokens not properly created
   - Headers not being passed correctly
   - Tenant context not being set

### Debugging Steps

1. **Check the test file more carefully**:

```bash
cat src/__tests__/workspace/integration/workspace-api.integration.test.ts | head -200
```

2. **Run with verbose logging**:

```bash
npm run test:integration -- workspace-api.integration.test.ts --reporter=verbose 2>&1 | tee debug.log
```

3. **Test database connection**:

```bash
psql -h localhost -p 5433 -U postgres -d plexica_test -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%';"
```

4. **Check test database setup**:

```bash
# Run just the beforeAll hook manually
node -e "const test = require('./src/__tests__/workspace/integration/workspace-api.integration.test.ts'); test.beforeAll();"
```

---

## ⚠️ BUG #4: Pagination and Sorting Not Implemented

### Location

- **Test File**: `src/__tests__/workspace/integration/workspace-crud.integration.test.ts`
- **Affected Tests**: 3 tests

### Problem

Pagination and sorting features are tested but not implemented in the API

### Failing Tests

```
✗ should paginate results (Line 362)
✗ should sort by name (Line 376)
✗ should sort by creation date (Line 393)
```

### Error Pattern

These tests likely fail with:

- `400 Bad Request` - unsupported query parameters
- `200 OK` but incorrect results - parameters ignored

### Implementation Required

#### In workspace controller/route:

```typescript
router.get('/workspaces', async (request, reply) => {
  const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = request.query as any;

  const skip = (page - 1) * limit;

  const [workspaces, total] = await Promise.all([
    workspaceService.listUserWorkspaces(userId, {
      skip,
      take: limit,
      orderBy: {
        [sortBy]: sortOrder,
      },
    }),
    workspaceService.countUserWorkspaces(userId),
  ]);

  return {
    data: workspaces,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
});
```

---

## 🟡 BUG #5: Negative Timeout Warning

### Location

Every integration test shows:

```
(node:97574) TimeoutNegativeWarning: -1770073013291 is a negative number.
Timeout duration was set to 1.
```

### Problem

Vitest is receiving negative timeout values, causing warnings.

### Cause

Likely in test setup/teardown where timeouts are being calculated incorrectly.

### Solution

Check `test/vitest.config.integration.ts` and ensure timeout values are positive integers.

---

## 📊 Summary Table

| Bug                                | Severity | Tests Affected | Fix Complexity              |
| ---------------------------------- | -------- | -------------- | --------------------------- |
| Permission Type Mismatch           | CRITICAL | 18             | EASY (1 line change)        |
| Missing TeamMember Table           | CRITICAL | 1+             | EASY (add table creation)   |
| Workspace API Init Issue           | CRITICAL | 21             | MEDIUM (requires debugging) |
| Pagination/Sorting Not Implemented | HIGH     | 3              | MEDIUM (implement feature)  |
| Negative Timeout Warning           | LOW      | ALL            | EASY (config fix)           |

---

## 🎯 Recommended Fix Order

### Phase 1 (Immediate - 30 min)

1. [ ] Fix Permission type mismatch (Option A or B)
2. [ ] Add TeamMember table creation in test setup
3. [ ] Fix timeout warning in vitest config

### Phase 2 (Short-term - 1-2 hours)

4. [ ] Debug workspace-api.integration.test.ts initialization
5. [ ] Check test database setup and seeding

### Phase 3 (Medium-term - 2-4 hours)

6. [ ] Implement pagination in workspace list endpoint
7. [ ] Implement sorting in workspace list endpoint

### Phase 4 (Verification)

8. [ ] Re-run all integration tests
9. [ ] Verify success rate improves to >95%
10. [ ] Add test coverage for edge cases
