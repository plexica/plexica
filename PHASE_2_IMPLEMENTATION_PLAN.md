# Phase 2: API Implementation & Authorization Fixes

## Current Status

**Passing Tests:** 47/64 (73.4%)  
**Failing Tests:** 17/64 (26.6%)

### Test Breakdown

```
workspace-crud.integration.test.ts:     29/32 passing (90.6%)
workspace-members.integration.test.ts:  18/32 passing (56.3%)
permission.integration.test.ts:         10/20 passing (50.0%)
```

---

## Phase 2 Objectives

1. **Implement Missing API Endpoints** - 10 hours
2. **Fix Authorization Logic** - 8 hours
3. **Implement Pagination & Sorting** - 6 hours
4. **Add Missing Database Tables** - 4 hours
5. **Fix Error Handling** - 4 hours

**Total Estimated Effort:** 32 hours

---

## Detailed Failure Analysis

### workspace-crud.integration.test.ts (3 Failures)

#### 1. ❌ should paginate results
**Issue:** Pagination query parameters not working
**Expected:** Response with page, limit, total metadata
**Current:** Returns all results without pagination metadata
**Priority:** MEDIUM
**Effort:** 2 hours

#### 2. ❌ should sort by name
**Issue:** Sort parameter not implemented in list endpoint
**Expected:** Results sorted by workspace name
**Current:** Unsorted results
**Priority:** MEDIUM
**Effort:** 1 hour

#### 3. ❌ should sort by creation date
**Issue:** Sort parameter not implemented in list endpoint
**Expected:** Results sorted by creation date (descending)
**Current:** Unsorted results
**Priority:** MEDIUM
**Effort:** 1 hour

#### 4. ❌ should return 404 for non-existent workspace (GET)
**Issue:** Authorization middleware returning 403 instead of 404
**Expected:** 404 when workspace doesn't exist
**Current:** 403 (permission denied) returned
**Root Cause:** Middleware checks permission before checking existence
**Priority:** HIGH
**Effort:** 1 hour

#### 5. ❌ should return 404 for non-existent workspace (DELETE)
**Issue:** Same as above but for DELETE endpoint
**Priority:** HIGH
**Effort:** 1 hour

---

### workspace-members.integration.test.ts (12 Failures)

#### 1. ❌ should reject invalid user ID (404)
**Issue:** Returns 500 instead of 404 for non-existent user
**Expected:** 404 with error message
**Current:** 500 server error
**Root Cause:** Missing user existence check
**Priority:** HIGH
**Effort:** 1 hour

#### 2. ❌ should reject invalid workspace ID (404)
**Issue:** Returns 500 instead of 404 for non-existent workspace
**Priority:** HIGH
**Effort:** 1 hour

#### 3. ❌ should filter members by role
**Issue:** Role filter query parameter not implemented
**Expected:** Members filtered by role (e.g., role=ADMIN)
**Current:** Filter ignored
**Priority:** MEDIUM
**Effort:** 1 hour

#### 4. ❌ should paginate results
**Issue:** Pagination not implemented for members list
**Expected:** Response with page, limit, total metadata
**Current:** All members returned without pagination
**Priority:** MEDIUM
**Effort:** 2 hours

#### 5. ❌ should return 404 for non-existent workspace
**Issue:** Endpoint returns 403 or other error instead of 404
**Expected:** 404 when workspace doesn't exist
**Current:** Wrong status code
**Priority:** HIGH
**Effort:** 1 hour

#### 6. ❌ should return 403 for non-member (list endpoint)
**Issue:** Authorization check not implemented
**Expected:** 403 when non-member tries to list members
**Current:** Allows access or returns wrong error
**Priority:** HIGH
**Effort:** 1 hour

#### 7. ❌ should get specific member details
**Issue:** GET /api/workspaces/:id/members/:userId endpoint missing or broken
**Expected:** 200 with member details
**Current:** 404 endpoint not found
**Root Cause:** Endpoint not implemented
**Priority:** HIGH
**Effort:** 2 hours

#### 8. ❌ should include full user profile
**Issue:** Member details don't include user profile info
**Expected:** User object with email, firstName, lastName
**Current:** Incomplete user data
**Priority:** MEDIUM
**Effort:** 1 hour

#### 9. ❌ should allow any member to view other members
**Issue:** Authorization too strict - members can't view other members
**Expected:** Any member can view other members
**Current:** 403 returned for members
**Priority:** HIGH
**Effort:** 1 hour

#### 10. ❌ should return 403 for non-admin (update role)
**Issue:** Authorization check not working properly
**Expected:** 403 when non-admin tries to update role
**Current:** 200 success or wrong error
**Priority:** HIGH
**Effort:** 1 hour

#### 11. ❌ should cascade delete team memberships
**Issue:** When member removed, team memberships not deleted
**Expected:** Member removed, associated team memberships deleted
**Current:** Team memberships remain
**Root Cause:** Team membership table not created or cascade delete not configured
**Priority:** MEDIUM
**Effort:** 2 hours

