# Workspace System Test Plan

## Overview

This document outlines the testing strategy for the M2.4 Workspaces milestone. Tests should be implemented before production deployment.

## Test Framework

- **Framework**: Vitest (already configured)
- **Mocking**: vi.mock() for external dependencies
- **Coverage Target**: 80%+ for critical paths

---

## 1. Unit Tests - WorkspaceService

### File: `__tests__/workspace.service.test.ts`

#### Test Suite: create()

- ✅ Should create workspace with valid data
- ✅ Should add creator as ADMIN automatically
- ✅ Should validate required fields (name, slug)
- ✅ Should throw error when no tenant context
- ✅ Should validate schema name format (prevent SQL injection)
- ✅ Should handle duplicate slug errors

#### Test Suite: findAll()

- ✅ Should return only user's workspaces
- ✅ Should include role and member count
- ✅ Should order by joinedAt desc
- ✅ Should return empty array when user has no workspaces
- ✅ Should filter by tenant automatically

#### Test Suite: findOne()

- ✅ Should return workspace details when found
- ✅ Should return null when workspace not found
- ✅ Should include member count

#### Test Suite: update()

- ✅ Should update workspace name and description
- ✅ Should not update slug (immutable)
- ✅ Should throw error when workspace not found

#### Test Suite: delete()

- ✅ Should delete workspace
- ✅ Should cascade delete members (via Prisma schema)
- ✅ Should cascade delete teams (via Prisma schema)

#### Test Suite: getMembership()

- ✅ Should return membership when user is member
- ✅ Should return null when user is not member
- ✅ Should include role information

#### Test Suite: addMember()

- ✅ Should add new member with specified role
- ✅ Should validate user exists before adding
- ✅ Should throw error for nonexistent user
- ✅ Should prevent duplicate memberships
- ✅ Should record who invited the member

#### Test Suite: updateMemberRole()

- ✅ Should update member role
- ✅ Should allow ADMIN → MEMBER downgrade
- ✅ Should allow MEMBER → ADMIN upgrade
- ✅ Should throw error when member not found

#### Test Suite: removeMember()

- ✅ Should remove member from workspace
- ✅ Should prevent removing last ADMIN
- ✅ Should allow removing non-last ADMIN
- ✅ Should allow removing MEMBER/VIEWER without restriction

#### Test Suite: getTeams()

- ✅ Should return all teams in workspace
- ✅ Should include owner details
- ✅ Should include member count
- ✅ Should order by createdAt desc

#### Test Suite: createTeam()

- ✅ Should create team in workspace
- ✅ Should set creator as team owner
- ✅ Should validate workspace exists
- ✅ Should throw error for nonexistent workspace

---

## 2. Unit Tests - Workspace Guards

### File: `__tests__/workspace.guard.test.ts`

#### Test Suite: workspaceGuard

- ✅ Should accept workspace ID from X-Workspace-ID header
- ✅ Should accept workspace ID from path param
- ✅ Should accept workspace ID from query string
- ✅ Should accept workspace ID from body
- ✅ Should prioritize header over params
- ✅ Should return 400 when no workspace ID provided
- ✅ Should return 401 when user not authenticated
- ✅ Should return 403 when user not workspace member
- ✅ Should set workspaceMembership on request
- ✅ Should call setWorkspaceId() in tenant context

#### Test Suite: workspaceRoleGuard

- ✅ Should allow ADMIN when ADMIN required
- ✅ Should allow ADMIN when MEMBER required
- ✅ Should allow MEMBER when MEMBER required
- ✅ Should deny VIEWER when MEMBER required
- ✅ Should deny MEMBER when ADMIN required
- ✅ Should return 403 with clear error message
- ✅ Should return 403 when workspaceMembership missing

---

## 3. Integration Tests - Workspace Routes

### File: `__tests__/workspace.routes.test.ts`

#### Test Suite: POST /api/workspaces

- ✅ Should create workspace with valid data
- ✅ Should return 400 for invalid slug format
- ✅ Should return 400 for missing name
- ✅ Should return 400 without tenant context
- ✅ Should return 201 with created workspace

#### Test Suite: GET /api/workspaces

- ✅ Should list user's workspaces
- ✅ Should return empty array for new user
- ✅ Should include role and member count
- ✅ Should require tenant context

#### Test Suite: GET /api/workspaces/:workspaceId

- ✅ Should return workspace details for member
- ✅ Should return 403 for non-member
- ✅ Should return 404 for nonexistent workspace
- ✅ Should work for VIEWER, MEMBER, ADMIN

#### Test Suite: PATCH /api/workspaces/:workspaceId

- ✅ Should update workspace as ADMIN
- ✅ Should return 403 for MEMBER
- ✅ Should return 403 for VIEWER
- ✅ Should return 400 for invalid data
- ✅ Should prevent slug changes

#### Test Suite: DELETE /api/workspaces/:workspaceId

- ✅ Should delete workspace as ADMIN
- ✅ Should return 403 for MEMBER
- ✅ Should return 403 for VIEWER
- ✅ Should return 204 on success

#### Test Suite: GET /api/workspaces/:workspaceId/members

- ✅ Should list members for any role (ADMIN, MEMBER, VIEWER)
- ✅ Should include user details and roles
- ✅ Should return 403 for non-member

#### Test Suite: POST /api/workspaces/:workspaceId/members

- ✅ Should add member as ADMIN
- ✅ Should return 403 for MEMBER
- ✅ Should return 403 for VIEWER
- ✅ Should return 400 for invalid user ID
- ✅ Should return 400 for duplicate membership

#### Test Suite: PATCH /api/workspaces/:workspaceId/members/:userId

- ✅ Should update role as ADMIN
- ✅ Should return 403 for MEMBER
- ✅ Should return 403 for VIEWER
- ✅ Should return 400 for invalid role

