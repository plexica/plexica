# 🚀 Plexica Quickstart Guide

Welcome to Plexica! This guide will get you up and running with a fully functional development environment in under 10 minutes.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Setup (Automated)](#quick-setup-automated)
- [Manual Setup](#manual-setup)
- [What Gets Created](#what-gets-created)
- [Login Credentials](#login-credentials)
- [Exploring the Platform](#exploring-the-platform)
- [Common Tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)
- [Next Steps](#next-steps)

---

## Prerequisites

Before you begin, ensure you have the following installed:

| Tool               | Version | Installation                                     |
| ------------------ | ------- | ------------------------------------------------ |
| **Node.js**        | 18+     | [nodejs.org](https://nodejs.org)                 |
| **pnpm**           | 8+      | `npm install -g pnpm`                            |
| **Docker**         | 20+     | [docker.com](https://www.docker.com/get-started) |
| **Docker Compose** | 2+      | Included with Docker Desktop                     |

### Verify Installation

```bash
node --version    # Should be v18.x or higher
pnpm --version    # Should be 8.x or higher
docker --version  # Should be 20.x or higher
docker compose version  # Should be v2.x or higher
```

---

## Quick Setup (Automated)

The fastest way to get started is using our automated setup script:

```bash
# Clone the repository (if you haven't already)
git clone https://github.com/plexica/plexica.git
cd plexica

# Run the quickstart setup script
./scripts/quickstart-setup.sh
```

This script will:

1. ✅ Check prerequisites
2. ✅ Install dependencies
3. ✅ Set up environment files
4. ✅ Start Docker services (PostgreSQL, Redis, Keycloak, MinIO)
5. ✅ Run database migrations
6. ✅ Seed the database with demo data

**Total time:** ~5-10 minutes (depending on your internet speed)

---

## Manual Setup

If you prefer to set things up manually or the automated script fails:

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Up Environment Files

```bash
# Copy environment templates
cp .env.example .env
cp packages/database/.env.example packages/database/.env

# Edit .env files with your settings (optional for quickstart)
```

### 3. Start Docker Services

```bash
# Start all required services
docker compose -f test-infrastructure/docker/docker-compose.test.yml up -d

# Wait for services to be ready (may take 1-2 minutes)
docker compose -f test-infrastructure/docker/docker-compose.test.yml ps
```

### 4. Run Database Migrations

```bash
# Generate Prisma client
pnpm --filter @plexica/database db:generate

# Run migrations
pnpm --filter @plexica/database db:migrate:deploy
```

### 5. Seed the Database

```bash
# Run the quickstart seed script
cd packages/database
pnpm tsx prisma/seed.quickstart.ts
```

### 6. Start the Development Server

```bash
# Return to project root
cd ../..

# Start the dev server
pnpm dev
```

---

## What Gets Created

The quickstart seed script creates a complete demo environment:

### 🏢 Tenant

- **Name:** Quickstart Demo Company
- **Slug:** `quickstart-demo`
- **Status:** Active

### 📦 Plugins (2)

1. **CRM Plugin** (`crm-quickstart`)
   - Contact management
   - Deal tracking
   - Pre-configured for demos

2. **Dashboard Plugin** (`dashboard-quickstart`)
   - Widget-based layout
   - Sales overview
   - Activity feed

### 👥 Users (2)

1. **Admin User**
   - Email: `admin@quickstart-demo.com`
   - Role: Workspace Admin
   - Full access to all features

2. **Member User**
   - Email: `member@quickstart-demo.com`
   - Role: Workspace Member
   - Limited access

### 🏢 Workspace

- **Name:** Default Workspace
- **Slug:** `default`
- **Members:** Both users are added
- **Plugins:** Both plugins are installed and enabled

### ⭐ Plugin Ratings

- Sample ratings and reviews for each plugin
- Helps demonstrate the marketplace functionality

### 📥 Installation History

- Installation records for tracking plugin usage
- Useful for analytics and marketplace features

---

## Login Credentials

### Keycloak Admin Console

- **URL:** http://localhost:8080
- **Username:** `admin`
- **Password:** `admin`

Use the Keycloak console to:

- Create user passwords
- Manage user accounts
- Configure authentication settings

### Application Users

After creating passwords in Keycloak:

**Admin User:**

- Email: `admin@quickstart-demo.com`
- Password: _(Set in Keycloak)_

**Member User:**

- Email: `member@quickstart-demo.com`
- Password: _(Set in Keycloak)_

---

## Exploring the Platform

### 1. Start the Application

```bash
pnpm dev
```

This starts:

- **Core API:** http://localhost:3000
- **Web App:** http://localhost:3001 (if applicable)

### 2. Login

1. Navigate to http://localhost:3000 (or your app URL)
2. Click "Sign In"
3. Enter admin credentials
4. Explore the dashboard

### 3. Try the Plugins

**CRM Plugin:**

- Navigate to CRM from the sidebar
- View sample contacts
- Explore the deal pipeline
- Test the activity tracking

**Dashboard Plugin:**

- Go to Dashboard
- View pre-configured widgets
- Test drag-and-drop layout
- Customize widget settings

### 4. Explore the Marketplace

- Go to Plugin Marketplace
- Browse available plugins
- View plugin details and ratings
- Install/uninstall plugins

### 5. Workspace Management

- Navigate to Workspace Settings
- View workspace members
- Test role-based permissions
- Try inviting new members

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

# View logs
docker compose -f test-infrastructure/docker/docker-compose.test.yml logs -f

# Check specific service
docker compose -f test-infrastructure/docker/docker-compose.test.yml logs postgres
```

### Run Tests

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit

# Run integration tests
pnpm test:integration

# Run E2E tests
pnpm test:e2e

# Run with coverage
pnpm test:coverage
```

### Reset Database

```bash
# Stop services
docker compose -f test-infrastructure/docker/docker-compose.test.yml down -v

# Start services
docker compose -f test-infrastructure/docker/docker-compose.test.yml up -d

# Wait for services to be ready (~60 seconds)
sleep 60

# Run migrations
pnpm --filter @plexica/database db:migrate:deploy

# Re-seed database
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

### Issue: Services won't start

**Solution:**

```bash
# Check if ports are already in use
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis
lsof -i :8080  # Keycloak
lsof -i :9000  # MinIO

# Kill conflicting processes or change ports in docker-compose.test.yml
```

### Issue: Keycloak is not ready

**Solution:**
Keycloak takes 60-90 seconds to start. Wait longer or check logs:

```bash
docker compose -f test-infrastructure/docker/docker-compose.test.yml logs keycloak
```

### Issue: Database migrations fail

**Solution:**

```bash
# Ensure PostgreSQL is ready
docker exec plexica-postgres-test pg_isready -U plexica

# Reset and try again
docker compose -f test-infrastructure/docker/docker-compose.test.yml down -v
docker compose -f test-infrastructure/docker/docker-compose.test.yml up -d
sleep 60
pnpm --filter @plexica/database db:migrate:deploy
```

### Issue: "Cannot find module" errors in tests

**Solution:**
This is a known issue with TypeScript path resolution. The tests are correctly written but may not execute locally due to import path issues. They work correctly in CI/CD.

### Issue: Seed script fails with unique constraint error

**Solution:**
The quickstart seed script is idempotent. If it fails due to existing data:

```bash
# Option 1: Clean database and re-seed
docker compose -f test-infrastructure/docker/docker-compose.test.yml down -v
./scripts/quickstart-setup.sh

# Option 2: Use Prisma Studio to manually delete conflicting records
pnpm --filter @plexica/database db:studio
```

### Issue: Docker out of disk space

**Solution:**

```bash
# Clean up Docker
docker system prune -a --volumes

# Then restart setup
./scripts/quickstart-setup.sh
```

---

## Next Steps

### 📚 Learn More

1. **Read the Documentation**
   - Architecture Overview
   - Plugin Development Guide
   - API Reference

2. **Explore the Codebase**
   - `/apps/core-api` - Core API implementation
   - `/packages/database` - Database schema and migrations
   - `/plugins` - Plugin implementations
   - `/test-infrastructure` - Test utilities

3. **Review the Tests**
   - `/apps/core-api/src/__tests__` - Comprehensive test suite
   - Learn from ~870+ tests covering all modules

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

**Add a New Feature:**

1. Write tests first (TDD approach)
2. Implement the feature
3. Run tests: `pnpm test`
4. Update documentation

**Submit a Pull Request:**

1. Create a feature branch
2. Make your changes
3. Ensure tests pass: `pnpm test`
4. Commit with descriptive messages
5. Push and create PR

### 🎓 Additional Resources

- **Documentation:** https://docs.plexica.io
- **API Reference:** https://docs.plexica.io/api
- **Plugin Development:** https://docs.plexica.io/plugins
- **Contributing Guide:** ./CONTRIBUTING.md
- **Test Documentation:** ./TEST_IMPLEMENTATION_PLAN.md
- **CI/CD Guide:** ./.github/docs/CI_CD_DOCUMENTATION.md

---

## 🎉 You're All Set!

You now have a fully functional Plexica development environment. Here's what to do next:

1. ✅ Start the dev server: `pnpm dev`
2. ✅ Open http://localhost:3000
3. ✅ Login with admin credentials
4. ✅ Explore the CRM and Dashboard plugins
5. ✅ Check out the plugin marketplace
6. ✅ Start building your own plugins!

**Happy coding! 🚀**

---

## 📞 Getting Help

- **Issues:** [GitHub Issues](https://github.com/plexica/plexica/issues)
- **Discussions:** [GitHub Discussions](https://github.com/plexica/plexica/discussions)
- **Discord:** [Join our Discord](https://discord.gg/plexica)
- **Email:** support@plexica.io

---

_Last updated: January 2025_
_Version: 1.0.0_
