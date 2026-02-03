# Prisma 7 Migration Guide & Troubleshooting

**Last Updated**: 2025-02-03  
**Status**: Complete  
**Owner**: Engineering Team  
**Document Type**: Developer Guide

**Last Updated**: 2025-02-03  
**Status**: Complete  
**Owner**: Engineering Team  
**Document Type**: Migration Guide

## Overview

This document provides detailed information about Plexica's migration to Prisma 7.2.0 and common troubleshooting steps.

**Migration Date:** January 21, 2026  
**Prisma Version:** 7.2.0  
**Previous Version:** 5.8.1

---

## What Changed in Prisma 7

### 1. Database Adapters Required

**Change:** Prisma 7 introduced a new "client" engine type that requires database adapters.

**Impact:** Direct PostgreSQL connections now require `@prisma/adapter-pg` + `pg` driver.

**Implementation:**

```typescript
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter, // Required for Prisma 7
});
```

### 2. Configuration File (prisma.config.ts)

**Change:** Prisma 7 introduces `prisma.config.ts` for centralized configuration.

**Impact:** Database URL and other settings moved from `schema.prisma` to config file.

**Implementation:**

```typescript
// packages/database/prisma/prisma.config.ts
import { config } from 'dotenv';
import { resolve } from 'path';
import { defineConfig, env } from 'prisma/config';

config({ path: resolve(__dirname, '../../../.env') });

export default defineConfig({
  schema: './schema.prisma',
  migrations: { path: './migrations' },
  datasource: { url: env('DATABASE_URL') },
});
```

### 3. CLI Commands Require --config Flag

**Change:** All Prisma CLI commands need `--config` flag when using `prisma.config.ts`.

**Before (Prisma 5):**

```bash
prisma generate
prisma migrate dev
```

**After (Prisma 7):**

```bash
prisma generate --config ./prisma/prisma.config.ts
prisma migrate dev --config ./prisma/prisma.config.ts
```

### 4. Preview Features Removed

**Change:** Multi-schema support is now stable, `previewFeatures` removed.

**Before:**

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}
```

**After:**

```prisma
generator client {
  provider   = "prisma-client-js"
  engineType = "binary"  // Optional: forces binary engine
}
```

---

## Common Issues & Solutions

### Issue 1: "Could not resolve @prisma/client"

**Error Message:**

```
Error: Could not resolve @prisma/client.
Please try to install it with npm i @prisma/client
```

**Cause:** Prisma Client not generated, or pnpm blocked build scripts.

**Solution:**

```bash
cd packages/database
npx --yes prisma@7.2.0 generate --config ./prisma/prisma.config.ts
```

**Why npx?** pnpm 10+ security policy blocks Prisma's build scripts. Using `npx` bypasses this.

---

### Issue 2: "Using engine type 'client' requires adapter"

**Error Message:**

```
PrismaClientConstructorValidationError: Using engine type "client" requires
either "adapter" or "accelerateUrl" to be provided to PrismaClient constructor.
```

**Cause:** Creating a new PrismaClient without the required adapter.

**Solution:** Always import the pre-configured client from `@plexica/database`:

```typescript
// ✅ Correct
import prisma from '@plexica/database';

// ❌ Wrong - creates new client without adapter
import { PrismaClient } from '@plexica/database';
const db = new PrismaClient(); // Error!
```

**Where to fix:** Check these files:

- `apps/core-api/src/lib/db.ts`
- Any service files creating PrismaClient directly

---

### Issue 3: "Cannot resolve environment variable: DATABASE_URL"

**Error Message:**

```
PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL.
```

**Cause:** `.env` file not found or `DATABASE_URL` not set.

**Solution:**

1. Ensure `.env` exists in **monorepo root** (not in `packages/database`)
2. Verify `DATABASE_URL` is set:
   ```bash
   DATABASE_URL="postgresql://plexica:plexica_password@localhost:5432/plexica?schema=core"
   ```
3. Check `prisma.config.ts` loads from correct path:
   ```typescript
   config({ path: resolve(__dirname, '../../../.env') });
   ```

---

### Issue 4: pnpm exec prisma doesn't work

**Error Message:**

```
Ignored build scripts: @prisma/engines@7.2.0, prisma@7.2.0
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.
```

**Cause:** pnpm 10+ blocks package build scripts for security.

**Solution:** Use `npx` instead of `pnpm exec`:

```bash
# ❌ Doesn't work with pnpm 10+
pnpm exec prisma generate

# ✅ Works
npx --yes prisma@7.2.0 generate --config ./prisma/prisma.config.ts
```

**Package scripts updated:**

```json
{
  "scripts": {
    "db:generate": "npx --yes prisma@7.2.0 generate --config ./prisma/prisma.config.ts"
  }
}
```

---

### Issue 5: Migration fails with "schema does not exist"

**Error Message:**

```
Error: P3009: Schema 'core' does not exist in the current database.
```

**Cause:** PostgreSQL schema not initialized.

**Solution:**

```bash
# Ensure PostgreSQL is running
docker ps | grep plexica-postgres

# If not running, start it
docker-compose up -d postgres

# Wait for health check
docker ps # Check STATUS column shows "healthy"

