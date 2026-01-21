# @plexica/database

Database package for Plexica platform using **Prisma 7.2.0** with PostgreSQL adapter.

## Overview

This package provides:

- **Prisma schema** for multi-tenant database structure
- **Database migrations** for schema versioning
- **Pre-configured PrismaClient** with PostgreSQL adapter
- **Type-safe database access** for all Plexica applications

## Architecture

### Prisma 7 with PostgreSQL Adapter

Plexica uses Prisma 7.2.0, which requires a database adapter for PostgreSQL. We use:

- **`@prisma/adapter-pg`** - Official Prisma adapter for node-postgres
- **`pg`** - PostgreSQL client for Node.js
- **Connection pooling** - Managed by `pg.Pool`

### Multi-Tenancy Strategy

Plexica implements **schema-per-tenant** isolation:

- **`core` schema** - Global data (tenants, plugins, super admins)
- **Tenant schemas** - One schema per tenant (e.g., `tenant_acme_corp`)
- **Dynamic schema selection** - Runtime schema switching for tenant operations

## Installation

This package is part of the Plexica monorepo. Install dependencies from the root:

```bash
# From monorepo root
pnpm install
```

## Configuration

### Environment Variables

Create a `.env` file in the **monorepo root** with:

```bash
DATABASE_URL="postgresql://plexica:plexica_password@localhost:5432/plexica?schema=core"
```

### Prisma Configuration

The package uses `prisma.config.ts` (new in Prisma 7) for configuration:

```typescript
// packages/database/prisma/prisma.config.ts
import { config } from 'dotenv';
import { resolve } from 'path';
import { defineConfig, env } from 'prisma/config';

// Load .env from monorepo root
config({ path: resolve(__dirname, '../../../.env') });

export default defineConfig({
  schema: './schema.prisma',
  migrations: {
    path: './migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
```

## Usage

### Importing PrismaClient

**✅ Recommended:** Use the pre-configured singleton client:

```typescript
import prisma from '@plexica/database';

// Client is ready to use with PostgreSQL adapter
const tenants = await prisma.tenant.findMany();
```

**Alternative:** Import types separately:

```typescript
import prisma, { Tenant, Plugin } from '@plexica/database';

const tenant: Tenant = await prisma.tenant.findUnique({
  where: { slug: 'acme-corp' },
});
```

### Client Configuration

The client is pre-configured with:

```typescript
// packages/database/src/index.ts
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create Prisma adapter
const adapter = new PrismaPg(pool);

// Create PrismaClient with adapter (required for Prisma 7)
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  adapter,
});

export default prisma;
```

## Prisma CLI Commands

### Generate Client

**⚠️ Important:** Due to pnpm 10+ security policy, use `npx` for Prisma commands:

```bash
# From packages/database directory
npx --yes prisma@7.2.0 generate --config ./prisma/prisma.config.ts

# Or from monorepo root (using pnpm script)
pnpm db:generate
```

### Migrations

#### Create and Apply Migration (Development)

```bash
cd packages/database

# Create new migration
npx prisma migrate dev --name "add_user_table" --config ./prisma/prisma.config.ts

# This will:
# 1. Create migration SQL file in prisma/migrations/
# 2. Apply migration to database
# 3. Regenerate Prisma Client
```

#### Apply Migrations (Production)

```bash
cd packages/database

# Apply pending migrations
npx prisma migrate deploy --config ./prisma/prisma.config.ts
```

#### Check Migration Status

```bash
cd packages/database

# View migration history
npx prisma migrate status --config ./prisma/prisma.config.ts
```

### Database Push (Development Only)

Push schema changes without creating migration files:

```bash
cd packages/database
npx prisma db push --config ./prisma/prisma.config.ts
```

**⚠️ Warning:** This bypasses migration history. Use only for prototyping.

### Prisma Studio

Open interactive database GUI:

```bash
cd packages/database
npx prisma studio --config ./prisma/prisma.config.ts
```

Access at: http://localhost:5555

### Reset Database

**⚠️ Danger:** This deletes all data and reapplies migrations:

```bash
cd packages/database
npx prisma migrate reset --config ./prisma/prisma.config.ts
```

## Schema Overview

### Core Schema

Global data stored in `core` schema:

```prisma
// Tenant registry
model Tenant {
  id        String       @id @default(uuid())
  slug      String       @unique
  name      String
  status    TenantStatus @default(PROVISIONING)
  // ... more fields

  @@map("tenants")
  @@schema("core")
}

// Plugin catalog
model Plugin {
  id        String       @id
  name      String
  version   String
  manifest  Json
  // ... more fields

  @@map("plugins")
  @@schema("core")
}

// Super admins
model SuperAdmin {
  id         String   @id @default(uuid())
  keycloakId String   @unique @map("keycloak_id")
  email      String   @unique
  // ... more fields

  @@map("super_admins")
  @@schema("core")
}
```

### Tenant Schema Templates

Models replicated per tenant (in separate schemas):

