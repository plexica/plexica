# Testing Keycloak Authentication - Multi-Tenant Guide

## Prerequisites

All services should be running:

- ✅ PostgreSQL (port 5432)
- ✅ Keycloak (port 8080)
- ✅ Redis (port 6379) - optional
- ✅ Backend API (port 3000)
- ✅ Frontend Web (port 5173 or 3001)

## Multi-Tenant Architecture Overview

Plexica uses **URL-based multi-tenancy**:

- Each tenant has a **unique subdomain URL**: `tenant1.plexica.app`, `tenant2.plexica.app`
- Each tenant has a **dedicated Keycloak realm**: `tenant1-realm`, `tenant2-realm`
- Tenant is **automatically detected from URL** - no manual selection after login
- Users authenticate to their tenant's specific realm

## Environment Configuration

### For Localhost Development

Create `apps/web/.env`:

```env
# Backend API
VITE_API_URL=http://localhost:3000

# Keycloak
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_CLIENT_ID=plexica-web

# Tenant - uses this when accessing localhost
VITE_DEFAULT_TENANT=test-tenant
VITE_BASE_DOMAIN=plexica.app

# Optional: Override realm for testing
# VITE_KEYCLOAK_REALM=test-tenant-realm
```

### For Subdomain Testing (Optional)

Add to `/etc/hosts` (macOS/Linux) or `C:\Windows\System32\drivers\etc\hosts` (Windows):

```
127.0.0.1 tenant1.localhost
127.0.0.1 tenant2.localhost
```

Then access:

- http://tenant1.localhost:5173 → uses `tenant1-realm`
- http://tenant2.localhost:5173 → uses `tenant2-realm`

## Test User Setup

For each tenant realm in Keycloak, create a test user:

- **Realm**: `test-tenant-realm` (or your tenant realm)
- **Username**: `testuser`
- **Password**: `testpass123`
- **Email**: `test@plexica.dev`
- **Roles**: Add realm roles as needed

## Testing Steps

### 1. Access the Application

Open your browser and navigate to:

```
http://localhost:5173
```

Or for subdomain testing:

```
http://tenant1.localhost:5173
```

### 2. Expected Authentication Flow

1. **Initial Load**: AuthProvider loading spinner while Keycloak initializes
2. **Tenant Detection**: App extracts tenant from URL (check console)
3. **Keycloak Init**: Connects to tenant-specific realm
4. **Redirect to Login**: If not authenticated, redirects to `/login`
5. **Login Page**: Click "Sign in with Keycloak" button
6. **Keycloak Login**: Redirected to Keycloak for your tenant's realm at:
   - `http://localhost:8080/realms/test-tenant-realm/protocol/openid-connect/auth`
7. **Enter Credentials**: Use test user credentials for that realm
8. **Redirect Back**: After successful login, redirected to your tenant URL
9. **Tenant Data Fetch**: App automatically fetches tenant info from backend
10. **Dashboard**: See authenticated home page with user info and tenant context

**Key Difference from Old Flow**: No manual tenant selection step - tenant is automatic from URL

### 3. Console Logs to Verify

Open browser DevTools (F12) and check Console for this sequence:

```
[AuthProvider] Starting initialization...
[AuthProvider] Step 1: Tenant from URL: test-tenant
[AuthProvider] Step 2: Calling initKeycloak()...
[Keycloak] Creating config for tenant: test-tenant, realm: test-tenant-realm
[Keycloak] Starting initialization...
[Keycloak] Initialization complete, authenticated: true
[AuthProvider] Step 3: initKeycloak() returned: true
[AuthProvider] Step 4: User authenticated, fetching user info...
[AuthProvider] Step 5: User info received, processing...
[AuthProvider] Step 6: Fetching tenant info for: test-tenant
[AuthProvider] Step 7: Tenant info received: {id: "...", slug: "test-tenant", ...}
[AuthStore] setToken called
[AuthProvider] Step 8: Token stored
[AuthStore] setUser called, setting isAuthenticated to true
[AuthProvider] Step 9: User info stored successfully
[AuthProvider] Step 10 (FINAL): Setting isLoading to false
[LoginPage] Authenticated, navigating to home
```

### 4. What You Should See

On the authenticated home page:

- Header with "Welcome, [User Name]" and Logout button
- **Tenant name displayed** in header or breadcrumb
- User information card showing:
  - User ID
  - Email
  - Name
  - Roles
  - **Tenant ID and Slug**
- WorkspaceSwitcher showing workspaces for this tenant
- Next steps section

### 5. Testing Multi-Tenant Isolation (Optional)

**Only if you have subdomain setup with multiple tenants**

