# Plexica Setup Scripts

This directory contains automated setup scripts for configuring your Plexica development environment.

## 🚀 Quick Start

Run the complete setup with a single command:

```bash
./scripts/setup-dev-environment.sh
```

This will:

1. Create database tenants and schemas
2. Configure Keycloak realms and clients
3. Create test users
4. Prepare everything for multi-tenant development

## 📜 Available Scripts

### `setup-dev-environment.sh` (Recommended)

**Master script that runs all setup tasks.**

```bash
./scripts/setup-dev-environment.sh
```

**Prerequisites:**

- PostgreSQL running on port 5432
- Keycloak running on port 8080
- `jq` installed (for JSON parsing)
- `psql` installed (PostgreSQL client)

**What it does:**

- Creates 4 tenants: `default`, `test-tenant`, `tenant1`, `tenant2`
- Creates Keycloak realms for each tenant
- Configures `plexica-web` client in each realm
- Creates test user in each realm
- Sets up database schemas for each tenant

---

### `setup-database-tenants.sh`

**Creates tenants and schemas in PostgreSQL database.**

```bash
./scripts/setup-database-tenants.sh
```

**Environment Variables:**

```bash
DB_HOST=localhost       # Database host
DB_PORT=5432           # Database port
DB_NAME=plexica        # Database name
DB_USER=plexica        # Database user
DB_PASS=plexica123     # Database password
```

**What it creates:**

- Tenant records in `public.tenants` table
- Tenant-specific schemas (e.g., `tenant_default`, `tenant_test_tenant`)
- Tables: `workspaces`, `workspace_members`, `teams`
- Indexes for performance

---

### `setup-keycloak.sh`

**Configures Keycloak realms, clients, and users.**

```bash
./scripts/setup-keycloak.sh
```

**Environment Variables:**

```bash
KEYCLOAK_URL=http://localhost:8080    # Keycloak URL
KEYCLOAK_ADMIN_USER=admin             # Admin username
KEYCLOAK_ADMIN_PASS=admin             # Admin password
CLIENT_ID=plexica-web                 # Client ID to create
FRONTEND_URL=http://localhost:3002    # Frontend URL
```

**What it configures:**

- Creates realms: `default-realm`, `test-tenant-realm`, `tenant1-realm`, `tenant2-realm`
- Configures OIDC client `plexica-web` in each realm
- Sets redirect URIs for localhost ports (3001, 3002, 5173)
- Creates test user: `testuser` / `testpass123`
- Enables PKCE for security

---

## 🔧 Manual Setup

If you prefer to run scripts individually:

### 1. Database Setup First

```bash
./scripts/setup-database-tenants.sh
```

### 2. Then Keycloak Setup

```bash
./scripts/setup-keycloak.sh
```

## 🧪 Testing

After running the setup:

### Start Backend

```bash
cd apps/core-api
pnpm dev
```

### Start Frontend

```bash
cd apps/web
pnpm dev
```

### Access Application

Navigate to: http://localhost:3002 (or 5173/3001)

### Login

- **Username**: `testuser`
- **Password**: `testpass123`

### Test Different Tenants

**Option 1: Localhost (uses default tenant)**

```
http://localhost:3002
```

**Option 2: Subdomain (requires /etc/hosts)**
Add to `/etc/hosts`:

```
127.0.0.1 tenant1.localhost
127.0.0.1 tenant2.localhost
```

Then access:

```
http://tenant1.localhost:3002
http://tenant2.localhost:3002
```

## 🔍 Verification

### Check Database Tenants

```bash
psql -h localhost -U plexica -d plexica -c "SELECT slug, name, status FROM public.tenants;"
```

### Check Keycloak Realms

Visit: http://localhost:8080/admin

- Login: admin / admin
- Check "Realms" dropdown in top-left

### Check Client Configuration

1. Go to Keycloak Admin → Select realm (e.g., `default-realm`)
2. Navigate to Clients → `plexica-web`
3. Verify redirect URIs include `http://localhost:3002/*`

## 🐛 Troubleshooting

### Script Fails: "Cannot connect to database"

**Check PostgreSQL is running:**

```bash
docker ps | grep postgres
# or
lsof -ti:5432
```

**Test connection manually:**

```bash
psql -h localhost -U plexica -d plexica -c '\q'
```

---

### Script Fails: "Keycloak is not running"

**Check Keycloak is running:**

```bash
docker ps | grep keycloak
# or
lsof -ti:8080
```

**Test Keycloak:**

```bash
curl http://localhost:8080/health
```

---

### Script Fails: "jq: command not found"

**Install jq:**

- macOS: `brew install jq`
- Ubuntu: `sudo apt-get install jq`
- Windows (WSL): `sudo apt-get install jq`

---

### Tenant Already Exists Error

This is normal if you run the script multiple times. The script will skip existing tenants and continue.

---

### Wrong Keycloak Realm Used

Check `apps/web/.env`:

```env
VITE_DEFAULT_TENANT=default
# Remove or comment out VITE_KEYCLOAK_REALM if present
# VITE_KEYCLOAK_REALM=...
```

The app should automatically use `{tenant}-realm` pattern.

---

## 🔐 Security Notes

**For Development Only:**

- Test credentials are intentionally simple
- PKCE is enabled for client security
- SSL is disabled (`sslRequired: none`)

**Before Production:**

- Change all default passwords
- Enable SSL/TLS (`sslRequired: external`)
- Configure proper SMTP for email verification
- Set up rate limiting
- Review and harden Keycloak settings

---

## 📝 Customization

### Add More Tenants

Edit the `TENANTS` or `REALMS` array in the scripts:

**setup-database-tenants.sh:**

```bash
TENANTS=(
    "default:Default Organization:default-realm"
    "your-tenant:Your Company:your-tenant-realm"
)
```

**setup-keycloak.sh:**

```bash
REALMS=("default" "your-tenant")
```

### Change Test User Credentials

Edit in `setup-keycloak.sh`:

```bash
local username="your-username"
local password="your-password"
local email="your-email@example.com"
```

### Configure Different Ports

Set environment variables before running:

```bash
FRONTEND_URL=http://localhost:5000 ./scripts/setup-keycloak.sh
```

---

## 📚 Related Documentation

- [Authentication Testing Guide](../apps/web/TESTING_AUTH.md)
- [Manual Testing Guide](../MANUAL_TESTING_GUIDE.md)
- [Quick Start Testing](../QUICK_START_TESTING.md)

---

## 🆘 Need Help?

If you encounter issues not covered here:

1. Check the script output for specific error messages
2. Verify all prerequisites are installed
3. Ensure PostgreSQL and Keycloak are running
4. Check environment variables are set correctly
5. Try running scripts individually to isolate issues

---

**Last Updated**: January 2026  
**Version**: 1.0.0
