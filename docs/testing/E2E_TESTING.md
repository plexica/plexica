# End-to-End Testing Guide

## Overview

This guide covers comprehensive end-to-end (E2E) testing for the Plexica platform. These tests verify complete user workflows across authentication, workspace management, team collaboration, and multi-tenant isolation.

**Estimated Time**: 45-60 minutes for complete testing  
**Prerequisites**: Clean database state, all services running

---

## Table of Contents

1. [Pre-Testing Setup](#pre-testing-setup)
2. [Phase 1: Authentication & Tenant Setup](#phase-1-authentication--tenant-setup)
3. [Phase 2: Workspace Creation & Management](#phase-2-workspace-creation--management)
4. [Phase 3: Workspace Settings & Member Management](#phase-3-workspace-settings--member-management)
5. [Phase 4: Team Management](#phase-4-team-management)
6. [Phase 5: Workspace Deletion & Edge Cases](#phase-5-workspace-deletion--edge-cases)
7. [Phase 6: RBAC & Security Testing](#phase-6-rbac--security-testing)
8. [Phase 7: Cross-Browser & Responsive Testing](#phase-7-cross-browser--responsive-testing)
9. [Phase 8: Performance & Error Handling](#phase-8-performance--error-handling)
10. [Phase 9: Data Persistence & Cleanup](#phase-9-data-persistence--cleanup)

---

## Pre-Testing Setup

### Step 1: Start Backend Server

```bash
# Terminal 1 - Backend
cd apps/core-api
pnpm dev
```

**Expected Output**:

```
Server listening at http://localhost:3000
✓ Database connected
✓ Prisma client initialized
✓ Routes registered
```

**Verification**:

```bash
# Test health endpoint
curl http://localhost:3000/health

# Expected response:
# {"status":"healthy","timestamp":"2026-01-21T..."}
```

**Troubleshooting**:

❌ **If server fails to start**:

- Check if port 3000 is in use: `lsof -ti:3000`
- Kill existing process: `lsof -ti:3000 | xargs kill -9`
- Check PostgreSQL is running: `docker ps | grep postgres`
- Check for TypeScript errors: `pnpm tsc --noEmit`

---

### Step 2: Start Frontend Server

```bash
# Terminal 2 - Frontend
cd apps/web
pnpm dev
```

**Expected Output**:

```
VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

**Verification**:

- Open browser to `http://localhost:5173`
- You should see the login page (if not authenticated)

**Troubleshooting**:

❌ **If frontend fails to start**:

- Check if port 5173 is in use: `lsof -ti:5173`
- Check for TypeScript errors: `pnpm tsc --noEmit`
- Verify route tree generated: `ls -la src/routeTree.gen.ts`

---

## Testing Checklist Format

Use this format to track your testing:

- [ ] Test not started
- [x] Test passed
- [!] Test failed (note the issue)
- [?] Test unclear/blocked

---

## Phase 1: Authentication & Tenant Setup

### Test 1.1: Login Flow

**Important**: Plexica uses URL-based tenant identification. Each tenant has:

- A unique subdomain URL (e.g., `tenant1.plexica.app`)
- A dedicated Keycloak realm (e.g., `tenant1-realm`)
- No tenant selection after login - tenant is automatically detected from URL

**Steps**:

1. [ ] Set up your test environment:
   - For **localhost**: Set `VITE_DEFAULT_TENANT=test-tenant` in `apps/web/.env`
   - For **subdomain testing**: Configure `/etc/hosts` with `127.0.0.1 tenant1.localhost`

2. [ ] Navigate to your tenant URL:
   - Development: `http://localhost:5173`
   - Subdomain test: `http://tenant1.localhost:5173`
   - Production: `http://tenant1.plexica.app`

3. [ ] Click "Login" or "Sign in with Keycloak"

**Expected**:

- [ ] Redirected to Keycloak login page for your tenant's realm
- [ ] Keycloak URL includes your tenant's realm: `/realms/test-tenant-realm/` (or `tenant1-realm`)
- [ ] No console errors
- [ ] Login page shows correct tenant branding (if configured)

4. [ ] Enter credentials and submit

**Expected**:

- [ ] Successful login redirects back to your tenant URL
- [ ] Auth token stored (check DevTools → Application → Local Storage)
- [ ] Tenant info automatically loaded (check `plexica-auth` in localStorage)
- [ ] Redirected to dashboard (NOT to tenant selection page)
- [ ] Header shows tenant name

**Actual Result**: ****\_\_\_****

**Issues**: ****\_\_\_****

---

### Test 1.2: Tenant Automatic Detection

**This test replaces the old manual tenant selection**

**Steps**:

1. [ ] After successful login, open browser console
2. [ ] Look for log: `[AuthProvider] Step 1: Tenant from URL: test-tenant`
3. [ ] Look for log: `[Keycloak] Creating config for tenant: test-tenant, realm: test-tenant-realm`
4. [ ] Look for log: `[AuthProvider] Step 7: Tenant info received`

**Expected**:

- [ ] Tenant slug extracted from URL matches expected tenant
- [ ] Keycloak realm name generated correctly (e.g., `test-tenant-realm`)
- [ ] Tenant data fetched from backend API
- [ ] Tenant stored in auth state
- [ ] No manual tenant selection UI appears
- [ ] Dashboard loads with tenant-specific data

**Actual Result**: ****\_\_\_****

**Issues**: ****\_\_\_****

**Verification**:

Check localStorage contains tenant:

```javascript
// In browser console
JSON.parse(localStorage.getItem('plexica-auth'));
// Should show: { tenant: { id: "...", slug: "test-tenant", name: "..." } }
```

---

### Test 1.3: Multi-Tenant URL Isolation (Optional)

**Only if you have multiple tenants and subdomain setup**

**Steps**:

1. [ ] Login to first tenant: `http://tenant1.localhost:5173`
2. [ ] Note the tenant name and data in dashboard
3. [ ] Open NEW browser tab (or incognito)
4. [ ] Navigate to: `http://tenant2.localhost:5173`
5. [ ] Login with same or different credentials

**Expected**:

- [ ] Each tenant URL uses its own Keycloak realm
- [ ] Tenant 1 data NOT visible in Tenant 2
- [ ] Workspace data isolated per tenant
- [ ] Logging out from Tenant 1 doesn't affect Tenant 2
- [ ] localStorage keys are separate or tenant-scoped

**Actual Result**: ****\_\_\_****

**Issues**: ****\_\_\_****

---

## Phase 2: Workspace Creation & Management

### Test 2.1: Workspace Switcher Visibility

**Steps**:

1. [ ] Look at the top-right area of the header
2. [ ] You should see a workspace switcher dropdown (or "No Workspace" indicator)

**Expected**:

- [ ] WorkspaceSwitcher component is visible
- [ ] Shows current workspace OR "No workspace selected"
- [ ] Dropdown icon/button is clickable

**Actual Result**: ****\_\_\_****

**Issues**: ****\_\_\_****

**Screenshot Location**: ****\_\_\_****

---

### Test 2.2: Create First Workspace

**Steps**:

1. [ ] Click the WorkspaceSwitcher dropdown
2. [ ] Look for "Create New Workspace" option or button
3. [ ] Click "Create New Workspace"
4. [ ] You should see an inline form OR modal with fields:
   - Workspace Name (required)
   - Workspace Slug (required) - should auto-generate from name
   - Description (optional)

**Test Data**:

```
Name: Engineering Team
Slug: eng-team (should auto-fill or validate)
Description: Main engineering workspace
```

5. [ ] Fill in the form with test data above
6. [ ] Click "Create" or "Submit"

**Expected**:

- [ ] Loading spinner appears briefly
- [ ] Success message shown (toast/notification)
- [ ] Dropdown closes automatically
- [ ] New workspace is now selected (shown in switcher)
- [ ] You remain on current page (no full redirect)

**Actual Result**: ****\_\_\_****

**Issues**: ****\_\_\_****

**Verification**:

```bash
# Check via API
curl -X GET http://localhost:3000/api/workspaces \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-Slug: test-tenant"

# Should return array with your new workspace
```

---

### Test 2.3: Create Second Workspace

**Repeat Test 2.2 with different data**:

```
Name: Marketing Team
Slug: marketing-team
Description: Marketing and communications
```

**Expected**:

- [ ] Second workspace created successfully
- [ ] Can see both workspaces in switcher dropdown
- [ ] Second workspace is now active (selected)

**Actual Result**: ****\_\_\_****

---

### Test 2.4: Switch Between Workspaces

**Steps**:

1. [ ] Open WorkspaceSwitcher dropdown
2. [ ] You should see both "Engineering Team" and "Marketing Team"
3. [ ] Click on "Engineering Team"
4. [ ] Observe the switcher updates to show "Engineering Team" as active
5. [ ] Open dropdown again and switch back to "Marketing Team"

**Expected**:

- [ ] Workspace switch is instant (no page reload)
- [ ] Current workspace indicator updates correctly
- [ ] No errors in console
- [ ] Workspace preference persists (check localStorage)

**Verification**:

- [ ] Open DevTools → Application → Local Storage
- [ ] Look for key like `workspace_test-tenant` (tenant-specific)
- [ ] Value should be the ID of "Marketing Team"

**Actual Result**: ****\_\_\_****

**Issues**: ****\_\_\_****

---

### Test 2.5: Workspace Badge Display

**Steps**:

1. [ ] While on "Marketing Team" workspace, look for workspace badges/indicators
2. [ ] Navigate to different pages (Teams, Settings, etc.)

**Expected**:

- [ ] Workspace name/badge visible on relevant pages
- [ ] Shows correct workspace name
- [ ] Updates when switching workspaces

**Actual Result**: ****\_\_\_****

---

## Phase 3: Workspace Settings & Member Management

### Test 3.1: Navigate to Workspace Settings

**Steps**:

1. [ ] Ensure "Marketing Team" is selected
2. [ ] Look for navigation link to "Workspace Settings" (sidebar, menu, or direct URL)
3. [ ] Click to navigate OR go to `http://localhost:5173/workspace-settings`

**Expected**:

- [ ] Workspace settings page loads
- [ ] Shows three tabs: "General", "Members", "Teams"
- [ ] Current workspace name shown in header/breadcrumb
- [ ] "General" tab is active by default

**Actual Result**: ****\_\_\_****

**Issues**: ****\_\_\_****

---

### Test 3.2: General Settings Tab

**Steps**:

1. [ ] On "General" tab, you should see:
   - Workspace name (editable)
   - Description (editable)
   - Slug (read-only/display)
   - Created date (read-only)
   - Save button
   - Delete workspace button (red, dangerous action)

2. [ ] Edit workspace name to "Marketing & Communications"
3. [ ] Edit description to "Marketing, PR, and communications team"
4. [ ] Click "Save" button

**Expected**:

- [ ] Loading state on Save button
- [ ] Success message appears
- [ ] Changes saved (reload page to verify)
- [ ] Workspace switcher shows updated name

**Actual Result**: ****\_\_\_****

**Issues**: ****\_\_\_****

---

### Test 3.3: Members Tab - View Members

**Steps**:

1. [ ] Click on "Members" tab
2. [ ] You should see a list of workspace members

**Expected**:

- [ ] At least one member shown (you, as ADMIN)
- [ ] Your role shown as "ADMIN"
- [ ] Badge or indicator showing "You" or "Current User"
- [ ] No "Remove" button next to your name (can't remove yourself)
- [ ] "Add Member" button visible (if ADMIN)

**Actual Result**: ****\_\_\_****

---

### Test 3.4: Add Member (Prerequisite: Need another user)

**Note**: This test requires a second user in the database. If you don't have one, skip to Test 3.5.

**Steps**:

1. [ ] Click "Add Member" button
2. [ ] Modal/form opens with fields:
   - User selector (email or ID)
   - Role dropdown (ADMIN, MEMBER, VIEWER)
3. [ ] Select a user
4. [ ] Select role: "MEMBER"
5. [ ] Click "Add" or "Invite"

**Expected**:

- [ ] Loading state
- [ ] Success message
- [ ] New member appears in list with "MEMBER" role
- [ ] Modal closes

**Actual Result**: ****\_\_\_****

**Issues**: ****\_\_\_****

---

### Test 3.5: Change Member Role (If Test 3.4 completed)

**Steps**:

1. [ ] Find the member you just added in the list
2. [ ] Look for "Edit" or role dropdown next to their name
3. [ ] Change role from "MEMBER" to "VIEWER"
4. [ ] Confirm the change

**Expected**:

- [ ] Role updates immediately
- [ ] Success message shown
- [ ] Member's role badge changes to "VIEWER"

**Actual Result**: ****\_\_\_****

---

### Test 3.6: Remove Member (If Test 3.4 completed)

**Steps**:

1. [ ] Find the member you added
2. [ ] Click "Remove" button next to their name
3. [ ] Confirmation dialog appears
4. [ ] Confirm removal

**Expected**:

- [ ] Confirmation dialog shows member name and warning
- [ ] Member is removed from list after confirmation
- [ ] Success message shown
- [ ] Cannot remove yourself (test this - should show error)

**Actual Result**: ****\_\_\_****

---

### Test 3.7: Teams Tab - View Workspace Teams

**Steps**:

1. [ ] Click on "Teams" tab
2. [ ] You should see a grid or list of teams in this workspace

**Expected**:

- [ ] Empty state shown if no teams yet ("No teams yet" message)
- [ ] "Create Team" button visible
- [ ] Friendly message encouraging team creation

**Actual Result**: ****\_\_\_****

---

## Phase 4: Team Management

### Test 4.1: Navigate to Teams Page

**Steps**:

1. [ ] Look for "Teams" navigation link (sidebar or menu)
2. [ ] Click to navigate OR go to `http://localhost:5173/team`

**Expected**:

- [ ] Teams page loads
- [ ] Breadcrumb shows: Dashboard › [Workspace Name] › Teams
- [ ] Current workspace badge visible (e.g., "Marketing & Communications • 0 teams")
- [ ] Search bar visible
- [ ] "Create Team" button visible (top-right)
- [ ] Empty state if no teams: "No teams yet" with encouragement message

**Actual Result**: ****\_\_\_****

**Issues**: ****\_\_\_****

---

### Test 4.2: Create First Team

**Steps**:

1. [ ] Click "Create Team" button (or "Create Your First Team" from empty state)
2. [ ] Modal opens with form fields:
   - Team Name (required)
   - Description (optional)
   - Workspace info displayed (read-only, showing current workspace)

**Test Data**:

```
Name: Frontend Development
Description: Frontend engineers and UI/UX designers
```

3. [ ] Fill in the form with test data
4. [ ] Click "Create Team"

**Expected**:

- [ ] Loading state on button ("Creating...")
- [ ] Success message appears
- [ ] Modal closes
- [ ] New team appears in the teams grid/list
- [ ] Team card shows:
  - Team name: "Frontend Development"
  - Description
  - Member count: 0 members
  - Created date
  - "View Team" button
  - More options menu (three dots)
- [ ] Workspace badge updates to show "1 team"

**Actual Result**: ****\_\_\_****

**Issues**: ****\_\_\_****

**Verification**:

```bash
# Check via API
curl -X GET http://localhost:3000/api/workspaces/WORKSPACE_ID/teams \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-Slug: test-tenant" \
  -H "X-Workspace-ID: WORKSPACE_ID"

# Should return array with your new team
```

---

### Test 4.3: Create Second Team

**Repeat Test 4.2 with different data**:

```
Name: Backend Development
Description: Backend engineers and DevOps
```

**Expected**:

- [ ] Second team created successfully
- [ ] Both teams visible in grid
- [ ] Workspace badge shows "2 teams"
- [ ] Teams ordered by creation date (newest first)

**Actual Result**: ****\_\_\_****

---

### Test 4.4: Search Teams

**Steps**:

1. [ ] Type "Frontend" in the search bar
2. [ ] Observe the results

**Expected**:

- [ ] Only "Frontend Development" team shown
- [ ] "Backend Development" team hidden
- [ ] Search is case-insensitive
- [ ] Search works on team name and description

3. [ ] Clear search (or type "Backend")
4. [ ] Observe results update

**Actual Result**: ****\_\_\_****

---

### Test 4.5: Workspace Context Switching for Teams

**Steps**:

1. [ ] While viewing teams for "Marketing & Communications", note the teams (should show 2 teams)
2. [ ] Open WorkspaceSwitcher and switch to "Engineering Team"
3. [ ] Observe the Teams page

**Expected**:

- [ ] Page updates to show teams for "Engineering Team"
- [ ] Empty state shown (no teams yet in this workspace)
- [ ] Breadcrumb updates to show "Engineering Team"
- [ ] Workspace badge shows "Engineering Team • 0 teams"
- [ ] No teams from "Marketing & Communications" visible (proper isolation)

4. [ ] Create a team in "Engineering Team" workspace:

```
Name: Platform Team
Description: Infrastructure and platform engineering
```

5. [ ] Switch back to "Marketing & Communications"

**Expected**:

- [ ] Back to seeing "Frontend Development" and "Backend Development"
- [ ] "Platform Team" NOT visible (workspace isolation working)

**Actual Result**: ****\_\_\_****

**Issues**: ****\_\_\_****

---

### Test 4.6: View Team Details (Future Feature)

**Steps**:

1. [ ] Click "View Team" button on "Frontend Development" card

**Expected**:

- [ ] Either:
  - Navigation to team detail page (if implemented)
  - "Coming Soon" message (if not implemented)
  - Error/404 (if route not set up)

**Actual Result**: ****\_\_\_****

**Note**: If this redirects to a 404, that's expected - team detail page is an optional enhancement not yet implemented.

---

## Phase 5: Workspace Deletion & Edge Cases

### Test 5.1: Delete Workspace (Destructive - Do Last)

**Warning**: This will permanently delete the workspace and all its teams. Do this test last.

**Steps**:

1. [ ] Navigate to Workspace Settings for "Engineering Team"
2. [ ] Go to "General" tab
3. [ ] Scroll to bottom - look for "Delete Workspace" button (red/danger styled)
4. [ ] Click "Delete Workspace"

**Expected**:

- [ ] Confirmation dialog appears
- [ ] Warning message about permanent deletion
- [ ] Must type workspace name to confirm (or check "I understand")
- [ ] "Delete" button in dialog is disabled until confirmation

5. [ ] Complete confirmation steps
6. [ ] Click final "Delete" button

**Expected**:

- [ ] Loading state
- [ ] Success message: "Workspace deleted"
- [ ] Redirect to another workspace OR dashboard
- [ ] "Engineering Team" no longer in WorkspaceSwitcher dropdown
- [ ] "Platform Team" also deleted (cascade)

**Actual Result**: ****\_\_\_****

**Issues**: ****\_\_\_****

**Verification**:

```bash
# Check workspace is gone
curl -X GET http://localhost:3000/api/workspaces \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-Slug: test-tenant"

# Should NOT include "Engineering Team"
```

---

### Test 5.2: No Workspace Selected State

**Steps**:

1. [ ] Delete all workspaces (or use DevTools to clear localStorage)
2. [ ] Refresh the page
3. [ ] Navigate to Teams page

**Expected**:

- [ ] WorkspaceSwitcher shows "No Workspace Selected" or similar
- [ ] Teams page shows message: "No Workspace Selected"
- [ ] Friendly prompt to select or create a workspace
- [ ] No team data shown

**Actual Result**: ****\_\_\_****

---

### Test 5.3: Invalid Workspace ID Handling

**Steps**:

1. [ ] Open DevTools → Network tab
2. [ ] Create a new workspace
3. [ ] In DevTools, look for the API call: `POST /api/workspaces`
4. [ ] Copy the response workspace ID
5. [ ] Manually set workspace ID in localStorage to invalid UUID
6. [ ] Refresh page

**Expected**:

- [ ] Error message shown (workspace not found)
- [ ] Workspace switcher resets to valid state
- [ ] User can select a valid workspace
- [ ] No app crash

**Actual Result**: ****\_\_\_****

---

## Phase 6: RBAC & Security Testing

**Note**: These tests require multiple users with different roles. If you only have one user, document that these tests are skipped.

### Test 6.1: VIEWER Role Restrictions

**Prerequisite**: Add a user with VIEWER role to a workspace

**Steps** (as VIEWER):

1. [ ] Try to edit workspace name in Settings → General
2. [ ] Try to add a member in Settings → Members
3. [ ] Try to create a team in Teams page

**Expected**:

- [ ] Edit workspace: Button disabled OR 403 error on save
- [ ] Add member: Button not visible OR 403 error
- [ ] Create team: Button not visible OR 403 error
- [ ] Can VIEW all data (teams, members, workspace details)

**Actual Result**: ****\_\_\_****

---

### Test 6.2: MEMBER Role Permissions

**Prerequisite**: Add a user with MEMBER role to a workspace

**Steps** (as MEMBER):

1. [ ] Try to edit workspace name in Settings → General
2. [ ] Try to add a member in Settings → Members
3. [ ] Try to create a team in Teams page
4. [ ] Try to delete workspace

**Expected**:

- [ ] Edit workspace: NOT allowed (403 or button disabled)
- [ ] Add member: NOT allowed (403 or button disabled)
- [ ] Create team: ALLOWED (button visible, creation succeeds)
- [ ] Delete workspace: NOT allowed (403 or button disabled)
- [ ] Can VIEW all data

**Actual Result**: ****\_\_\_****

---

### Test 6.3: ADMIN Role Permissions

**Steps** (as ADMIN - your original account):

1. [ ] Edit workspace name: ALLOWED ✓
2. [ ] Add member: ALLOWED ✓
3. [ ] Remove member: ALLOWED ✓
4. [ ] Change member role: ALLOWED ✓
5. [ ] Create team: ALLOWED ✓
6. [ ] Delete workspace: ALLOWED ✓

**Expected**:

- [ ] All operations succeed
- [ ] All buttons visible
- [ ] Full control over workspace

**Actual Result**: ****\_\_\_****

---

## Phase 7: Cross-Browser & Responsive Testing

### Test 7.1: Responsive Design

**Steps**:

1. [ ] Open DevTools → Toggle device toolbar (Ctrl+Shift+M or Cmd+Shift+M)
2. [ ] Test on different screen sizes:
   - [ ] Mobile (375px width)
   - [ ] Tablet (768px width)
   - [ ] Desktop (1920px width)

**Check**:

- [ ] WorkspaceSwitcher dropdown works on mobile
- [ ] Workspace Settings page layout adapts
- [ ] Teams page grid adjusts (1 column mobile, 2-3 columns desktop)
- [ ] Modals/dialogs are readable on mobile
- [ ] No horizontal scrolling

**Actual Result**: ****\_\_\_****

**Issues**: ****\_\_\_****

---

### Test 7.2: Browser Compatibility (Optional)

**Test on**:

- [ ] Chrome/Chromium (primary)
- [ ] Firefox
- [ ] Safari (if on macOS)
- [ ] Edge

**Check**:

- [ ] All features work
- [ ] No visual glitches
- [ ] Console shows no errors

**Actual Result**: ****\_\_\_****

---

## Phase 8: Performance & Error Handling

### Test 8.1: Multiple Workspaces Performance

**Steps**:

1. [ ] Create 10+ workspaces quickly
2. [ ] Open WorkspaceSwitcher dropdown
3. [ ] Observe loading time and scrollability

**Expected**:

- [ ] Dropdown loads quickly (<500ms)
- [ ] List is scrollable if needed
- [ ] No performance degradation
- [ ] Search/filter works efficiently

**Actual Result**: ****\_\_\_****

---

### Test 8.2: Error Handling - Network Failure

**Steps**:

1. [ ] Open DevTools → Network tab
2. [ ] Throttle network to "Slow 3G"
3. [ ] Try to create a workspace

**Expected**:

- [ ] Loading state shows longer
- [ ] Eventually succeeds OR shows timeout error
- [ ] Clear error message to user
- [ ] Can retry operation

4. [ ] Set network to "Offline"
5. [ ] Try to create a workspace

**Expected**:

- [ ] Clear error message: "Network error" or similar
- [ ] UI doesn't break
- [ ] Can retry when back online

**Actual Result**: ****\_\_\_****

---

### Test 8.3: Error Handling - Validation Errors

**Steps**:

1. [ ] Try to create workspace with empty name
2. [ ] Try to create workspace with name < 2 characters
3. [ ] Try to create workspace with name > 100 characters
4. [ ] Try to create workspace with invalid slug (spaces, special chars)

**Expected**:

- [ ] Client-side validation prevents submission
- [ ] Clear error messages shown
- [ ] Form fields highlighted in red
- [ ] Helpful hints (e.g., "Name must be 2-100 characters")

**Actual Result**: ****\_\_\_****

---

### Test 8.4: Concurrent Operations

**Steps**:

1. [ ] Open the app in two different browser windows/tabs
2. [ ] Login with same account in both
3. [ ] In window 1: Create a workspace "Test Workspace A"
4. [ ] In window 2: Refresh and check WorkspaceSwitcher

**Expected**:

- [ ] Window 2 shows the new workspace (after refresh)
- [ ] No data conflicts
- [ ] No duplicate workspaces

**Actual Result**: ****\_\_\_****

---

## Phase 9: Data Persistence & Cleanup

### Test 9.1: Workspace Preference Persistence

**Steps**:

1. [ ] Select "Marketing & Communications" workspace
2. [ ] Close browser completely
3. [ ] Reopen browser and navigate to app
4. [ ] Login again

**Expected**:

- [ ] "Marketing & Communications" is still selected
- [ ] Workspace preference remembered per tenant
- [ ] No need to re-select workspace

**Actual Result**: ****\_\_\_****

---

### Test 9.2: Tenant Switching Resets Workspace

**Steps**:

1. [ ] Select workspace in Tenant A
2. [ ] Switch to Tenant B (if multi-tenant setup available)
3. [ ] Observe workspace state

**Expected**:

- [ ] Workspace selection resets for new tenant
- [ ] Shows Tenant B's workspaces (not Tenant A's)
- [ ] Proper multi-tenant isolation

**Actual Result**: ****\_\_\_****

---

## Testing Summary

### Overall Statistics

- Total Tests Planned: 39
- Tests Passed: \_\_\_ / 39
- Tests Failed: \_\_\_ / 39
- Tests Skipped: \_\_\_ / 39

### Critical Issues Found

1. ***
2. ***
3. ***

### Medium Issues Found

1. ***
2. ***
3. ***

### Minor Issues / Improvements

1. ***
2. ***
3. ***

---

## API Security Testing

### Test API.1: Unauthorized Access (Security Check)

```bash
# Try to access workspace without tenant header
curl -X GET http://localhost:3000/api/workspaces/WORKSPACE_ID \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected: 400 Bad Request - "Tenant identification required"

# Try with wrong tenant
curl -X GET http://localhost:3000/api/workspaces/WORKSPACE_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-Slug: wrong-tenant"

# Expected: 403 Forbidden OR 404 Not Found

# Try without auth token
curl -X GET http://localhost:3000/api/workspaces/WORKSPACE_ID \
  -H "X-Tenant-Slug: YOUR_TENANT_SLUG"

# Expected: 401 Unauthorized
```

---

## Common Issues Troubleshooting

### Issue: "Tenant context not found" error

**Cause**: Missing or invalid `X-Tenant-Slug` header  
**Solution**: Ensure tenant is selected and header is sent with all API requests

---

### Issue: WorkspaceSwitcher not visible

**Possible Causes**:

1. Component not imported in Layout/Header
2. User not authenticated
3. No tenant selected

**Check**:

```typescript
// In Header.tsx
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

// In JSX
<WorkspaceSwitcher />
```

---

### Issue: "Workspace not found" after creation

**Possible Causes**:

1. Workspace created in different tenant
2. Workspace ID not saved correctly
3. Cache issue

**Solution**:

1. Clear localStorage
2. Refresh page
3. Check API response for correct workspace ID

---

### Issue: Teams not filtered by workspace

**Possible Causes**:

1. Workspace context not set
2. API not receiving `X-Workspace-ID` header
3. Backend not filtering by workspaceId

**Check**:

- Open DevTools → Network
- Verify `X-Workspace-ID` header is sent
- Check API response filters by correct workspace

---

### Issue: Role restrictions not working

**Possible Causes**:

1. User role not set correctly
2. WorkspaceRoleGuard not applied to route
3. Frontend not checking role

**Check**:

- Verify user role in workspace members list
- Check backend logs for authorization errors
- Verify guards applied in route config

---

## Post-Testing Actions

### After completing all tests:

1. [ ] **Compile Test Results**: Create summary of pass/fail/skip counts
2. [ ] **Document Issues**: Create GitHub issues for any bugs found
3. [ ] **Update Test Status**: Mark which features are production-ready
4. [ ] **Share Results**: Send test summary to team
5. [ ] **Plan Fixes**: Prioritize and schedule bug fixes
6. [ ] **Re-test**: After fixes, re-run failed tests

---

## Test Environment Info

**Tester Name**: ****\_\_\_****  
**Date**: ****\_\_\_****  
**Backend Version**: ****\_\_\_****  
**Frontend Version**: ****\_\_\_****  
**Browser**: ****\_\_\_****  
**OS**: ****\_\_\_****

**Database State**:

- [ ] Fresh/clean database
- [ ] Existing test data
- [ ] Production data (DON'T test destructive operations!)

**Special Notes**: ****\_\_\_****

---

## Sign-Off

### Testing Complete

- [ ] All critical tests passed
- [ ] All blockers documented
- [ ] Ready for production (with known issues documented)
- [ ] Requires fixes before production

**Tester Signature**: ****\_\_\_****  
**Date**: ****\_\_\_****

---

**Last Updated**: January 2026  
**Version**: 1.0  
**Related Documents**:

- [Testing Overview](./README.md)
- [Frontend Testing](./FRONTEND_TESTING.md)
- [Backend Testing](./BACKEND_TESTING.md)
- [Quick Test Guide](./QUICK_TEST.md)
