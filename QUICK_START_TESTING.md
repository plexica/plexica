# Quick Start - Manual Testing M2.4 Workspaces

## 🚀 Getting Started (5 minutes)

This is the express version of the full Manual Testing Guide. Use this if you want to quickly verify the workspace features work.

**Important**: Plexica uses URL-based multi-tenant architecture. Each tenant has its own subdomain URL and Keycloak realm. No manual tenant selection is needed after login.

---

## 0. Environment Setup (2 minutes)

### Create `.env` file in `apps/web/`

```env
# Backend API
VITE_API_URL=http://localhost:3000

# Keycloak
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_CLIENT_ID=plexica-web

# Tenant (for localhost development)
VITE_DEFAULT_TENANT=test-tenant
VITE_BASE_DOMAIN=plexica.app
```

### Ensure tenant exists in database

```bash
# Check tenant exists
curl http://localhost:3000/api/tenants/slug/test-tenant \
  -H "Authorization: Bearer YOUR_TOKEN"

# If not, create it (as admin or via database)
```

---

## 1. Start Servers

```bash
# Terminal 1 - Backend
cd apps/core-api
pnpm dev

# Terminal 2 - Frontend
cd apps/web
pnpm dev
```

**Health Check**:

```bash
# Should return: {"status":"healthy",...}
curl http://localhost:3000/health
```

Open browser: `http://localhost:5173`

---

## 2. Basic Flow Test (10 minutes)

### ✅ Step 1: Login & Automatic Tenant Detection

**No manual tenant selection - tenant is detected from URL**

- Navigate to `http://localhost:5173`
- Click "Sign in with Keycloak"
- Login with your credentials
- ✓ Verify: Automatically redirected to dashboard (NOT to tenant selection page)
- ✓ Verify: Tenant info loaded from URL (check console: `[AuthProvider] Step 1: Tenant from URL: test-tenant`)
- ✓ Verify: Correct Keycloak realm used (check console: `[Keycloak] Creating config for tenant: test-tenant, realm: test-tenant-realm`)
- ✓ Verify: Header shows tenant name

**Console Logs to Look For**:

```
[AuthProvider] Step 1: Tenant from URL: test-tenant
[Keycloak] Creating config for tenant: test-tenant, realm: test-tenant-realm
[AuthProvider] Step 6: Fetching tenant info for: test-tenant
[AuthProvider] Step 7: Tenant info received
```

### ✅ Step 2: Create Workspace

- Look for **WorkspaceSwitcher** dropdown (top-right)
- Click dropdown → "Create New Workspace"
- Fill in:
  - Name: `Engineering Team`
  - Slug: `eng-team`
  - Description: `Main engineering workspace`
- Click **Create**
- ✓ Verify: Workspace appears in dropdown, now selected

### ✅ Step 3: Create Second Workspace

- Repeat with: `Marketing Team`, `marketing-team`
- ✓ Verify: Can switch between workspaces using dropdown

### ✅ Step 4: Workspace Settings

- Navigate to **Workspace Settings** (or `/workspace-settings`)
- ✓ **General tab**: Edit name, see slug (read-only), delete button visible
- ✓ **Members tab**: See yourself as ADMIN, can add members
- ✓ **Teams tab**: Empty (no teams yet)

### ✅ Step 5: Create Teams

- Navigate to **Teams** page (or `/team`)
- ✓ Breadcrumb shows: Dashboard › Engineering Team › Teams
- ✓ Workspace badge shows: "Engineering Team • 0 teams"
- Click **Create Team**
- Fill in:
  - Name: `Frontend Team`
  - Description: `Frontend engineers`
- Click **Create Team**
- ✓ Verify: Team card appears with details

### ✅ Step 6: Create Second Team

- Repeat with: `Backend Team`, `Backend engineers`
- ✓ Verify: Both teams visible, count updates to "2 teams"

### ✅ Step 7: Workspace Isolation

- Switch to **Marketing Team** workspace
- Go to Teams page
- ✓ Verify: Empty (no teams) - shows proper isolation
- Create a team: `Content Team`
- Switch back to **Engineering Team**
- ✓ Verify: Only see Frontend/Backend teams (not Content Team)

### ✅ Step 8: Search Teams

- Type "Frontend" in search bar
- ✓ Verify: Only Frontend Team shown
- Clear search
- ✓ Verify: Both teams visible again

---

## 3. Quick Security Checks (5 minutes)

### ✅ RBAC Check (if you have multiple users)

