# Plexica - Quick Start Guide

Get your Plexica development environment up and running in **5 minutes**!

---

## Prerequisites

Before you begin, ensure you have:

- **Docker Desktop** (or Docker Engine + Docker Compose)
- **Node.js** >= 20.0.0
- **pnpm** >= 8.0.0
- At least **4GB RAM** available for Docker
- Ports available: 3000, 3001, 3002, 5432, 6379, 8080, 9000, 9092

---

## Quick Start (One Command)

```bash
# Clone the repository
git clone <repository-url>
cd plexica

# Install dependencies
pnpm install

# Initialize environment (automatic setup)
pnpm run init
```

**That's it!** The `pnpm run init` command will:

- ✅ Start Docker infrastructure (Postgres, Keycloak, Redis, MinIO, Redpanda)
- ✅ Create database schema (13 tables)
- ✅ Seed sample data (3 tenants, 3 plugins, users)
- ✅ Create Keycloak realms (5 realms)
- ✅ Create sample users (7 users with credentials)
- ✅ Configure all services

**Time**: ~2-3 minutes

---

## Start Development Servers

After initialization completes, start the applications:

### Option A: Start All (Recommended)

```bash
# Terminal 1: Core API (Backend)
cd apps/core-api
pnpm dev

# Terminal 2: Tenant App (Frontend)
cd apps/web
pnpm dev

# Terminal 3: Super Admin App (Frontend)
cd apps/super-admin
pnpm dev
```

### Option B: Start Only What You Need

**Backend Only**:

```bash
cd apps/core-api && pnpm dev
```

**Tenant App Only** (requires backend):

```bash
cd apps/web && pnpm dev
```

**Super Admin Only** (requires backend):

```bash
cd apps/super-admin && pnpm dev
```

---

## Access Your Applications

### 🏢 Tenant App (Multi-Tenant SaaS)

- **URL**: http://localhost:3001
- **Login**: Use tenant-specific credentials

**Example for Acme Corp**:

- Email: `admin@acme-corp.com`
- Password: `Admin123!`

**Other tenants**:

- Globex Inc: `admin@globex-inc.com` / `Admin123!`
- Demo Company: `admin@demo-company.com` / `Admin123!`

### 👑 Super Admin App (Platform Management)

- **URL**: http://localhost:3002
- **Login**: `admin@plexica.com` / `admin` (mock auth for dev)

### 🔧 Backend API

- **URL**: http://localhost:3000
- **Health Check**: http://localhost:3000/health
- **API Docs**: http://localhost:3000/docs (if configured)

---

## Sample Data Available

After initialization, you'll have:

### Tenants (3)

| Slug           | Name              | Status |
| -------------- | ----------------- | ------ |
| `acme-corp`    | Acme Corporation  | ACTIVE |
| `globex-inc`   | Globex Industries | ACTIVE |
| `demo-company` | Demo Company      | ACTIVE |

### Plugins (3)

| ID                 | Name             | Description                      |
| ------------------ | ---------------- | -------------------------------- |
| `crm`              | CRM              | Customer Relationship Management |
| `analytics`        | Analytics        | Advanced analytics and reporting |
| `sample-analytics` | Sample Analytics | Sample plugin with events        |

### Users (per tenant)

| Username | Password    | Email Pattern        | Role  |
| -------- | ----------- | -------------------- | ----- |
| `admin`  | `Admin123!` | `admin@{tenant}.com` | admin |
| `user`   | `User123!`  | `user@{tenant}.com`  | user  |

**Example**:

- Tenant `acme-corp` has:
  - `admin@acme-corp.com` / `Admin123!`
  - `user@acme-corp.com` / `User123!`

### Keycloak Realms (5)

- `master` - Keycloak default realm
- `plexica-admin` - Super admin realm
- `acme-corp` - Acme Corporation tenant realm
- `globex-inc` - Globex Industries tenant realm
- `demo-company` - Demo Company tenant realm

---

## Admin Interfaces

### Keycloak Admin Console

- **URL**: http://localhost:8080
- **Login**: `admin` / `admin`
- **Use for**: Manage authentication, users, realms

### PostgreSQL (PgAdmin)

- **URL**: http://localhost:5050
- **Login**: `admin@plexica.io` / `admin`
- **Use for**: Database administration

### Redis Commander

- **URL**: http://localhost:8081
- **Use for**: View Redis cache and sessions

### MinIO Console

- **URL**: http://localhost:9001
- **Login**: `minioadmin` / `minioadmin`
- **Use for**: Manage file storage buckets

### Redpanda Console (Kafka)

