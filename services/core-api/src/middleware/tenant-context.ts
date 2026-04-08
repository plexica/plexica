// tenant-context.ts
// Fastify preHandler middleware — resolves tenant from request header/subdomain.
// Sets tenant context in AsyncLocalStorage for access throughout the request lifecycle.
//
// Decision log ID-001: $queryRawUnsafe intentional — slug is regex-validated.
// Decision log ID-002: single error code prevents tenant enumeration.
// H-1 fix: uses enterWithTenant() (AsyncLocalStorage.enterWith) so getTenantContext()
//          and withTenantDb() work in route handlers without param drilling. The
//          previous prisma.$queryRawUnsafe('SET search_path') was unreliable under
//          connection pool concurrency and has been removed; route handlers must use
//          withTenantDb() for all tenant-specific data access.
// H-2 fix: verifies request.user.realm matches the resolved tenant's realm.
// H-3 fix: X-Tenant-Slug header is only accepted in non-production environments.
// M-9 fix: periodic cache eviction prevents unbounded memory growth.
//
// M-01 (withTenantDb enforcement):
//   All tenant-scoped database access MUST use withTenantDb() (from lib/tenant-schema.ts).
//   This middleware sets the context via AsyncLocalStorage; withTenantDb() reads it and
//   executes SET search_path before each tenant query. Any code that uses `prisma` directly
//   (without withTenantDb) will operate on the public/core schema — an invisible data routing
//   bug. There is intentionally no lint rule for this yet; it is enforced by code review.
//   See: services/core-api/src/lib/tenant-schema.ts → withTenantDb()

import { InvalidTenantContextError, NotFoundError } from '../lib/app-error.js';
import { prisma } from '../lib/database.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { SLUG_REGEX } from '../lib/tenant-schema-helpers.js';
import { type TenantContext, enterWithTenant } from '../lib/tenant-context-store.js';
import { toRealmName, toSchemaName } from '../lib/tenant-schema-helpers.js';

import type { FastifyReply, FastifyRequest } from 'fastify';

// In-memory tenant cache — 60 second TTL
interface TenantCacheEntry {
  context: TenantContext;
  expiresAt: number;
}

const tenantCache = new Map<string, TenantCacheEntry>();
const CACHE_TTL_MS = 60_000;

// NEW-L-3: Exported for test use — allows clearing the cache between test cases
// to prevent inter-test contamination without module re-imports.
export function clearTenantCache(): void {
  tenantCache.clear();
}

// M-9: Periodic eviction of expired entries to prevent unbounded memory growth.
// unref() ensures this timer does not keep the Node.js process alive in tests.
const pruneTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of tenantCache.entries()) {
    if (now >= entry.expiresAt) {
      tenantCache.delete(key);
    }
  }
}, CACHE_TTL_MS);

if (typeof pruneTimer.unref === 'function') {
  pruneTimer.unref();
}

function extractSlug(request: FastifyRequest): string | null {
  // H-3: Only accept X-Tenant-Slug override in non-production environments.
  // In production, tenant identity MUST come from the verified subdomain.
  if (config.NODE_ENV !== 'production') {
    const headerSlug = request.headers['x-tenant-slug'];
    if (typeof headerSlug === 'string' && headerSlug.length > 0) {
      return headerSlug;
    }
  }

  // Production (and fallback): parse subdomain from Host header
  const host = request.headers.host ?? '';
  const hostWithoutPort = host.split(':')[0] ?? '';
  const parts = hostWithoutPort.split('.');
  // subdomain.domain.tld requires at least 3 parts
  if (parts.length >= 3 && parts[0] !== undefined) {
    return parts[0];
  }

  return null;
}

async function resolveTenant(slug: string): Promise<TenantContext | null> {
  const cached = tenantCache.get(slug);
  if (cached !== undefined && Date.now() < cached.expiresAt) {
    return cached.context;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, status: true },
  });

  if (tenant === null || tenant.status !== 'active') {
    tenantCache.delete(slug); // Ensure stale cache is removed
    return null;
  }

  const context: TenantContext = {
    tenantId: tenant.id,
    slug: tenant.slug,
    schemaName: toSchemaName(tenant.slug),
    realmName: toRealmName(tenant.slug),
  };

  tenantCache.set(slug, { context, expiresAt: Date.now() + CACHE_TTL_MS });
  return context;
}

export async function tenantContextMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // If tenantContext is already set by a prior hook (e.g. test stub or
  // upstream middleware), skip resolution and re-use the existing context.
  if (request.tenantContext !== undefined) {
    enterWithTenant(request.tenantContext);
    return;
  }

  const slug = extractSlug(request);

  // EC-01: missing tenant identifier — ID-002: use generic error code
  if (slug === null) {
    throw new InvalidTenantContextError();
  }

  // M-1: use the canonical SLUG_REGEX from tenant-schema-helpers (max 51 chars,
  // no trailing hyphens) — same regex used at provisioning time.
  if (!SLUG_REGEX.test(slug)) {
    throw new InvalidTenantContextError();
  }

  // P4-M-1: Check user presence BEFORE the tenant DB lookup to eliminate an
  // enumeration oracle. With this check after the DB lookup (prior ordering),
  // an unauthenticated caller with a valid-format existing slug got 404 while a
  // non-existing slug got 400 — a discrepancy that reveals which slugs are
  // registered. With this guard here, all no-auth requests return 404 before any
  // DB call, regardless of whether the slug exists.
  const userRealm = request.user?.realm;
  if (userRealm === undefined) {
    logger.debug('Missing auth before tenant lookup — rejecting (P4-M-1)');
    throw new NotFoundError();
  }

  const context = await resolveTenant(slug);

  // EC-02: unknown or inactive tenant — ID-002: same generic error code
  if (context === null) {
    logger.debug({ slug }, 'Tenant not found or inactive');
    throw new InvalidTenantContextError();
  }

  // H-2: Verify the JWT realm matches the tenant's realm to prevent cross-realm
  // access. A user authenticated in plexica-alpha must not access tenant_beta.
  // Returns 404 per AC-2 to avoid exposing which tenants/realms are valid.
  // Note: userRealm is guaranteed non-undefined here (null guard above).
  if (userRealm !== context.realmName) {
    logger.debug(
      { tokenRealm: userRealm, tenantRealm: context.realmName },
      'Realm mismatch — rejecting request (H-2)'
    );
    throw new NotFoundError();
  }

  // H-1: Wire AsyncLocalStorage so getTenantContext() and withTenantDb() work
  // in route handlers without explicit parameter passing.
  // enterWithTenant() uses AsyncLocalStorage.enterWith() which persists through
  // all subsequent async operations in the current execution tree.
  //
  // M-04 (enterWith vs runWithTenant): storage.run(context, fn) is normally
  // preferred because it scopes context to a callback boundary. However,
  // Fastify's preHandler hook does NOT wrap route handlers in a callback — it
  // runs async, then Fastify calls the route handler separately. storage.run()
  // would lose the context before the handler executes. enterWith() is therefore
  // the correct API here: it sets context for the entire remaining async execution
  // tree of the request (which is isolated per-request in Node.js's async_hooks).
  // The risk of context leaking to unrelated requests does not apply — each
  // Fastify request runs in its own async execution context.
  enterWithTenant(context);

  // Also set on request for direct access without going through ALS.
  request.tenantContext = context;
}

// Fastify type augmentation
declare module 'fastify' {
  interface FastifyRequest {
    tenantContext: TenantContext;
  }
}
