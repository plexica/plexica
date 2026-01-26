# Environment Initialization Script

This script performs a complete initialization of the Plexica development environment.

## What it does

The script automatically:

1. **Checks Docker Infrastructure**
   - Verifies Docker is running
   - Checks required containers (Postgres, Keycloak, Redis, MinIO)
   - Starts infrastructure if needed
   - Waits for services to be healthy

2. **Initializes Database Schema**
   - Pushes Prisma schema to PostgreSQL
   - Generates Prisma Client

3. **Seeds Database**
   - Creates 3 sample tenants (acme-corp, globex-inc, demo-company)
   - Creates 3 plugins (CRM, Analytics, Sample Analytics)
   - Creates 3 sample users
   - Creates default workspaces
   - Installs plugins for each tenant

4. **Creates Keycloak Realms**
   - Creates `plexica-admin` realm for super-admin app
   - Creates realm for each tenant
   - Creates clients for each realm
   - Configures security policies

5. **Creates Sample Users**
   - Creates admin and regular users in each tenant realm
   - Sets passwords and roles
   - Creates super-admin user in plexica-admin realm

6. **Configures MinIO**
   - Notes bucket requirements (auto-created by core-api)

## Usage

### Quick Start

```bash
# From project root
pnpm run init

# Or directly
./scripts/init-env.sh

# Or using tsx
npx tsx scripts/init-environment.ts
```

### Prerequisites

- Docker and Docker Compose installed and running
- Node.js >= 20.0.0
- pnpm >= 8.0.0

## Sample Data Created

### Tenants

| Slug         | Name              | Status |
| ------------ | ----------------- | ------ |
| acme-corp    | Acme Corporation  | ACTIVE |
| globex-inc   | Globex Industries | ACTIVE |
| demo-company | Demo Company      | ACTIVE |

### Plugins

| ID               | Name             | Version |
| ---------------- | ---------------- | ------- |
| crm              | CRM              | 0.1.0   |
| analytics        | Analytics        | 0.1.0   |
| sample-analytics | Sample Analytics | 1.0.0   |

### Users (per tenant)

| Username | Password  | Role  |
| -------- | --------- | ----- |
| admin    | Admin123! | admin |
| user     | User123!  | user  |

**Example**: For tenant `acme-corp`:

- Email: `admin@acme-corp.com` / Password: `Admin123!`
- Email: `user@acme-corp.com` / Password: `User123!`

### Super Admin

- **Realm**: `plexica-admin`
- **Username**: `admin`
- **Password**: `admin`
- **URL**: http://localhost:3002

## After Initialization

Once the script completes, start the applications:

### 1. Start Core API

```bash
cd apps/core-api
pnpm dev
```

API will be available at http://localhost:3000

### 2. Start Tenant App

```bash
cd apps/web
pnpm dev
```

App will be available at http://localhost:3001

### 3. Start Super Admin App

```bash
cd apps/super-admin
pnpm dev
```

App will be available at http://localhost:3002

## Access Points

### Tenant Apps

- URL: http://localhost:3001
- Login with tenant-specific credentials (e.g., admin@acme-corp.com / Admin123!)

### Super Admin App

- URL: http://localhost:3002
- Login: admin@plexica.com / admin (mock auth for development)

### Keycloak Admin Console

- URL: http://localhost:8080
- Login: admin / admin

### PostgreSQL (PgAdmin)

- URL: http://localhost:5050
- Login: admin@plexica.io / admin

### Redis Commander

- URL: http://localhost:8081

### MinIO Console

- URL: http://localhost:9001
- Login: minioadmin / minioadmin

### Redpanda Console

- URL: http://localhost:8082

## Troubleshooting

### Docker containers not starting

```bash
# Stop all containers
docker compose down

# Remove volumes (WARNING: This will delete all data)
docker compose down -v

# Start fresh
docker compose up -d

# Wait for services to be healthy
docker ps
```

### Database connection errors

```bash
# Check if Postgres is running
docker ps | grep postgres

# Check database logs
docker logs plexica-postgres

# Verify connection
docker exec plexica-postgres psql -U plexica -d plexica -c "SELECT 1"
```

### Keycloak realm creation fails

```bash
# Check if Keycloak is ready
curl http://localhost:8080/health

# Check Keycloak logs
docker logs plexica-keycloak

# Wait a bit longer and retry
sleep 30
pnpm run init
```

### "node_modules missing" warning

The script will automatically run `pnpm install` if node_modules is missing.

### Script fails partway through

The script is idempotent - you can safely run it multiple times. It will skip already-created resources.

## Clean Reset

To start completely fresh:

```bash
# Stop infrastructure
pnpm run infra:stop

# Clean volumes (WARNING: Deletes all data)
pnpm run infra:clean

# Start infrastructure
pnpm run infra:start

# Wait 30 seconds for services to be ready
sleep 30

# Re-initialize
pnpm run init
```

## Manual Steps

If you prefer to run steps manually:

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Wait for services
sleep 30

# 3. Initialize database schema
cd packages/database
pnpm db:push --url="postgresql://plexica:plexica_password@localhost:5432/plexica?schema=core"
pnpm prisma generate

# 4. Seed database
pnpm db:seed

# 5. Create Keycloak realms and users
# (Use Keycloak Admin Console at http://localhost:8080)
```

## Notes

- The script is safe to run multiple times (idempotent)
- Existing resources will be skipped with warnings
- All passwords are development-only and should be changed in production
- The super-admin app uses mock authentication in development
- Tenant apps use real Keycloak authentication

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review the script output for specific error messages
3. Check Docker container logs
4. Ensure all ports are available (3000, 3001, 3002, 5432, 6379, 8080, 9000, 9092, etc.)