- **URL**: http://localhost:8082
- **Use for**: View event streams and topics

---

## Common Tasks

### Create a New Tenant

**Via Super Admin UI**:

1. Open http://localhost:3002
2. Login as super admin
3. Go to "Tenants" tab
4. Click "Add Tenant"
5. Enter slug and name
6. Click "Create"

**Via API**:

```bash
curl -X POST http://localhost:3000/api/admin/tenants \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "slug": "new-company",
    "name": "New Company Inc"
  }'
```

### Install a Plugin for a Tenant

**Via Tenant App UI**:

1. Login to tenant app (http://localhost:3001)
2. Go to "Plugins" page
3. Find available plugin
4. Click "Install"

**Via API**:

```bash
curl -X POST http://localhost:3000/api/plugins/install \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-Tenant-Slug: acme-corp" \
  -d '{
    "pluginId": "crm",
    "enabled": true
  }'
```

### View Database

**Using PgAdmin**:

1. Open http://localhost:5050
2. Login: `admin@plexica.io` / `admin`
3. Navigate to: Servers → plexica → Databases → plexica → Schemas → core

**Using psql**:

```bash
docker exec -it plexica-postgres psql -U plexica -d plexica

# List tables in core schema
\dt core.*

# View tenants
SELECT slug, name, status FROM core.tenants;

# View plugins
SELECT id, name, version FROM core.plugins;

# Exit
\q
```

---

## Troubleshooting

### Ports Already in Use

Check which ports are in use:

```bash
# macOS/Linux
lsof -i :3000  # or :3001, :5432, etc.

# Windows
netstat -ano | findstr :3000
```

Stop the process using the port or change the port in `.env` file.

### Docker Containers Not Starting

```bash
# Check container status
docker ps -a

# View logs for a specific container
docker logs plexica-postgres
docker logs plexica-keycloak

# Restart infrastructure
pnpm run infra:restart
```

### "Database schema is out of sync"

```bash
# Re-push schema to database
cd packages/database
pnpm db:push --url="postgresql://plexica:plexica_password@localhost:5432/plexica?schema=core"
pnpm prisma generate
```

### Keycloak Realm Not Found

```bash
# Re-run initialization
pnpm run init
```

The script is idempotent and will skip existing resources.

### "node_modules missing" Error

```bash
# Install dependencies
pnpm install

# Re-run initialization
pnpm run init
```

### Frontend Won't Start

```bash
# Check if backend is running
curl http://localhost:3000/health

# Clear cache and reinstall
cd apps/web  # or apps/super-admin
rm -rf node_modules .vite
pnpm install
pnpm dev
```

---

## Reset Everything (Fresh Start)

If you need to start completely fresh:

```bash
# 1. Stop all services
pnpm run infra:stop

# 2. Remove all data (WARNING: Deletes everything!)
pnpm run infra:clean

# 3. Start infrastructure
pnpm run infra:start

# 4. Wait for services to be ready (30 seconds)
sleep 30

# 5. Re-initialize
pnpm run init

# 6. Start applications
cd apps/core-api && pnpm dev
```

---

## Next Steps

Now that your environment is set up:

### 1. Explore the Tenant App

- Login as `admin@acme-corp.com` / `Admin123!`
- View the dashboard
- Try installing/uninstalling plugins
- Explore settings and team management

### 2. Explore the Super Admin App

- Login as `admin@plexica.com` / `admin`
- View all tenants
- Create a new tenant
- Suspend/activate tenants
- View platform analytics

### 3. Explore the API

```bash
# Health check
curl http://localhost:3000/health

# Get all tenants (requires auth)
curl http://localhost:3000/api/admin/tenants \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get plugins for a tenant
curl http://localhost:3000/api/plugins \
  -H "X-Tenant-Slug: acme-corp"
```

### 4. Read the Documentation

- **Architecture**: See `specs/TECHNICAL_SPECIFICATIONS.md`
- **Features**: See `specs/FUNCTIONAL_SPECIFICATIONS.md`
- **Project Structure**: See `specs/PROJECT_STRUCTURE.md`
- **Roadmap**: See `planning/ROADMAP.md`
- **API Reference**: See `docs/api/` (if available)

### 5. Start Developing

**Add a New Feature**:

1. Create a new branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Test locally
4. Commit: `git commit -m "feat: add my feature"`
5. Push: `git push origin feature/my-feature`

**Create a Plugin**:

1. See plugin development guide: `docs/PLUGIN_DEVELOPMENT.md`
2. Use plugin templates in `apps/plugin-template-*/`
3. Register plugin in database
4. Test in tenant app

---

## Development Workflow

### Recommended Terminal Setup

**Option 1: Split Terminal (4 panes)**

```
┌──────────────┬──────────────┐
│ core-api     │ web (tenant) │
├──────────────┼──────────────┤
│ super-admin  │ logs/docker  │
└──────────────┴──────────────┘
```

**Option 2: Separate Terminals**

- Terminal 1: `cd apps/core-api && pnpm dev`
- Terminal 2: `cd apps/web && pnpm dev`
- Terminal 3: `cd apps/super-admin && pnpm dev`
- Terminal 4: `docker compose logs -f` (optional)

### Hot Reload

All applications support hot reload:

- **Backend (core-api)**: Auto-restarts on file changes
- **Frontend (web, super-admin)**: Hot Module Replacement (HMR)

### Database Changes

After modifying `packages/database/prisma/schema.prisma`:

```bash
cd packages/database

# Push changes to database
pnpm db:push --url="postgresql://plexica:plexica_password@localhost:5432/plexica?schema=core"

# Regenerate Prisma Client
pnpm prisma generate

# Restart core-api to pick up changes
```

### Run Tests

```bash
# Run all tests
pnpm test

# Run tests for specific package
cd apps/core-api
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

---

## Useful Commands

### Infrastructure Management

```bash
pnpm run infra:start     # Start Docker services
pnpm run infra:stop      # Stop Docker services
pnpm run infra:restart   # Restart Docker services
pnpm run infra:status    # Check service status
pnpm run infra:logs      # View all logs
pnpm run infra:clean     # Remove all volumes (⚠️ deletes data)
```

### Database Management

```bash
pnpm run db:migrate      # Run migrations
pnpm run db:studio       # Open Prisma Studio
pnpm run db:generate     # Generate Prisma Client
```

### Development

```bash
pnpm dev                 # Start all apps in dev mode (Turborepo)
pnpm build               # Build all apps
pnpm lint                # Lint all apps
pnpm format              # Format code with Prettier
pnpm clean               # Clean build artifacts
```

### Initialization

```bash
pnpm run init            # Full environment setup
pnpm run init:env        # Alias for init
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                  Plexica Platform                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Tenant App   │  │ Super Admin  │  │  Core API    │ │
│  │ (Port 3001)  │  │ (Port 3002)  │  │ (Port 3000)  │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                  │                  │         │
│         └──────────────────┴──────────────────┘         │
│                            │                            │
│  ┌─────────────────────────┴─────────────────────────┐ │
│  │            Infrastructure Layer                    │ │
│  ├────────────┬───────────┬──────────┬───────────────┤ │
│  │ PostgreSQL │ Keycloak  │  Redis   │ MinIO/Redpanda│ │
│  │ (DB)       │ (Auth)    │ (Cache)  │ (Storage/Msgs)│ │
│  └────────────┴───────────┴──────────┴───────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Key Components

- **Core API**: Backend service with REST API, multi-tenancy, plugin system
- **Tenant App**: Frontend for tenant users (port 3001)
- **Super Admin App**: Frontend for platform administrators (port 3002)
- **PostgreSQL**: Multi-tenant database with schema-per-tenant isolation
- **Keycloak**: Authentication with realm-per-tenant
- **Redis**: Session storage and caching
- **MinIO**: S3-compatible object storage
- **Redpanda**: Kafka-compatible event streaming

---

## Support

### Get Help

- **Documentation**: Check `docs/` and `specs/` directories
- **Troubleshooting**: See troubleshooting section above
- **Issues**: Check existing GitHub issues or create a new one

### Common Questions

**Q: Can I use a different database?**
A: Currently only PostgreSQL is supported. Other databases would require adapter changes.

**Q: Can I skip Keycloak and use a different auth provider?**
A: Keycloak is deeply integrated. Switching would require significant changes to the auth layer.

**Q: How do I add a custom domain for tenants?**
A: Configure your reverse proxy (Nginx) to route custom domains to the tenant app with appropriate headers.

**Q: Can I deploy this to production?**
A: Yes! See deployment documentation and production Docker Compose configuration in `docker-compose.prod.yml` and `infrastructure/`.

---

## What's Next?

🎉 **Congratulations!** Your Plexica development environment is ready.

**Suggested Learning Path**:

1. ✅ Explore the tenant app (5 min)
2. ✅ Explore the super admin app (5 min)
3. 📖 Read the technical specifications (30 min)
4. 🔌 Create your first plugin (1-2 hours)
5. 🚀 Build your first feature (varies)

**Happy coding!** 🚀

---

_Last updated: January 2026_  
_Version: 1.0_
