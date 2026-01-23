# Keycloak Realm Configuration - Plexica Admin

This file contains the complete realm configuration for the Plexica Super Admin application.

## What's Included

### Realm: `plexica-admin`

- **Display Name**: Plexica Admin
- **Enabled**: Yes
- **Security**: Brute force protection enabled

### Client: `super-admin-app`

- **Type**: Public (no client secret required)
- **Protocol**: OpenID Connect
- **Root URL**: http://localhost:3002
- **Redirect URIs**: http://localhost:3002/\*
- **Web Origins**: http://localhost:3002
- **Standard Flow**: Enabled (Authorization Code)
- **Direct Access Grants**: Enabled
- **Post Logout Redirect URIs**: http://localhost:3002/\*

### Roles

1. **super-admin**: Platform administrator with full access
2. **viewer**: Read-only access to platform administration

### Users (Pre-configured)

| Username | Password | Role        | Email                |
| -------- | -------- | ----------- | -------------------- |
| `admin`  | `admin`  | super-admin | admin@plexica.local  |
| `viewer` | `viewer` | viewer      | viewer@plexica.local |

**⚠️ IMPORTANT**: Change these passwords in production!

### Client Scopes

- **roles**: Includes realm roles in tokens
- **email**: User email information
- **profile**: User profile (username, first name, last name)
- **web-origins**: Allowed web origins
- **acr**: Authentication context class reference

### Security Settings

- Access Token Lifespan: 5 minutes
- SSO Session Idle: 30 minutes
- SSO Session Max: 10 hours
- Brute Force Protection: Enabled (5 failed attempts locks for 15 minutes)
- Remember Me: Enabled
- Reset Password: Enabled

## How to Import

### Option 1: Keycloak Admin Console (Recommended)

1. **Start Keycloak**:

   ```bash
   pnpm infra:start
   # Or: docker-compose up -d keycloak postgres
   ```

2. **Access Admin Console**:
   - URL: http://localhost:8080
   - Click "Administration Console"
   - Login: `admin` / `admin`

3. **Import Realm**:
   - Click the dropdown in the top-left corner (shows "master")
   - Click **"Create Realm"**
   - Click **"Browse..."** button
   - Select: `keycloak-realm-plexica-admin.json`
   - Click **"Create"**

4. **Verify Import**:
   - Switch to realm "plexica-admin" (dropdown top-left)
   - Check **Clients** → Should see `super-admin-app`
   - Check **Realm roles** → Should see `super-admin` and `viewer`
   - Check **Users** → Should see `admin` and `viewer`

### Option 2: Docker Volume Mount (Auto-import on startup)

1. **Copy the JSON file to Keycloak import directory**:

   ```bash
   # If using docker-compose with volume mount
   cp keycloak-realm-plexica-admin.json /path/to/keycloak/import/
   ```

2. **Restart Keycloak** with import flag:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

### Option 3: Keycloak CLI (Advanced)

```bash
# Using kcadm.sh (Keycloak Admin CLI)
docker exec -it keycloak /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user admin \
  --password admin

docker exec -it keycloak /opt/keycloak/bin/kcadm.sh create realms \
  -f /tmp/keycloak-realm-plexica-admin.json
```

## Post-Import Configuration

### For Development (Localhost)

No additional configuration needed! The realm is pre-configured for `http://localhost:3002`.

### For Production/Staging

After import, update the following in Keycloak Admin Console:

1. **Update Client URLs**:
   - Go to: **Clients** → `super-admin-app`
   - Update **Root URL**: `https://admin.yourdomain.com`
   - Update **Redirect URIs**: `https://admin.yourdomain.com/*`
   - Update **Web Origins**: `https://admin.yourdomain.com`
   - Update **Post Logout Redirect URIs**: `https://admin.yourdomain.com/*`

2. **Change User Passwords**:
   - Go to: **Users** → Select user
   - Go to: **Credentials** tab
   - Click **Reset password**
   - Set strong password
   - **Temporary**: OFF (unless you want user to change on first login)

