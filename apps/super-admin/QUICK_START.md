# 🚀 Quick Start - Super Admin App

Get the Super Admin app running in 5 minutes!

## Prerequisites

- ✅ Docker installed and running
- ✅ Node.js 20.0.0+ and pnpm 8.0.0+
- ✅ Backend API running (optional for authentication testing)

## Step 1: Start Infrastructure

```bash
# From project root
pnpm infra:start

# Wait for Keycloak to be ready (~30-60 seconds)
# Check: curl http://localhost:8080
```

## Step 2: Import Keycloak Realm

### Option A: Admin Console (Easiest)

1. Open: **http://localhost:8080**
2. Click **"Administration Console"**
3. Login: `admin` / `admin`
4. Click dropdown in top-left (shows "master")
5. Click **"Create Realm"**
6. Click **"Browse..."** button
7. Select: `apps/super-admin/keycloak-realm-plexica-admin.json`
8. Click **"Create"**

✅ Done! Realm `plexica-admin` is ready with:

- Client: `super-admin-app`
- Users: `admin/admin` (super-admin role), `viewer/viewer` (viewer role)

### Option B: Quick Verification

After import, verify in Keycloak Admin Console:

1. **Switch to realm**: Dropdown top-left → "plexica-admin"
2. **Check client**: Clients → Should see `super-admin-app`
3. **Check users**: Users → Should see `admin` and `viewer`
4. **Check roles**: Realm roles → Should see `super-admin` and `viewer`

## Step 3: Configure Environment

```bash
cd apps/super-admin

# Copy environment template
cp .env.example .env

# .env should contain:
# VITE_KEYCLOAK_URL=http://localhost:8080
# VITE_KEYCLOAK_REALM=plexica-admin
# VITE_KEYCLOAK_CLIENT_ID=super-admin-app
# VITE_API_URL=http://localhost:3000
```

## Step 4: Start the App

```bash
# Install dependencies (if not done)
pnpm install

# Start dev server
pnpm dev

# Or from root:
pnpm dev --filter @plexica/super-admin
```

## Step 5: Login

1. Open: **http://localhost:3002**
2. Click **"Login with Keycloak"**
3. Enter:
   - Username: `admin`
   - Password: `admin`
4. After login → Redirected to `/tenants`

✅ **Success!** You're logged in as a super admin.

## What's Next?

### Test the App

- 🏢 **Tenants**: View and manage all tenants
- 🧩 **Plugins**: Browse plugin marketplace
- 👥 **Users**: Manage users across tenants
- 📊 **Analytics**: View platform analytics
- 🌓 **Theme**: Toggle dark/light mode (top-right)

### Verify Authentication

Open browser DevTools → Application → Session Storage → Check:

- ✅ `kc-token`: Keycloak access token
- ✅ `kc-refreshToken`: Refresh token

### Check API Headers (CRITICAL)

Open DevTools → Network tab → Make any API call → Check headers:

- ✅ `Authorization: Bearer <token>` (should be present)
- ❌ `X-Tenant-Slug` (should NOT be present)
- ❌ `X-Workspace-ID` (should NOT be present)

### Test Protected Routes

1. Logout (top-right menu)
2. Try visiting: http://localhost:3002/tenants
3. Should redirect to `/login` ✅

## Common Issues

### "Keycloak is not initialized"

**Solution**: Check if Keycloak is running:

```bash
curl http://localhost:8080
docker ps | grep keycloak
```

### "Invalid redirect URI" after login

**Solution**: In Keycloak Admin Console:

1. Clients → `super-admin-app` → Settings
2. Valid redirect URIs: `http://localhost:3002/*`
3. Web origins: `http://localhost:3002`

### Login works but shows "Access denied"

**Solution**: User missing `super-admin` role:

1. Users → `admin` → Role mapping
2. Assign role → Select `super-admin` → Assign

### App doesn't start

**Solution**:

```bash
# Clean and reinstall
pnpm clean
pnpm install

# Check Node version
node -v  # Should be >= 20.0.0
```

## Full Stack Testing (Optional)

To test with real backend API:

```bash
# Terminal 1: Infrastructure
pnpm infra:start

# Terminal 2: Backend API
pnpm dev --filter @plexica/core-api

# Terminal 3: Super Admin
cd apps/super-admin && pnpm dev

# Terminal 4: Web App (optional)
cd apps/web && pnpm dev
```

**Ports**:

- 🔐 Keycloak: http://localhost:8080
- 🔌 Backend API: http://localhost:3000
- 🌐 Web App: http://localhost:3001
- 👑 Super Admin: http://localhost:3002

## Credentials Summary

| Service              | URL                   | Username | Password |
| -------------------- | --------------------- | -------- | -------- |
| Keycloak Admin       | http://localhost:8080 | admin    | admin    |
| Super Admin App      | http://localhost:3002 | admin    | admin    |
| Super Admin (viewer) | http://localhost:3002 | viewer   | viewer   |

⚠️ **Change these in production!**

## Next Steps

1. ✅ Complete the [Testing Checklist](./PROGRESS.md#82-testing-checklist)
2. ✅ Read [Architecture Documentation](./README.md)
3. ✅ Review [Keycloak Setup Guide](./KEYCLOAK_SETUP.md)

---

**Need help?** Check [README.md](./README.md) → Troubleshooting section

**Ready to develop?** See [PROGRESS.md](./PROGRESS.md) for migration status
