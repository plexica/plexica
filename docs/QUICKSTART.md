# 🚀 Quick Start Guide - Plexica

**Last Updated**: February 11, 2026  
**Status**: Complete setup guide for Plexica development environment

Get your Plexica development environment up and running in **5-15 minutes**.

---

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Option 1: Automated Setup (5 minutes) ⭐ RECOMMENDED](#option-1-automated-setup-5-minutes--recommended)
- [Option 2: Manual Setup (15 minutes)](#option-2-manual-setup-15-minutes)
- [What Gets Created](#what-gets-created)
- [Verify Installation](#verify-installation)
- [Common Tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)
- [Next Steps](#next-steps)

---

## Prerequisites

Before you begin, ensure you have the following installed:

| Tool               | Version | Installation                                     |
| ------------------ | ------- | ------------------------------------------------ |
| **Node.js**        | 20+     | [nodejs.org](https://nodejs.org)                 |
| **pnpm**           | 8+      | `npm install -g pnpm`                            |
| **Docker**         | 20+     | [docker.com](https://www.docker.com/get-started) |
| **Docker Compose** | 2+      | Included with Docker Desktop                     |
| **Git**            | Latest  | [git-scm.com](https://git-scm.com/downloads)     |

### Verify Installation

```bash
node --version    # Should be v20.x or higher
pnpm --version    # Should be 8.x or higher
docker --version  # Should be 20.x or higher
docker compose version  # Should be v2.x or higher
git --version
```

---

## Option 1: Automated Setup (5 minutes) ⭐ RECOMMENDED

The fastest way to get started is using our automated setup script.

### Quick Commands

```bash
# Clone the repository (if you haven't already)
git clone https://github.com/plexica/plexica.git
cd plexica

# Run the quickstart setup script
./scripts/quickstart-setup.sh
```

### What the Script Does

1. ✅ Checks prerequisites
2. ✅ Installs dependencies via pnpm
3. ✅ Sets up environment files (.env)
4. ✅ Starts Docker services (PostgreSQL, Redis, Keycloak, MinIO)
5. ✅ Runs database migrations
6. ✅ Seeds the database with demo data

**Total time:** ~5-10 minutes (depending on internet speed)

### Start Development

After the script completes:

```bash
# Start all development servers
pnpm dev
```

The application will be available at:

- **Core API**: http://localhost:3000
- **API Docs**: http://localhost:3000/docs
- **Web App**: http://localhost:3001 (if applicable)

---

## Option 2: Manual Setup (15 minutes)

If you prefer manual setup or the automated script fails:

### Step 1: Clone Repository

```bash
git clone https://github.com/plexica/plexica.git
cd plexica
```

### Step 2: Install Dependencies

```bash
pnpm install
```

This installs all monorepo dependencies (~5 minutes on first run).

### Step 3: Set Up Environment Files

```bash
# Copy environment templates
cp .env.example .env
cp packages/database/.env.example packages/database/.env

# Edit .env files with your settings (optional for quickstart)
# Default values work for local development
```

**Key environment variables** (.env):

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/plexica

# Redis
REDIS_URL=redis://localhost:6379

# Keycloak
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=plexica
KEYCLOAK_CLIENT_ID=plexica-api

# JWT
JWT_SECRET=your-secret-key-change-in-production

# MinIO (Object Storage)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

### Step 4: Start Docker Services

```bash
# Start all required services
docker compose -f test-infrastructure/docker/docker-compose.test.yml up -d

# Wait for services to be ready (1-2 minutes)
# You can check status with:
docker compose -f test-infrastructure/docker/docker-compose.test.yml ps
```

**Services started:**

- **PostgreSQL** (port 5432) - Database
- **Redis** (port 6379) - Cache
- **Keycloak** (port 8080) - Auth provider
- **MinIO** (ports 9000, 9001) - Object storage

### Step 5: Run Database Migrations

```bash
# Generate Prisma client
pnpm --filter @plexica/database db:generate

# Run migrations
pnpm --filter @plexica/database db:migrate:deploy
```

### Step 6: Seed the Database (Optional)

```bash
# Run the quickstart seed script
cd packages/database
pnpm tsx prisma/seed.quickstart.ts
cd ../..
```

This creates demo tenant, users, workspaces, and plugins for testing.

### Step 7: Start Development Server

```bash
# Start all development servers
pnpm dev
```

---

## What Gets Created

The quickstart seed script creates a complete demo environment:

### 🏢 Demo Tenant

- **Name**: Quickstart Demo Company
- **Slug**: `quickstart-demo`
- **Status**: Active
- **Schema**: `tenant_quickstart_demo`

### 👥 Demo Users

**Admin User:**

- Email: `admin@quickstart-demo.com`
- Role: Workspace Admin
- Access: Full platform access

**Member User:**

- Email: `member@quickstart-demo.com`
- Role: Workspace Member
- Access: Limited workspace access

**Set passwords in Keycloak**: http://localhost:8080

### 🏢 Default Workspace

- **Name**: Default Workspace
- **Slug**: `default`
- **Members**: Both users added
- **Plugins**: CRM and Dashboard plugins installed

### 📦 Sample Plugins (2)

**CRM Plugin** (`crm-quickstart`):

- Contact management
- Deal tracking
- Pre-configured for demos

**Dashboard Plugin** (`dashboard-quickstart`):

- Widget-based layout
- Sales overview
- Activity feed

### ⭐ Sample Data

- Plugin ratings and reviews
- Installation history
- Sample contacts and deals

---

## Verify Installation

### Check Services

```bash
# Backend health check
curl http://localhost:3000/health
# Should return: {"status":"healthy"}

# Frontend (if running)
curl http://localhost:3001
# Should return HTML or redirect

# Keycloak
curl http://localhost:8080
# Should return Keycloak page

# Database connection
docker exec -it plexica-postgres-test psql -U postgres -d plexica -c "SELECT 1;"
# Should return: 1
```

### Access Services

| Service           | URL                        | Credentials           |
| ----------------- | -------------------------- | --------------------- |
| **Core API**      | http://localhost:3000      | -                     |
| **API Docs**      | http://localhost:3000/docs | -                     |
| **Web App**       | http://localhost:3001      | _(Set in Keycloak)_   |
| **Keycloak**      | http://localhost:8080      | admin/admin           |
| **Prisma Studio** | http://localhost:5555      | -                     |
| **MinIO Console** | http://localhost:9001      | minioadmin/minioadmin |

### Login to Application

1. Navigate to http://localhost:3001 (or your app URL)
2. Click "Sign In with Keycloak"
3. Login with admin credentials (set password in Keycloak first)
4. Explore the dashboard

---

## Common Tasks

### View Database in Prisma Studio

```bash
pnpm --filter @plexica/database db:studio
```

Opens Prisma Studio at http://localhost:5555

### Check Docker Service Status

```bash
# View running containers
docker compose -f test-infrastructure/docker/docker-compose.test.yml ps

# View logs (all services)
docker compose -f test-infrastructure/docker/docker-compose.test.yml logs -f

# View logs (specific service)
docker compose -f test-infrastructure/docker/docker-compose.test.yml logs postgres
docker compose -f test-infrastructure/docker/docker-compose.test.yml logs keycloak
```

### Run Tests

```bash
# Run all tests
pnpm test

# Run tests by type
pnpm test:unit              # Unit tests (~30s)
pnpm test:integration       # Integration tests (~90s)
pnpm test:e2e               # E2E tests (~2 min)

# Run with coverage
pnpm test:coverage

# Watch mode (for TDD)
pnpm test --watch
```

See [Testing Guide](./TESTING.md) for details.

### Build Project

```bash
# Build all packages
pnpm build

# Build specific app
pnpm build --filter @plexica/core-api
```

### Lint and Format

```bash
# Lint all packages
pnpm lint

# Format all files
pnpm format
```

### Reset Database

**Warning**: This deletes all data!

```bash
# Stop services
docker compose -f test-infrastructure/docker/docker-compose.test.yml down -v

# Start services
docker compose -f test-infrastructure/docker/docker-compose.test.yml up -d

# Wait for services (~60 seconds)
sleep 60

# Run migrations
pnpm --filter @plexica/database db:migrate:deploy

# Re-seed database (optional)
cd packages/database && pnpm tsx prisma/seed.quickstart.ts
```

### Stop All Services

```bash
# Stop but keep data
docker compose -f test-infrastructure/docker/docker-compose.test.yml stop

# Stop and remove volumes (deletes all data)
docker compose -f test-infrastructure/docker/docker-compose.test.yml down -v
```

---

## Troubleshooting

### Issue: Services Won't Start

**Symptoms**: Docker containers fail to start or exit immediately

**Solution:**

```bash
# Check if ports are already in use
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
lsof -i :8080  # Keycloak
lsof -i :9000  # MinIO

# Kill conflicting processes or change ports in docker-compose.test.yml
```

### Issue: Keycloak Not Ready

**Symptoms**: Auth fails, "Cannot connect to Keycloak" errors

**Solution:**

Keycloak takes 60-90 seconds to start. Wait longer or check logs:

```bash
docker compose -f test-infrastructure/docker/docker-compose.test.yml logs keycloak

# Look for: "Keycloak running on port 8080"
```

### Issue: Database Migrations Fail

**Symptoms**: "Cannot connect to database" or "Migration failed" errors

**Solution:**

```bash
# Ensure PostgreSQL is ready
docker exec plexica-postgres-test pg_isready -U postgres

# If not ready, wait and try again
sleep 30
pnpm --filter @plexica/database db:migrate:deploy

# If still failing, reset database
docker compose -f test-infrastructure/docker/docker-compose.test.yml down -v
docker compose -f test-infrastructure/docker/docker-compose.test.yml up -d
sleep 60
pnpm --filter @plexica/database db:migrate:deploy
```

### Issue: Seed Script Fails with Unique Constraint Error

**Symptoms**: "Unique constraint failed on the fields: (`slug`)" or similar

**Solution:**

The quickstart seed script is idempotent but may fail if partial data exists.

```bash
# Option 1: Clean database and re-seed
docker compose -f test-infrastructure/docker/docker-compose.test.yml down -v
./scripts/quickstart-setup.sh

# Option 2: Use Prisma Studio to manually delete conflicting records
pnpm --filter @plexica/database db:studio
```

### Issue: "Cannot find module" Errors in Tests

**Symptoms**: Import errors during test execution

**Solution:**

This is a known issue with TypeScript path resolution. The tests work in CI/CD.

```bash
# Regenerate Prisma client
pnpm --filter @plexica/database db:generate

# Clear node_modules and reinstall
rm -rf node_modules
pnpm install
```

### Issue: Docker Out of Disk Space

**Symptoms**: "No space left on device" errors

**Solution:**

```bash
# Clean up Docker
docker system prune -a --volumes

# Then restart setup
./scripts/quickstart-setup.sh
```

### Issue: Port Already in Use

**Symptoms**: "Port 3000 is already in use" or similar

**Solution:**

```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or change port in .env file
echo "PORT=3001" >> .env
```

For more troubleshooting, see [Test Infrastructure Troubleshooting](../test-infrastructure/TROUBLESHOOTING.md).

---

## Next Steps

### 📚 Learn the Platform

1. **Read Documentation**
   - [Architecture Overview](./ARCHITECTURE.md)
   - [Technical Specifications](../specs/TECHNICAL_SPECIFICATIONS.md)
   - [Functional Specifications](../specs/FUNCTIONAL_SPECIFICATIONS.md)

2. **Explore the Codebase**
   - `/apps/core-api` - Core API implementation
   - `/packages/database` - Database schema and migrations
   - `/plugins` - Plugin implementations
   - `/test-infrastructure` - Test utilities

3. **Review the Tests**
   - `/apps/core-api/src/__tests__` - Comprehensive test suite
   - Learn from 1,047+ tests covering all modules

### 🔧 Development Workflows

**Create a New Plugin:**

```bash
# Use the plugin generator (if available)
pnpm create-plugin my-awesome-plugin

# Or manually create plugin structure
mkdir -p plugins/my-awesome-plugin
cd plugins/my-awesome-plugin
pnpm init
```

See [Plugin Development Guide](./PLUGIN_DEVELOPMENT.md) for details.

**Add a New Feature:**

1. Write tests first (TDD approach)
2. Implement the feature
3. Run tests: `pnpm test`
4. Update documentation
5. Create pull request

See [Contributing Guide](./CONTRIBUTING.md) for workflow details.

**Submit a Pull Request:**

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Ensure tests pass: `pnpm test`
4. Lint and format: `pnpm lint && pnpm format`
5. Commit with descriptive messages
6. Push and create PR

### 🎓 Additional Resources

**Documentation:**

- [Testing Guide](./TESTING.md) - Comprehensive testing guide
- [Backend Testing](./testing/BACKEND_TESTING.md) - Backend-specific testing
- [Frontend Testing](./testing/FRONTEND_TESTING.md) - Frontend E2E testing
- [Security Guidelines](./SECURITY.md) - Security best practices
- [CI/CD Guide](../.github/docs/CI_CD_DOCUMENTATION.md) - Pipeline details

**Project Planning:**

- [Project Status](../planning/PROJECT_STATUS.md) - Current status
- [Roadmap](../planning/ROADMAP.md) - Phase 1-5 roadmap
- [Milestones](../planning/MILESTONES.md) - Milestone tracking

**Specialized Guides:**

- [Plugin Frontend Guide](./guides/PLUGIN_FRONTEND_GUIDE.md)
- [Plugin Backend Guide](./guides/PLUGIN_BACKEND_GUIDE.md)
- [Design System](./design/DESIGN_SYSTEM.md)
- [UI Components Guide](./guides/UI_COMPONENTS_SHADCN_GUIDE.md)

---

## 🎉 You're All Set!

You now have a fully functional Plexica development environment.

**Quick checklist:**

- ✅ Services running (PostgreSQL, Redis, Keycloak, MinIO)
- ✅ Database migrated and seeded
- ✅ Development servers started (`pnpm dev`)
- ✅ Can access http://localhost:3000
- ✅ Tests passing (`pnpm test`)

**What to do next:**

1. Open http://localhost:3000
2. Login with admin credentials
3. Explore the CRM and Dashboard plugins
4. Check out the plugin marketplace
5. Start building your own plugins!

**Happy coding! 🚀**

---

## 📞 Getting Help

- **Documentation**: [DOCUMENT_INDEX.md](../DOCUMENT_INDEX.md)
- **Issues**: [GitHub Issues](https://github.com/plexica/plexica/issues)
- **Discussions**: [GitHub Discussions](https://github.com/plexica/plexica/discussions)
- **Email**: support@plexica.io

---

**Last Updated**: February 11, 2026  
**Version**: 2.0 (Consolidated from QUICKSTART.md + GETTING_STARTED.md)
