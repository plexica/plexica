# Quick Test Guide (5-10 Minutes)

## Overview

This is the express version of the comprehensive testing guides. Use this when you need to quickly verify that the core Plexica features work correctly.

**Time Required**: 5-10 minutes  
**Prerequisites**: All services running, test tenant configured

---

## 0. Pre-Flight Check (30 seconds)

### Ensure all services are running:

```bash
# Backend (should return: {"status":"healthy"})
curl http://localhost:3000/health

# Frontend (should be accessible)
open http://localhost:5173

# Keycloak (should be accessible)
open http://localhost:8080
```

### Environment Setup

Ensure `apps/web/.env` contains:

```env
VITE_API_URL=http://localhost:3000
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_CLIENT_ID=plexica-web
VITE_DEFAULT_TENANT=test-tenant
VITE_BASE_DOMAIN=plexica.app
```

---

## 1. Authentication (2 minutes)

### ✅ Step 1: Login with Automatic Tenant Detection

**Important**: Plexica uses URL-based multi-tenant architecture. Each tenant has its own subdomain URL and Keycloak realm. No manual tenant selection is needed after login.

1. Navigate to `http://localhost:5173`
2. Click "Sign in with Keycloak"
3. Login with your credentials
4. ✓ Verify: Automatically redirected to dashboard (NOT to tenant selection page)
5. ✓ Verify: Tenant info loaded from URL (check console: `[AuthProvider] Step 1: Tenant from URL: test-tenant`)
6. ✓ Verify: Correct Keycloak realm used (check console: `[Keycloak] Creating config for tenant: test-tenant, realm: test-tenant-realm`)
7. ✓ Verify: Header shows tenant name

**Console Logs to Look For**:

```
[AuthProvider] Step 1: Tenant from URL: test-tenant
[Keycloak] Creating config for tenant: test-tenant, realm: test-tenant-realm
[AuthProvider] Step 6: Fetching tenant info for: test-tenant
[AuthProvider] Step 7: Tenant info received
[AuthProvider] Step 10 (FINAL): Setting isLoading to false
```

**Pass Criteria**:

- ✅ No infinite loading screen
- ✅ Tenant automatically detected from URL
- ✅ Logged in successfully
- ✅ No console errors

---

## 2. Workspace Management (3 minutes)

### ✅ Step 2: Create First Workspace

1. Look for **WorkspaceSwitcher** dropdown (top-right)
2. Click dropdown → "Create New Workspace"
3. Fill in:
   - Name: `Engineering Team`
   - Slug: `eng-team`
   - Description: `Main engineering workspace`
4. Click **Create**
5. ✓ Verify: Workspace appears in dropdown, now selected

### ✅ Step 3: Create Second Workspace

1. Repeat with: `Marketing Team`, `marketing-team`, `Marketing and communications`
2. ✓ Verify: Can switch between workspaces using dropdown
3. ✓ Verify: Workspace switcher shows correct workspace name

---

## 3. Team Management (3 minutes)

### ✅ Step 4: Create Teams in Marketing Workspace

1. Ensure "Marketing Team" workspace is selected
2. Navigate to **Teams** page (or `/team`)
3. ✓ Breadcrumb shows: Dashboard › Marketing Team › Teams
4. ✓ Workspace badge shows: "Marketing Team • 0 teams"
5. Click **Create Team**
6. Fill in:
   - Name: `Frontend Team`
   - Description: `Frontend engineers`
7. Click **Create Team**
8. ✓ Verify: Team card appears with details

### ✅ Step 5: Create Second Team

1. Repeat with: `Backend Team`, `Backend engineers`
2. ✓ Verify: Both teams visible
3. ✓ Verify: Badge updates to "2 teams"

### ✅ Step 6: Test Workspace Isolation

1. Switch to **Engineering Team** workspace
2. Go to Teams page
3. ✓ Verify: Empty (no teams) - shows proper isolation
4. Create a team: `Platform Team`, `Infrastructure and platform`
5. Switch back to **Marketing Team**
6. ✓ Verify: Only see Frontend/Backend teams (not Platform Team)

### ✅ Step 7: Test Search

1. In Marketing Team, type "Frontend" in search bar
2. ✓ Verify: Only Frontend Team shown
3. Clear search
4. ✓ Verify: Both teams visible again

---

## 4. Workspace Settings (1 minute)

### ✅ Step 8: Verify Settings Access