1. Open browser to `http://tenant1.localhost:5173`
2. Login with tenant1 credentials
3. Note the workspaces and data visible
4. Open **new incognito window**
5. Navigate to `http://tenant2.localhost:5173`
6. Login with tenant2 credentials (or same user if they exist in both realms)
7. Verify tenant2 shows different data
8. Verify tenant1 data NOT accessible from tenant2 URL

### 6. Testing Logout

1. Click the "Logout" button in the header
2. You'll be logged out from Keycloak
3. You'll be redirected back to the login page
4. Try accessing protected route (e.g., `/workspace-settings`)
5. Should redirect to `/login`

### 7. Testing Protected Routes

1. Clear browser storage (logout fully)
2. Try accessing `http://localhost:5173` directly (or workspace URL)
3. Should be redirected to `/login`
4. After login, should be back on the originally requested page (or dashboard)

## Troubleshooting

### Browser Console Errors

Open browser DevTools (F12) and check the Console tab for any errors.

Look for:

- `[AuthProvider] Step 1: Tenant from URL: ...` - Confirms tenant detection
- `[Keycloak] Creating config for tenant: ..., realm: ...-realm` - Confirms realm selection
- `[AuthProvider] Step 7: Tenant info received` - Confirms backend tenant fetch
- `[AuthProvider] Step 10 (FINAL): Setting isLoading to false` - Confirms init complete

### Network Tab

Check the Network tab for:

- **Keycloak auth request**: `http://localhost:8080/realms/YOUR-TENANT-realm/protocol/openid-connect/auth`
- **Token exchange**: After redirect with `code=` param
- **User info**: `http://localhost:8080/realms/YOUR-TENANT-realm/protocol/openid-connect/userinfo`
- **Tenant fetch**: `http://localhost:3000/api/tenants/slug/YOUR-TENANT`

### Common Issues

**Issue**: "Failed to initialize Keycloak"

- Check if Keycloak is running: `docker ps | grep keycloak`
- Check Keycloak logs: `docker logs plexica-keycloak`
- Verify `VITE_KEYCLOAK_URL` in `.env`

**Issue**: "Client not found"

- Verify client exists in Keycloak admin panel: `http://localhost:8080/admin`
- Login with admin/admin
- Check Clients section for "plexica-web" **in your tenant's realm**
- Verify redirect URIs include: `http://localhost:5173/*`

**Issue**: "Invalid redirect URI"

- Ensure client has redirect URI: `http://localhost:5173/*`
- Check Web Origins: `http://localhost:5173`
- Verify client is in correct realm (not master)

**Issue**: "Tenant not found" after login

- Check tenant exists in database: `SELECT * FROM public.tenants WHERE slug = 'test-tenant'`
- Verify `VITE_DEFAULT_TENANT` matches database slug
- Check backend API: `curl http://localhost:3000/api/tenants/slug/test-tenant`
- Ensure tenant status is ACTIVE

**Issue**: Wrong realm used

- Check console: `[Keycloak] Creating config for tenant: X, realm: X-realm`
- Verify realm exists in Keycloak
- Check `VITE_KEYCLOAK_REALM` override (remove if testing auto-detection)
- Verify URL subdomain matches expected tenant

**Issue**: "Cannot read property 'tenant' of null"

- Backend didn't return tenant data
- Check Network tab for `/api/tenants/slug/...` response
- Verify backend is running and accessible
- Check backend logs for errors

## Verification Checklist

- [ ] Dev server running on port 5173 (or 3001)
- [ ] Keycloak running on port 8080
- [ ] Backend API running on port 3000
- [ ] Tenant exists in database with correct slug
- [ ] Keycloak realm exists for tenant (e.g., `test-tenant-realm`)
- [ ] Client `plexica-web` configured in tenant's realm
- [ ] Test user exists in tenant's realm
- [ ] Environment variables set correctly in `.env`
- [ ] Can access login page
- [ ] Can redirect to correct Keycloak realm
- [ ] Can login with test user
- [ ] Tenant automatically detected from URL
- [ ] Tenant data fetched from backend
- [ ] Can see user info and tenant info on home page
- [ ] Can logout successfully
- [ ] Protected routes redirect to login when not authenticated
- [ ] Multi-tenant isolation works (if testing subdomains)

## Next Steps After Successful Auth

Once authentication is working:

1. ✅ Tenant detection from URL - COMPLETE
2. ✅ Tenant-specific Keycloak realm - COMPLETE
3. ✅ Automatic tenant loading - COMPLETE
4. Fetch and display workspace data for tenant
5. Implement workspace switching within tenant
6. Add tenant context to all API requests (X-Tenant-Slug header)
7. Implement dashboard layout with tenant branding
8. Add plugin management UI (tenant-specific)

---

**Created**: January 13, 2026  
**Updated**: January 2026 - Multi-tenant URL-based architecture  
**Status**: Multi-tenant authentication complete, ready for testing
