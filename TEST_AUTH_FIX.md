# Authentication Flow - Multi-Tenant URL-Based Test Instructions

## Current Implementation Overview

### Architecture Changes

Plexica now uses a **URL-based multi-tenant authentication system** where:

1. Each tenant has its own **Keycloak realm** (e.g., `tenant1-realm`, `tenant2-realm`)
2. Each tenant has a **unique URL subdomain** (e.g., `tenant1.plexica.app`, `tenant2.plexica.app`)
3. The tenant is **automatically detected from the URL** - no manual selection after login
4. Users authenticate directly to their tenant's realm

### Key Files Modified

#### 1. **tenant.ts** - NEW - Tenant URL Extraction

**File**: `apps/web/src/lib/tenant.ts`

**Purpose**: Extracts tenant slug from URL subdomain and generates realm name.

**Key Functions**:

```typescript
// Extracts tenant from URL
getTenantFromUrl(): string
// Example: tenant1.plexica.app → 'tenant1'
// Example: localhost → 'default' (from VITE_DEFAULT_TENANT)

// Generates Keycloak realm for tenant
getRealmForTenant(tenantSlug): string
// Example: 'tenant1' → 'tenant1-realm'
```

#### 2. **keycloak.ts** - Dynamic Realm Configuration

**File**: `apps/web/src/lib/keycloak.ts`

**Changes**:

- Removed hard-coded `master` realm
- Creates Keycloak config dynamically based on tenant from URL
- Each tenant connects to its own realm

**Key Changes**:

```typescript
// Before (REMOVED)
const keycloakConfig = {
  realm: 'master', // ❌ Fixed realm
};

// After (NEW)
function createKeycloakConfig(): KeycloakConfig {
  const tenantSlug = getTenantFromUrl(); // From URL
  const realm = getRealmForTenant(tenantSlug); // tenant1-realm
  return { url, realm, clientId };
}
```

#### 3. **AuthProvider.tsx** - Automatic Tenant Setup

**File**: `apps/web/src/components/AuthProvider.tsx`

**Changes**:

- Gets tenant slug from URL automatically
- Fetches tenant info from backend using slug
- Sets user and tenant in store simultaneously
- No manual tenant selection needed

**New Flow**:

```typescript
// Step 1: Get tenant from URL
const tenantSlug = getCurrentTenantSlug(); // 'tenant1'

// Step 2: Initialize Keycloak with tenant-specific realm
await initKeycloak(); // Connects to 'tenant1-realm'

// Step 3: Fetch tenant data from backend
const tenantInfo = await apiClient.getTenantBySlug(tenantSlug);

// Step 4: Set user and tenant together
setUser({ ...userInfo, tenantId: tenantInfo.id });
setTenant(tenantInfo);
```

#### 4. **Removed Files**

- ❌ `apps/web/src/routes/select-tenant.tsx` - No longer needed
- ❌ Tenant selection UI - Users don't choose tenant after login

## Expected Console Flow (Success Path)

When you successfully log in, you should see this sequence:

```
[AuthProvider] Starting initialization...
[AuthProvider] Step 1: Tenant from URL: tenant1
[AuthProvider] Step 2: Calling initKeycloak()...
[Keycloak] Creating config for tenant: tenant1, realm: tenant1-realm
[Keycloak] Starting initialization...
[Keycloak] Initialization complete, authenticated: true
[Keycloak] Returning initialization result: true
[AuthProvider] Step 3: initKeycloak() returned: true
[AuthProvider] Step 4: User authenticated, fetching user info...
[AuthProvider] Step 5: User info received, processing...
[AuthProvider] Step 6: Fetching tenant info for: tenant1
[AuthProvider] Step 7: Tenant info received: {id: "...", slug: "tenant1", name: "Tenant 1"}
[AuthStore] setToken called
[AuthProvider] Step 8: Token stored
[AuthStore] setUser called, setting isAuthenticated to true
[AuthProvider] Step 9: User info stored successfully
[AuthProvider] Step 10 (FINAL): Setting isLoading to false
[LoginPage] useEffect triggered {isAuthenticated: true, tenant: {slug: "tenant1"}}
[LoginPage] Authenticated, navigating to home
```

## Test Steps

### Prerequisites

Ensure all services are running:

```bash
# Backend (port 3000)
lsof -ti:3000

# Frontend (port 3001 or 5173)
lsof -ti:3001  # or 5173

# Keycloak (port 8080)
lsof -ti:8080
```

### Important: Set Up Test Tenant

Before testing, you need:

1. **A tenant in the database** with slug matching your URL subdomain
2. **A Keycloak realm** for that tenant

**For localhost development**, use the default tenant:

```bash
# Set environment variable in apps/web/.env
VITE_DEFAULT_TENANT=test-tenant
VITE_BASE_DOMAIN=plexica.app

# Optional: Override realm for testing
VITE_KEYCLOAK_REALM=test-tenant-realm
```

**For production testing**, access via subdomain:

- `tenant1.plexica.app` → requires `tenant1` in database, `tenant1-realm` in Keycloak
- `tenant2.plexica.app` → requires `tenant2` in database, `tenant2-realm` in Keycloak

### Test 1: Fresh Login Flow with URL-Based Tenant

1. **Clear browser storage**:
   - Open DevTools → Application → Storage → Clear site data
   - Or run in console: `localStorage.clear(); sessionStorage.clear();`

2. **Navigate to your tenant URL**:
   - Development: http://localhost:3001 (uses VITE_DEFAULT_TENANT)
   - Production: http://tenant1.plexica.app

3. **Check initial logs**:
   - Should see: `[AuthProvider] Step 1: Tenant from URL: test-tenant` (or your tenant)
   - Should see: `[Keycloak] Creating config for tenant: test-tenant, realm: test-tenant-realm`
   - Should see: `[AuthProvider] Step 10 (FINAL): Setting isLoading to false`
   - Should NOT see infinite "Loading..." screen

4. **Click "Sign in with Keycloak"**:
   - Redirects to Keycloak login page for your tenant's realm
   - URL should be: `http://localhost:8080/realms/test-tenant-realm/protocol/openid-connect/auth`

5. **Login with test credentials**:
   - Username: `testuser`
   - Password: `testuser`

6. **Verify redirect and tenant setup**:
   - Should redirect to http://localhost:3001 with auth code in URL
   - Should see all 10 steps in console logs
   - Should see: `[AuthProvider] Step 6: Fetching tenant info for: test-tenant`
   - Should see: `[AuthProvider] Step 7: Tenant info received`
   - Should see: `[LoginPage] useEffect triggered {isAuthenticated: true, tenant: {slug: "test-tenant"}}`
   - Should navigate to `/` (dashboard)
   - Should see workspace sidebar with workspaces

### Test 2: Returning User (With Cached Auth)

1. **Don't clear storage** (keep previous session)

2. **Navigate to http://localhost:3001** (or your tenant URL):
   - Should immediately redirect to dashboard (/)
   - Should NOT see login page
   - Should see: `[AuthStore] Rehydrated API client with token and tenant`
   - Tenant from URL should match cached tenant

3. **Verify workspaces load**:
   - Should see: `[WorkspaceContext] Fetched workspaces: X`
   - Sidebar should show all workspaces for this tenant

### Test 3: Multi-Tenant URL Isolation

1. **Access first tenant URL**:
   - Navigate to http://tenant1.localhost:3001 (or configure /etc/hosts)
   - Login and verify tenant1 data loads

2. **Access second tenant URL in new tab**:
   - Navigate to http://tenant2.localhost:3001
   - Should require separate login (different realm)
   - Should show tenant2 data only (workspace isolation)

3. **Verify tenant isolation**:
   - Data from tenant1 should NOT appear in tenant2
   - Each tenant has independent authentication session
   - Logging out from tenant1 doesn't affect tenant2

### Test 4: React StrictMode Double Render

1. **Verify StrictMode is enabled**:
   - Check `apps/web/src/main.tsx` has `<React.StrictMode>`

2. **Clear storage and login again**:
   - Should NOT see duplicate initialization logs
   - Should see: `[AuthProvider] Initialization already in progress, skipping`
   - Only ONE complete flow from Step 1 to Step 10

### Test 5: Invalid Tenant Handling

1. **Set invalid tenant in URL** (if possible with /etc/hosts):
   - Access http://nonexistent-tenant.localhost:3001

2. **Expected behavior**:
   - Login succeeds (if realm exists)
   - BUT fetching tenant fails: `[AuthProvider] Failed to fetch tenant info`
   - Auth is cleared
   - Error message shown to user: "Tenant not found"

