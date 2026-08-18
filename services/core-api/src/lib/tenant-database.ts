// tenant-database.ts
// Tenant-scoped database access using a dedicated TenantPrismaClient.
//
// ARCHITECTURE NOTE (Decision Log ID-001 follow-up):
// The original implementation used `prisma.$transaction` with `SET LOCAL search_path`.
// This approach failed because the core Prisma client only knows core-schema models
// (Tenant, TenantConfig, …) and cannot access tenant-schema models (workspace,
// workspaceMember, invitation, auditLog, userProfile, …).
//
// The correct solution: a TenantPrismaClient per tenant schema using the
// `?schema=<schemaName>` connection URL parameter. This is the same pattern
// already used by db.helpers.ts (buildTenantClient) and tested in integration.
//
// ADR-027: clients are NOT created per call (67 call sites, 4+ per request
// exhausted PostgreSQL connections). They live in a bounded LRU cache
// (tenant-db-cache.ts) keyed by schemaName, with LRU cap + idle TTL eviction
// (evicted entries are $disconnect()ed), explicit invalidation on the tenant
// deprovisioning path, and a full drain on shutdown. The cache is safe
// because every cached client is bound to exactly one schema via its
// connection URL — no search_path state is ever shared across tenants.
//
// M-04 NOTE: Fastify v5 runs each hook and route handler in its own
// async execution scope, so AsyncLocalStorage.enterWith() set in a
// preHandler does NOT propagate to the route handler. Route handlers
// must pass req.tenantContext explicitly as the second argument.
// The AsyncLocalStorage fallback (getTenantContext) is preserved for
// non-Fastify call sites (e.g. CLI scripts, standalone utilities).

import { PrismaClient } from '@prisma/client';

// ADR-028: the generated tenant client is always present after `pnpm install`
// (prepare script runs `pnpm db:generate` — no database connection required).
import { PrismaClient as TenantPrismaClient } from '../../prisma/generated/tenant-client/index.js';

import { prisma as coreDb } from './database.js';
import { logger } from './logger.js';
import { getOrCreateTenantClient, releaseTenantClient } from './tenant-db-cache.js';
import { getTenantContext } from './tenant-context-store.js';

import type { Prisma as TenantPrisma } from '../../prisma/generated/tenant-client/index.js';
import type { TenantContext } from './tenant-context-store.js';

export type { TenantPrismaClient };
// Re-exported so modules have a single import site for tenant-schema types
// (where/orderBy/input types) and do not reach into prisma/generated directly.
export type { TenantPrisma };

/**
 * Tenant-schema client accepted by module repositories and services (ADR-028):
 * either the plain cached `TenantPrismaClient` handed out by `withTenantDb()`
 * or an interactive `$transaction` client derived from it. Both expose the
 * tenant model delegates; only the plain client exposes `$transaction`, so a
 * function that opens its own transaction MUST declare the parameter as
 * `TenantPrismaClient` — the compiler then rejects transaction clients.
 * A function that must run OUTSIDE a transaction keeps the
 * `assertNonTransactionalDb` runtime guard as defence in depth.
 */
export type TenantDbClient = TenantPrismaClient | TenantPrisma.TransactionClient;

// ADR-027 lifecycle API: deprovisioning invalidation + graceful shutdown drain.
export { disconnectAllTenantDbClients, invalidateTenantDbClient } from './tenant-db-cache.js';

// ---------------------------------------------------------------------------
// Transaction-client detection (runtime guard)
//
// WHY A RUNTIME GUARD AND NOT A BRANDED TYPE
// The obvious compile-time defence — brand the client returned by
// `withTenantDb` so that a `Prisma.TransactionClient` fails to typecheck — was
// evaluated and rejected on evidence:
//
//   1. A BRAND FORBIDS WHAT IS LEGAL. Callers legitimately hand a transaction
//      client to most repository functions; only a few (audit writer, decision
//      logger) must run outside a transaction. A brand on `withTenantDb` would
//      have to be un-branded at every legal transaction call site.
//   2. THE RUNTIME GUARD IS PRECISE. The discriminant below is verified
//      against the generated client and works even through test doubles and
//      structural subtypes that would defeat branding.
//
// The discriminant below is verified against the generated client: an
// interactive-transaction client exposes `$queryRaw`/`$executeRaw` but NOT
// `$transaction`, `$connect`, `$disconnect` or `$extends`. Requiring
// `$queryRaw` keeps plain test doubles (e.g. `{ auditLog: { create } }`) from
// being misreported as transaction clients.
// ---------------------------------------------------------------------------