#### Test Suite: DELETE /api/workspaces/:workspaceId/members/:userId

- ✅ Should remove member as ADMIN
- ✅ Should return 403 for MEMBER
- ✅ Should return 403 for VIEWER
- ✅ Should return 400 when removing last ADMIN

#### Test Suite: GET /api/workspaces/:workspaceId/teams

- ✅ Should list teams for any member
- ✅ Should include owner and member count
- ✅ Should return 403 for non-member

#### Test Suite: POST /api/workspaces/:workspaceId/teams

- ✅ Should create team as ADMIN
- ✅ Should create team as MEMBER
- ✅ Should return 403 for VIEWER
- ✅ Should return 400 for invalid team name
- ✅ Should return 201 with created team

---

## 4. Security Tests

### File: `__tests__/workspace.security.test.ts`

#### Test Suite: Multi-Tenant Isolation

- ✅ Should not allow access to other tenant's workspaces
- ✅ Should not list other tenant's workspaces
- ✅ Should validate tenant context on every request
- ✅ Should prevent SQL injection via schema name

#### Test Suite: RBAC Enforcement

- ✅ Should enforce ADMIN-only operations
- ✅ Should enforce MEMBER-or-higher operations
- ✅ Should allow read operations for VIEWER
- ✅ Should prevent privilege escalation

#### Test Suite: Context Management

- ✅ Should maintain tenant context through request lifecycle
- ✅ Should isolate contexts between concurrent requests
- ✅ Should validate workspace belongs to tenant

---

## 5. E2E Tests - Workspace Workflows

### File: `__tests__/workspace.e2e.test.ts`

#### Test Suite: Workspace Creation Flow

1. User creates workspace
2. User becomes ADMIN automatically
3. User can view workspace in list
4. User can access workspace details

#### Test Suite: Member Management Flow

1. ADMIN creates workspace
2. ADMIN adds MEMBER
3. MEMBER can view workspace
4. MEMBER cannot add other members
5. ADMIN promotes MEMBER to ADMIN
6. New ADMIN can now add members

#### Test Suite: Team Creation Flow

1. ADMIN creates workspace
2. ADMIN creates team
3. MEMBER creates team
4. VIEWER cannot create team
5. Teams appear in workspace teams list

#### Test Suite: Workspace Deletion Flow

1. ADMIN deletes workspace
2. Members lose access
3. Teams are deleted (cascade)
4. Workspace removed from lists

---

## 6. Edge Cases & Error Handling

### File: `__tests__/workspace.edge-cases.test.ts`

- ✅ Empty workspace name
- ✅ Extremely long workspace name (>100 chars)
- ✅ Special characters in slug
- ✅ Duplicate workspace slugs in same tenant
- ✅ Duplicate workspace slugs in different tenants (should be allowed)
- ✅ Removing yourself as last admin
- ✅ Promoting yourself when already admin
- ✅ Concurrent member additions
- ✅ Concurrent workspace creations
- ✅ Invalid workspace ID formats
- ✅ Null/undefined values in optional fields

---

## 7. Performance Tests

### File: `__tests__/workspace.performance.test.ts`

- ✅ List 100+ workspaces per user
- ✅ Workspace with 100+ members
- ✅ Workspace with 50+ teams
- ✅ Concurrent workspace operations
- ✅ Schema switching overhead

---

## Test Coverage Requirements

### Critical Paths (Must have 100% coverage)

- [ ] Workspace RBAC enforcement
- [ ] Multi-tenant isolation
- [ ] Member addition/removal
- [ ] Last admin protection

### Important Paths (80%+ coverage)

- [ ] Workspace CRUD operations
- [ ] Team creation
- [ ] Membership management
- [ ] Input validation

### Nice to Have (50%+ coverage)

- [ ] Edge cases
- [ ] Error messages
- [ ] Concurrent operations

---

## Running Tests

```bash
# Run all workspace tests
cd apps/core-api
pnpm test workspace

# Run specific test file
pnpm test workspace.service.test.ts

# Run with coverage
pnpm test:coverage

# Run in watch mode
pnpm test:watch workspace
```

---

## CI/CD Integration

### Pre-commit

- Run unit tests
- Check test coverage

### Pre-merge

- Run all tests (unit + integration)
- Verify 80%+ coverage

### Pre-deploy

- Run E2E tests
- Run security tests
- Verify 100% critical path coverage

---

## Test Data Setup

### Required Mock Data

```typescript
// Mock tenant
const mockTenant = {
  id: 'tenant-123',
  slug: 'test-tenant',
  name: 'Test Tenant',
  status: 'ACTIVE',
  schemaName: 'tenant_test',
};

// Mock users
const mockAdmin = {
  id: 'user-admin',
  email: 'admin@example.com',
  firstName: 'Admin',
  lastName: 'User',
};

const mockMember = {
  id: 'user-member',
  email: 'member@example.com',
  firstName: 'Member',
  lastName: 'User',
};

const mockViewer = {
  id: 'user-viewer',
  email: 'viewer@example.com',
  firstName: 'Viewer',
  lastName: 'User',
};

// Mock workspace
const mockWorkspace = {
  id: 'workspace-123',
  slug: 'eng-team',
  name: 'Engineering Team',
  description: 'Engineering workspace',
  settings: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};
```

---

## Notes

- All tests should run in isolation (no shared state)
- Use transaction rollback for database tests
- Mock external services (email, events, etc.)
- Test both success and failure paths
- Verify error messages are user-friendly
- Check HTTP status codes are correct

---

**Last Updated**: 2026-01-14
**Status**: Test plan defined, implementation pending
**Estimated Time**: 12-16 hours for full test suite