1. Navigate to **Workspace Settings** (or `/workspace-settings`)
2. ✓ **General tab**: See name, description, slug (read-only), delete button
3. ✓ **Members tab**: See yourself as ADMIN
4. ✓ **Teams tab**: See the 2 teams you created

---

## Quick Pass/Fail Checklist

### ✅ Pass Criteria

- [ ] Login successful with automatic tenant detection
- [ ] Created 2+ workspaces successfully
- [ ] Switched between workspaces
- [ ] Created 2+ teams per workspace
- [ ] Teams properly isolated by workspace
- [ ] Search functionality works
- [ ] Workspace settings accessible
- [ ] No console errors
- [ ] All buttons/forms work

### ❌ Failure Indicators

- Console errors during operations
- Infinite loading screen after login
- Workspace switcher not visible
- Teams showing from wrong workspace
- Unable to create workspaces/teams
- 403/404 errors when they shouldn't occur
- Data not persisting after page refresh

---

## Known Limitations (Expected Behavior)

- ✓ **Team Detail Page**: "View Team" button may show 404 (not yet implemented)
- ✓ **Rate Limiting**: Not implemented (can create unlimited workspaces)
- ✓ **Soft Delete**: Workspace deletion is permanent (no undo)
- ✓ **Invitations**: Members are added directly (no email invitation flow)
- ✓ **Tenant Switching**: To switch tenants, access a different tenant URL (e.g., tenant2.localhost:5173)
- ✓ **Single Tenant per URL**: Each URL maps to exactly one tenant (no dropdown selection)

---

## Troubleshooting

### Problem: Infinite loading screen

**Check**:

- Look for `[AuthProvider] Step 10 (FINAL)` in console
- If missing, initialization didn't complete
- Verify Keycloak is running: `docker ps | grep keycloak`
- Verify tenant exists: `curl http://localhost:3000/api/tenants/slug/test-tenant`

### Problem: WorkspaceSwitcher not visible

**Check**:

- User logged in?
- Tenant detected from URL? (check console logs)
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

### Problem: "Tenant not found"

**Solution**:

- Verify tenant exists in database:
  ```sql
  SELECT * FROM public.tenants WHERE slug = 'test-tenant';
  ```
- Check tenant status is ACTIVE
- Verify `VITE_DEFAULT_TENANT` matches database slug

---

## API Quick Checks (Optional)

```bash
# Test 1: List workspaces (should succeed with 200)
curl -X GET http://localhost:3000/api/workspaces \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-Slug: test-tenant"

# Test 2: Missing tenant header (should fail with 400)
curl -X GET http://localhost:3000/api/workspaces \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 3: No auth (should fail with 401)
curl -X GET http://localhost:3000/api/workspaces \
  -H "X-Tenant-Slug: test-tenant"
```

---

## Report Issues

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
[Paste here]

Screenshots:
[Attach here]
```

---

## Success! What's Next?

If all tests passed:

✅ **Core functionality is working correctly**

### Next Steps:

1. **Comprehensive Testing**: Run full [E2E Testing Guide](./E2E_TESTING.md) for thorough validation
2. **Frontend Testing**: See [Frontend Testing Guide](./FRONTEND_TESTING.md) for component tests
3. **Backend Testing**: See [Backend Testing Guide](./BACKEND_TESTING.md) for API tests
4. **Performance Testing**: Test with realistic data volumes
5. **Security Review**: Review RBAC and multi-tenant isolation
6. **Deployment**: Deploy to staging environment

---

## Testing Status

**Date**: ******\_\_\_******  
**Tester**: ******\_\_\_******  
**Result**:

- [ ] ✅ All tests passed - Ready for next phase
- [ ] ⚠️ Minor issues found - Document and proceed
- [ ] ❌ Critical issues found - Requires fixes

**Notes**:

---

---

---

**Quick Links**:

- Frontend: http://localhost:5173
- Backend Health: http://localhost:3000/health
- Keycloak: http://localhost:8080

**Related Documents**:

- [Testing Overview](./README.md)
- [E2E Testing Guide](./E2E_TESTING.md) - Comprehensive 39-test checklist
- [Frontend Testing](./FRONTEND_TESTING.md) - Component and auth testing
- [Backend Testing](./BACKEND_TESTING.md) - API and integration testing

---

**Last Updated**: January 2026  
**Version**: 1.0