3. **Enable Email (Optional)**:
   - Go to: **Realm settings** → **Email**
   - Configure SMTP server for password reset emails

4. **Enable 2FA/MFA (Recommended for Production)**:
   - Go to: **Authentication** → **Required Actions**
   - Enable **Configure OTP**
   - For users: **Users** → Select user → **Required User Actions** → Add "Configure OTP"

## Testing the Configuration

1. **Start Super Admin App**:

   ```bash
   cd apps/super-admin
   pnpm dev
   ```

2. **Open Browser**: http://localhost:3002

3. **You should see**:
   - Redirect to `/login` page
   - "Login with Keycloak" button

4. **Click Login**:
   - Redirects to Keycloak login page
   - Realm should show "Plexica Admin"

5. **Enter Credentials**:
   - Username: `admin`
   - Password: `admin`

6. **After Login**:
   - Should redirect back to `http://localhost:3002/tenants`
   - You should be authenticated
   - Token should be in sessionStorage

## Verifying Realm Configuration

### Check Realm Settings

```bash
# Using Keycloak API
curl -X GET "http://localhost:8080/admin/realms/plexica-admin" \
  -H "Authorization: Bearer <admin-token>"
```

### Check Client Configuration

```bash
curl -X GET "http://localhost:8080/admin/realms/plexica-admin/clients" \
  -H "Authorization: Bearer <admin-token>"
```

### Check Users

```bash
curl -X GET "http://localhost:8080/admin/realms/plexica-admin/users" \
  -H "Authorization: Bearer <admin-token>"
```

## Troubleshooting

### Issue: "Realm not found"

**Solution**: Make sure you're accessing the correct realm URL:

```
http://localhost:8080/realms/plexica-admin/.well-known/openid-configuration
```

### Issue: "Invalid redirect URI"

**Symptoms**: After login, you get an error about invalid redirect
**Solution**:

1. Check **Clients** → `super-admin-app` → **Valid redirect URIs**
2. Must include: `http://localhost:3002/*`

### Issue: "User not authenticated" or "Access denied"

**Solution**:

1. Verify user has `super-admin` role:
   - **Users** → Select user → **Role mapping**
   - Should show `super-admin` in "Assigned roles"

### Issue: "CORS error" in browser console

**Solution**:

1. Check **Clients** → `super-admin-app` → **Web origins**
2. Must include: `http://localhost:3002`

### Issue: "Client not found"

**Solution**: The import may have failed. Try:

1. Delete the realm (if partially created)
2. Re-import the JSON file
3. Check Keycloak logs: `docker logs keycloak`

## Realm Backup

To export the current realm configuration:

1. **Via Admin Console**:
   - Go to **Realm settings** → **Action** dropdown (top right)
   - Click **Partial export**
   - Select what to export (users, clients, roles, etc.)
   - Click **Export**

2. **Via CLI**:
   ```bash
   docker exec keycloak /opt/keycloak/bin/kc.sh export \
     --realm plexica-admin \
     --file /tmp/plexica-admin-backup.json
   ```

## Security Recommendations for Production

1. ✅ Change default passwords (`admin`, `viewer`)
2. ✅ Enable SSL/TLS (set `sslRequired` to `all`)
3. ✅ Enable email verification
4. ✅ Configure SMTP for password reset
5. ✅ Enable OTP/2FA for all admin users
6. ✅ Review and adjust session timeouts
7. ✅ Enable audit logging
8. ✅ Restrict admin console access (IP whitelist)
9. ✅ Regular password rotation policy
10. ✅ Monitor failed login attempts

## File Information

- **File**: `keycloak-realm-plexica-admin.json`
- **Keycloak Version**: 26.0.0+
- **Created**: January 23, 2026
- **Purpose**: Super Admin application authentication
- **Environment**: Development (localhost:3002)

---

**Ready to use!** Just import this file and you're set up for development. 🚀

For production deployment, remember to update URLs and passwords!