**As ADMIN** (you):

- ✓ Can edit workspace
- ✓ Can add/remove members
- ✓ Can create teams
- ✓ Can delete workspace

**As VIEWER** (if available):

- ✓ Cannot edit workspace
- ✓ Cannot add members
- ✓ Cannot create teams
- ✓ Can view everything

### ✅ API Security Check

```bash
# Test 1: Missing tenant - should fail with 400
curl -X GET http://localhost:3000/api/workspaces \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 2: No auth - should fail with 401
curl -X GET http://localhost:3000/api/workspaces \
  -H "X-Tenant-Slug: test-tenant"

# Test 3: Valid request - should succeed with 200
curl -X GET http://localhost:3000/api/workspaces \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-Slug: test-tenant"
```

---

## 4. Known Limitations (Expected Behavior)

- ✓ **Team Detail Page**: "View Team" button may show 404 (not yet implemented)
- ✓ **Rate Limiting**: Not implemented (can create unlimited workspaces)
- ✓ **Soft Delete**: Workspace deletion is permanent (no undo)
- ✓ **Invitations**: Members are added directly (no email invitation flow)
- ✓ **Tenant Switching**: To switch tenants, access a different tenant URL (e.g., tenant2.localhost:5173)
- ✓ **Single Tenant per URL**: Each URL maps to exactly one tenant (no dropdown selection)

---

## 5. Test Results

### ✅ Pass Criteria

- [ ] Created 2+ workspaces successfully
- [ ] Switched between workspaces
- [ ] Created 2+ teams per workspace
- [ ] Teams properly isolated by workspace
- [ ] Workspace settings accessible
- [ ] No console errors
- [ ] All buttons/forms work
- [ ] Search functionality works

### ❌ Failure Indicators

- Console errors during operations
- Workspace switcher not visible
- Teams showing from wrong workspace
- Unable to create workspaces/teams
- 403/404 errors when they shouldn't occur
- Data not persisting after page refresh

---

## 6. Quick Troubleshooting

### Problem: WorkspaceSwitcher not visible

**Check**:

- User logged in?
- Tenant selected?
- Look in browser console for errors

### Problem: Teams not showing

**Check**:

- Correct workspace selected?
- Check Network tab - API calls succeeding?
- Try refreshing page

### Problem: "Workspace not found"

**Solution**:

- Clear localStorage (DevTools → Application → Local Storage → Clear)
- Refresh page
- Re-select workspace

---

## 7. Report Issues

If you find bugs:

1. **Screenshot**: Take screenshot of the issue
2. **Console**: Copy any errors from browser console
3. **Steps**: Document exact steps to reproduce
4. **Environment**: Note browser, OS, etc.

**Create Issue Template**:

```
Title: [Bug] Brief description

Environment:
- Browser: Chrome 120
- OS: macOS 14
- Backend: Running on localhost:3000
- Frontend: Running on localhost:5173

Steps to Reproduce:
1.
2.
3.

Expected:
Actual:

Console Errors:
```

Screenshots:
[Attach here]

```

---

## 8. Success! What's Next?

If all tests passed:

✅ **M2.4 Workspaces is production-ready** (with documented limitations)

Next steps:
1. Review full [Manual Testing Guide](./MANUAL_TESTING_GUIDE.md) for comprehensive testing
2. Implement automated tests from [Test Plan](./apps/core-api/src/__tests__/WORKSPACE_TEST_PLAN.md)
3. Deploy to staging environment
4. Run performance tests with realistic data
5. Security review by another developer

---

## Testing Status

**Date**: _______________
**Tester**: _______________
**Result**:
- [ ] ✅ All tests passed - Ready for production
- [ ] ⚠️ Minor issues found - Document and proceed
- [ ] ❌ Critical issues found - Requires fixes

**Notes**:
_______________________________________________________________
_______________________________________________________________

---

**Related Documents**:
- [Full Manual Testing Guide](./MANUAL_TESTING_GUIDE.md) - Comprehensive 39-test checklist
- [Test Plan](./apps/core-api/src/__tests__/WORKSPACE_TEST_PLAN.md) - Automated test strategy
- [Security Audit](./planning/SECURITY_AUDIT.md) - Security review findings
- [Milestone M2.4](./planning/MILESTONES.md#m24---workspaces) - Full feature documentation

**Quick Links**:
- Frontend: http://localhost:5173
- Backend Health: http://localhost:3000/health
- API Docs: http://localhost:3000/docs (if available)
```