```prisma
model User {
  id         String   @id @default(uuid())
  keycloakId String   @unique @map("keycloak_id")
  email      String   @unique
  // ... more fields

  @@map("users")
  @@schema("core") // Template - actual tables in tenant schemas
}

model Workspace {
  id          String   @id @default(uuid())
  slug        String   @unique
  name        String
  // ... more fields

  @@map("workspaces")
  @@schema("core") // Template
}
```

## Troubleshooting

### Error: "Could not resolve @prisma/client"

**Cause:** Prisma client not generated or pnpm installed packages without running build scripts.

**Solution:**

```bash
cd packages/database
npx --yes prisma@7.2.0 generate --config ./prisma/prisma.config.ts
```

### Error: "Using engine type 'client' requires adapter"

**Cause:** Prisma 7 defaults to "client" engine type which requires a database adapter.

**Solution:** This is already configured in `src/index.ts` with `@prisma/adapter-pg`. If you see this error, ensure you're importing the pre-configured client:

```typescript
// ✅ Correct
import prisma from '@plexica/database';

// ❌ Wrong - creates new client without adapter
import { PrismaClient } from '@plexica/database';
const db = new PrismaClient();
```

### Error: "Cannot resolve environment variable: DATABASE_URL"

**Cause:** `.env` file not found or `DATABASE_URL` not set.

**Solution:**

1. Create `.env` in monorepo root (copy from `.env.example`)
2. Ensure `DATABASE_URL` is set:
   ```bash
   DATABASE_URL="postgresql://plexica:plexica_password@localhost:5432/plexica?schema=core"
   ```

### pnpm ignores Prisma build scripts

**Cause:** pnpm 10+ has security policy that blocks package build scripts.

**Solution:** Use `npx` directly instead of `pnpm exec prisma`:

```bash
# ❌ This won't work with pnpm 10+
pnpm exec prisma generate

# ✅ Use this instead
npx --yes prisma@7.2.0 generate --config ./prisma/prisma.config.ts
```

### Migration fails with "schema does not exist"

**Cause:** PostgreSQL schema not created.

**Solution:** Ensure Docker containers are running and database is initialized:

```bash
# From monorepo root
docker-compose up -d postgres

# Check if containers are healthy
docker ps | grep plexica-postgres

# Run migrations
cd packages/database
npx prisma migrate deploy --config ./prisma/prisma.config.ts
```

### Connection Pool Exhaustion

**Symptom:** "Too many connections" errors in production.

**Solution:** Configure `pg` Pool settings in `src/index.ts`:

```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum connections
  idleTimeoutMillis: 30000, // Close idle connections after 30s
  connectionTimeoutMillis: 2000, // Connection timeout
});
```

## Package Scripts

Add these to `packages/database/package.json`:

```json
{
  "scripts": {
    "db:generate": "npx prisma generate --config ./prisma/prisma.config.ts",
    "db:migrate": "npx prisma migrate dev --config ./prisma/prisma.config.ts",
    "db:migrate:deploy": "npx prisma migrate deploy --config ./prisma/prisma.config.ts",
    "db:studio": "npx prisma studio --config ./prisma/prisma.config.ts",
    "db:push": "npx prisma db push --config ./prisma/prisma.config.ts"
  }
}
```

## Dependencies

```json
{
  "dependencies": {
    "@prisma/client": "^7.2.0",
    "@prisma/adapter-pg": "^7.2.0",
    "pg": "^8.17.2",
    "dotenv": "^17.2.3"
  },
  "devDependencies": {
    "prisma": "^7.2.0",
    "@types/pg": "^8.16.0"
  }
}
```

## Migration History

### Current Migrations

1. **20240113000000_initial** - Initial schema with core models
2. **20240114000000_add_workspaces** - Add workspace support

View full migration history:

```bash
cd packages/database
ls -la prisma/migrations/
```

## Best Practices

### 1. Always Use the Singleton Client

```typescript
// ✅ Good
import prisma from '@plexica/database';

// ❌ Bad - creates multiple connections
import { PrismaClient } from '@plexica/database';
const db = new PrismaClient();
```

### 2. Use Transactions for Related Operations

```typescript
await prisma.$transaction(async (tx) => {
  const tenant = await tx.tenant.create({ data: {...} });
  const plugin = await tx.tenantPlugin.create({ data: {...} });
  return { tenant, plugin };
});
```

### 3. Always Use Migrations in Production

```bash
# ❌ Never use in production
npx prisma db push

# ✅ Always use migrations
npx prisma migrate deploy --config ./prisma/prisma.config.ts
```

### 4. Close Connections on Shutdown

```typescript
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
```

## Additional Resources

- [Prisma 7 Documentation](https://www.prisma.io/docs/orm/prisma-client)
- [Prisma 7 Upgrade Guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-to-prisma-7)
- [PostgreSQL Adapter Docs](https://www.prisma.io/docs/orm/overview/databases/postgresql#using-the-driver-adapters)
- [Multi-Schema Support](https://www.prisma.io/docs/orm/prisma-schema/data-model/multi-schema)

---

**Package Version:** 0.1.0  
**Prisma Version:** 7.2.0  
**Last Updated:** January 21, 2026