# Run migrations
cd packages/database
npx prisma migrate deploy --config ./prisma/prisma.config.ts
```

---

### Issue 6: "Too many connections" in production

**Error Message:**

```
Error: remaining connection slots are reserved for non-replication superuser connections
```

**Cause:** Connection pool exhaustion.

**Solution:** Configure `pg` Pool limits in `packages/database/src/index.ts`:

```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Max connections (default: 10)
  min: 5, // Min connections
  idleTimeoutMillis: 30000, // Close idle after 30s
  connectionTimeoutMillis: 2000, // Connection timeout
});
```

**Production recommendations:**

- `max`: 20-50 (based on PostgreSQL `max_connections`)
- `min`: 5-10 (keep warm connections)
- Monitor with: `SELECT count(*) FROM pg_stat_activity;`

---

### Issue 7: Stale Prisma Client after schema changes

**Symptoms:** TypeScript errors about missing fields/models that exist in schema.

**Cause:** Prisma Client not regenerated after schema changes.

**Solution:**

```bash
cd packages/database

# 1. Regenerate client
npx --yes prisma@7.2.0 generate --config ./prisma/prisma.config.ts

# 2. Restart dev server
# In terminal running dev server: Ctrl+C, then:
pnpm dev
```

---

### Issue 8: Migration rollback needed

**Scenario:** Applied migration has bugs, need to rollback.

**Solution:**

**Option 1: Manual rollback (safest)**

```bash
cd packages/database

# 1. Check migration status
npx prisma migrate status --config ./prisma/prisma.config.ts

# 2. Manually write DOWN migration SQL
# Create: prisma/migrations/<timestamp>_rollback_<name>/migration.sql
# Write SQL to undo changes

# 3. Apply rollback
npx prisma migrate deploy --config ./prisma/prisma.config.ts
```

**Option 2: Database reset (development only)**

```bash
# ⚠️ WARNING: Deletes ALL data
npx prisma migrate reset --config ./prisma/prisma.config.ts
```

---

## Best Practices

### 1. Always Use Pre-configured Client

```typescript
// ✅ Good - uses singleton with adapter
import prisma from '@plexica/database';

const tenants = await prisma.tenant.findMany();
```

```typescript
// ❌ Bad - creates new instance without adapter
import { PrismaClient } from '@plexica/database';
const db = new PrismaClient(); // Error!
```

### 2. Use Migrations, Not db push

```bash
# ❌ Development only - no history
npx prisma db push --config ./prisma/prisma.config.ts

# ✅ Production safe - versioned
npx prisma migrate dev --config ./prisma/prisma.config.ts
```

### 3. Always Specify --config Flag

```bash
# ❌ Uses default config (may fail)
npx prisma generate

# ✅ Uses Prisma 7 config
npx prisma generate --config ./prisma/prisma.config.ts
```

### 4. Close Connections on Shutdown

```typescript
// apps/core-api/src/index.ts
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
```

### 5. Use Transactions for Related Operations

```typescript
await prisma.$transaction(async (tx) => {
  const tenant = await tx.tenant.create({
    data: { slug: 'acme', name: 'Acme Corp' },
  });

  const plugin = await tx.tenantPlugin.create({
    data: { tenantId: tenant.id, pluginId: 'analytics' },
  });

  return { tenant, plugin };
});
```

---

## Performance Tips

### 1. Connection Pooling

```typescript
// Configure pool size based on load
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env.NODE_ENV === 'production' ? 20 : 5,
  idleTimeoutMillis: 30000,
});
```

### 2. Query Optimization

```typescript
// ✅ Select only needed fields
const users = await prisma.user.findMany({
  select: { id: true, email: true }, // Don't fetch all fields
});

// ✅ Use pagination
const users = await prisma.user.findMany({
  take: 10,
  skip: (page - 1) * 10,
});
```

### 3. Enable Query Logging (Development)

```typescript
const prisma = new PrismaClient({
  log: ['query', 'error', 'warn'],
  adapter,
});

// See SQL queries in console
```

---

## Monitoring & Debugging

### Check Active Connections

```sql
-- Connect to PostgreSQL
psql -U plexica -d plexica

-- View active connections
SELECT
  pid,
  usename,
  application_name,
  client_addr,
  state,
  query
FROM pg_stat_activity
WHERE datname = 'plexica';
```

### Monitor Connection Pool

```typescript
// Add to your monitoring
pool.on('connect', () => {
  console.log('New connection to pool');
});

pool.on('remove', () => {
  console.log('Connection removed from pool');
});

// Check pool stats
console.log('Total connections:', pool.totalCount);
console.log('Idle connections:', pool.idleCount);
console.log('Waiting requests:', pool.waitingCount);
```

### Enable Prisma Debug Logs

```bash
# Set environment variable
DEBUG=prisma:* pnpm dev

# Or in code
const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'stdout' },
  ],
});

prisma.$on('query', (e) => {
  console.log('Query:', e.query);
  console.log('Duration:', e.duration, 'ms');
});
```

---

## Migration Checklist

Before migrating to Prisma 7 in production:

- [ ] Backup database
- [ ] Test migrations in staging environment
- [ ] Update all `PrismaClient` instantiations to use adapter
- [ ] Update CI/CD pipeline to use `npx prisma` commands
- [ ] Configure connection pool limits
- [ ] Test rollback procedure
- [ ] Monitor connection pool in production
- [ ] Update documentation and runbooks
- [ ] Train team on new commands and troubleshooting

---

## Additional Resources

- [Prisma 7 Release Notes](https://github.com/prisma/prisma/releases/tag/7.0.0)
- [Prisma 7 Upgrade Guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-to-prisma-7)
- [PostgreSQL Adapter Documentation](https://www.prisma.io/docs/orm/overview/databases/postgresql)
- [Database Connection Management](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections)

---

**Document Version:** 1.0  
**Last Updated:** January 21, 2026  
**Maintained by:** Plexica Engineering Team