/**
 * Returns true when `db` is a Prisma interactive-transaction ("itx") client.
 *
 * Detection: it quacks like a Prisma client (`$queryRaw` is callable) but the
 * itx deny-list has stripped `$transaction`.
 */
export function isTransactionClient(db: unknown): boolean {
  if (typeof db !== 'object' || db === null) return false;
  const client = db as Record<string, unknown>;
  return typeof client['$queryRaw'] === 'function' && typeof client['$transaction'] !== 'function';
}

/**
 * Fails fast when a caller that must run OUTSIDE a transaction is handed an
 * interactive `$transaction` client.
 *
 * Rationale: issuing a statement that errors inside an interactive transaction
 * aborts it at the PostgreSQL level (SQLSTATE 25P02) even if the JS rejection
 * is swallowed — the COMMIT then degrades into a silent ROLLBACK.
 *
 * Behaviour: always throws, in every environment, production included. This is
 * a deterministic programming error (the wrong function called in the wrong
 * context) — not a condition that only "emerges" in production and can be
 * tolerated there. Logging and continuing in production is the exact silent
 * data-loss scenario this guard exists to prevent, only with an extra log line.
 * Failing the single request with a 500 is strictly better than returning 2xx
 * over an audit entry that was never written.
 *
 * @param db     - Candidate tenant client.
 * @param caller - Function name, used in the diagnostic message.
 */
export function assertNonTransactionalDb(db: unknown, caller: string): void {
  if (!isTransactionClient(db)) return;

  const message =
    `${caller} received an interactive $transaction client. It must run on a ` +
    `non-transactional client (see withTenantDb): a failure here would abort ` +
    `the surrounding transaction (SQLSTATE 25P02) and turn its COMMIT into a ` +
    `silent ROLLBACK.`;

  logger.error({ caller }, message);
  throw new Error(message);
}

/**
 * Executes a database callback within the current tenant's schema.
 *
 * Reuses the cached TenantPrismaClient for the tenant's schema (ADR-027) —
 * a client connected via the `?schema=<schemaName>` connection URL parameter,
 * created on first access and owned by the LRU cache (tenant-db-cache.ts).
 * The client is NOT disconnected when the callback returns or throws: it
 * outlives the request; the cache owns its lifecycle (LRU + TTL eviction,
 * deprovisioning invalidation, shutdown drain).
 *
 * @param fn      - Callback that receives a TenantPrismaClient instance.
 * @param context - Tenant context. Pass `request.tenantContext` from Fastify
 *                  route handlers (required in Fastify v5 — AsyncLocalStorage
 *                  does not propagate from preHandler to route handler).
 *                  Falls back to AsyncLocalStorage for non-Fastify call sites.
 *
 * @example — Fastify route handler (pass context explicitly):
 *   fastify.get('/path', { preHandler: [tenantContextMiddleware] }, async (req) => {
 *     const workspaces = await withTenantDb(
 *       (db) => db.workspace.findMany(),
 *       req.tenantContext
 *     );
 *   });
 */
export async function withTenantDb<T>(
  fn: (db: TenantPrismaClient) => Promise<T>,
  context?: TenantContext
): Promise<T> {
  // Use explicit context when provided (required in Fastify v5 route handlers).
  // Fall back to AsyncLocalStorage for non-Fastify call sites.
  const { schemaName } = context ?? getTenantContext();

  try {
    return await fn(getOrCreateTenantClient(schemaName));
  } finally {
    releaseTenantClient(schemaName);
  }
}

/**
 * Executes a database callback against the core schema using the singleton pool.
 *
 * Uses the global `prisma` singleton from database.ts (which manages a single
 * connection pool across the application). Do NOT create per-call PrismaClients
 * — that exhausts PostgreSQL connections and bypasses connection pooling.
 *
 * For admin-only endpoints (low frequency). Type-casts to CoreDbClient for
 * Prisma generics compatibility.
 *
 * @example
 *   const plugins = await withCoreDb((db) => db.plugin.findMany());
 */
export async function withCoreDb<T>(fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  return fn(coreDb);
}