### Test 6: HMR (Hot Module Reload) Stability

1. **With active session, edit a file**:
   - Make a comment change in `apps/web/src/routes/login.tsx`
   - Save the file

2. **Verify no logout**:
   - Should stay on current page
   - Should NOT be logged out
   - Should NOT see re-initialization

## Success Criteria

✅ **No infinite loading screen** after login  
✅ **All 10 initialization steps** complete in console  
✅ **Tenant automatically detected** from URL  
✅ **Correct Keycloak realm** used (tenant-specific)  
✅ **Tenant data fetched** from backend by slug  
✅ **LoginPage redirects to home** (not /select-tenant)  
✅ **Workspace data loads** for the tenant  
✅ **No duplicate initialization** during React double render  
✅ **HMR doesn't break** active session  
✅ **Multi-tenant isolation** works correctly

## Troubleshooting

### Issue: Still seeing infinite loading

**Check**:

- Look for "Step 10 (FINAL)" in console - if missing, initialization didn't complete
- Check for errors in console between Step 1 and Step 10
- Verify Keycloak is running: http://localhost:8080
- Verify tenant exists in database with correct slug

### Issue: "Tenant not found" error

**Check**:

- Tenant exists in database: `SELECT * FROM public.tenants WHERE slug = 'your-tenant'`
- Tenant status is ACTIVE
- VITE_DEFAULT_TENANT matches tenant slug in database
- Backend API is accessible: http://localhost:3000/health

### Issue: "Failed to fetch tenant info"

**Check**:

- Backend API endpoint works: `GET /api/tenants/slug/{slug}`
- Correct tenant slug extracted from URL (check console: "Step 1: Tenant from URL")
- Network tab shows 200 response from tenant endpoint
- Tenant is in correct schema/database

### Issue: Wrong Keycloak realm

**Check**:

- Console shows: "Creating config for tenant: X, realm: X-realm"
- Realm exists in Keycloak admin: http://localhost:8080/admin
- Client `plexica-web` exists in that realm
- Redirect URIs configured for realm

### Issue: "Keycloak not initialized" error

**Check**:

- Look for "Initialization already in progress" message
- If yes, the ref-based guard is working but promise isn't resolving
- Check network tab for Keycloak requests
- Verify Keycloak URL is correct in .env

### Issue: isAuthenticated stays false

**Check**:

- Verify you see: `[AuthStore] setUser called, setting isAuthenticated to true`
- If missing, the store update isn't happening
- Check if `setUser()` is being called in AuthProvider
- Verify user has roles in Keycloak realm

## Environment Setup

### Development Environment Variables

Create `apps/web/.env`:

```env
# Backend API
VITE_API_URL=http://localhost:3000

# Keycloak Configuration
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_CLIENT_ID=plexica-web

# Tenant Configuration for Development
VITE_DEFAULT_TENANT=test-tenant
VITE_BASE_DOMAIN=plexica.app

# Optional: Override realm (for testing specific realm)
# VITE_KEYCLOAK_REALM=test-tenant-realm
```

### Production Environment Variables

```env
# Backend API
VITE_API_URL=https://api.plexica.app

# Keycloak Configuration
VITE_KEYCLOAK_URL=https://auth.plexica.app
VITE_KEYCLOAK_CLIENT_ID=plexica-web

# Tenant Configuration
VITE_BASE_DOMAIN=plexica.app
# No VITE_DEFAULT_TENANT needed - extracted from subdomain
```

### Local Development with Subdomains (Optional)

To test multi-tenant URLs locally, add to `/etc/hosts`:

```
127.0.0.1 tenant1.localhost
127.0.0.1 tenant2.localhost
```

Then access:

- http://tenant1.localhost:3001
- http://tenant2.localhost:3001

## Next Steps After Successful Test

1. **Test multi-tenant isolation** with different tenant URLs
2. **Verify realm separation** - each tenant uses own Keycloak realm
3. **Test workspace switching** functionality
4. **Test role-based permissions** (ADMIN vs MEMBER vs VIEWER)
5. **Test workspace creation** flow
6. **Remove excessive logging** (optional - keep for now during testing)
7. **Move to next milestone** tasks

---

**Test Date**: Updated January 2026  
**Changes**: Multi-tenant URL-based authentication  
**Expected Duration**: 15-20 minutes for all tests