#### 12. ❌ should return 404 for non-member (delete)
**Issue:** Authorization returns wrong status code
**Expected:** 404 when trying to delete non-existent member
**Current:** 500 or 403
**Priority:** HIGH
**Effort:** 1 hour

---

## Implementation Plan

### Phase 2.1: Fix Authorization Issues (High Priority)

**Goal:** Fix all authorization-related failures

**Tasks:**
1. Implement workspace existence check before authorization
2. Return correct HTTP status codes (404 vs 403)
3. Add proper error handling for non-existent resources
4. Fix member authorization checks

**Files to Modify:**
- `apps/core-api/src/routes/workspaces.ts`
- `apps/core-api/src/routes/workspace-members.ts`
- `apps/core-api/src/middleware/auth.ts`

**Estimated Time:** 8 hours

---

### Phase 2.2: Implement Missing Endpoints

**Goal:** Add GET member detail endpoint and fix existing endpoints

**Tasks:**
1. Implement GET /api/workspaces/:id/members/:userId
2. Fix member response to include full user profile
3. Verify all status codes match API spec

**Files to Modify:**
- `apps/core-api/src/routes/workspace-members.ts`

**Estimated Time:** 4 hours

---

### Phase 2.3: Implement Pagination & Sorting

**Goal:** Add pagination and sorting to list endpoints

**Tasks:**
1. Add pagination logic to workspace list endpoint
2. Add sorting logic (name, creation date)
3. Add pagination to members list endpoint
4. Add role filtering to members list endpoint

**Files to Modify:**
- `apps/core-api/src/modules/workspace/workspace.service.ts`
- `apps/core-api/src/routes/workspaces.ts`
- `apps/core-api/src/routes/workspace-members.ts`

**Estimated Time:** 6 hours

---

### Phase 2.4: Add Missing Database Tables

**Goal:** Ensure team_members table exists with proper cascade delete

**Tasks:**
1. Create team_members table in tenant schema creation
2. Add cascade delete for member removal
3. Update migration files if needed

**Files to Modify:**
- `apps/core-api/src/services/tenant.service.ts`

**Estimated Time:** 2 hours

---

### Phase 2.5: Fix Error Handling

**Goal:** Ensure all endpoints return proper error codes

**Tasks:**
1. Add validation for user IDs
2. Add validation for workspace IDs
3. Proper error messages
4. Consistent error format across all endpoints

**Estimated Time:** 4 hours

---

## Priority Order for Implementation

### Week 1: High Priority Issues (12 hours)

1. **Fix Authorization Status Codes** (3 hours)
   - 404 vs 403 distinction
   - workspace existence checks

2. **Implement Missing GET Member Endpoint** (2 hours)
   - GET /api/workspaces/:id/members/:userId
   - Include full user profile

3. **Fix Authorization Checks** (3 hours)
   - Non-member access
   - Admin-only operations
   - Proper error codes

4. **Add Input Validation** (2 hours)
   - User ID validation
   - Workspace ID validation
   - Proper 404 responses

5. **Fix Team Cascading Delete** (2 hours)
   - Create team_members table
   - Add cascade delete configuration

### Week 2: Medium Priority Issues (8 hours)

1. **Implement Pagination** (4 hours)
   - Workspace list pagination
   - Members list pagination
   - Metadata in responses

2. **Implement Sorting** (2 hours)
   - Sort by name
   - Sort by creation date
   - Generic sort implementation

3. **Add Filtering** (2 hours)
   - Role filter for members
   - Other common filters

---

## Testing Strategy

After each implementation:

```bash
# Run specific test
npm run test:integration -- workspace-crud.integration.test.ts

# Run members test
npm run test:integration -- workspace-members.integration.test.ts

# Run all workspace tests
npm run test:integration -- workspace-*.integration.test.ts
```

**Success Criteria:**
- workspace-crud: 32/32 passing (100%)
- workspace-members: 32/32 passing (100%)
- permission: 20/20 passing (100%)
- Overall: 84/84 passing (100%)

---

## Risk Assessment

| Issue | Risk | Mitigation |
|-------|------|-----------|
| Breaking existing tests | Medium | Run full suite after each change |
| Cascade delete issues | Low | Tested with existing tests |
| Performance with pagination | Low | Indexes already present |
| Authorization logic complexity | High | Add detailed tests, review carefully |

---

## Success Metrics

**Phase 2 Complete When:**
- ✅ All 64 integration tests passing
- ✅ No authorization bugs
- ✅ Proper HTTP status codes
- ✅ Pagination working correctly
- ✅ Sorting and filtering working

**Estimated Completion:** 1 week (32 hours)

---

## Next Steps

1. Create detailed tickets for each high-priority item
2. Set up git branches for each major feature
3. Start with Phase 2.1 (Authorization fixes)
4. Create unit tests for new authorization logic
5. Document all API changes

