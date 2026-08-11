// tenant-database.ts
// Tenant-scoped database access using a dedicated TenantPrismaClient.
//
// ARCHITECTURE NOTE (Decision Log ID-001 follow-up):
// The original implementation used `prisma.$transaction` with `SET LOCAL search_path`.
// This approach failed because the core Prisma client only knows core-schema models
// (Tenant, TenantConfig, …) and cannot access tenant-schema models (workspace,
// workspaceMember, invitation, auditLog, userProfile, …).
//
// The correct solution: create a TenantPrismaClient per request using the
// `?schema=<schemaName>` connection URL parameter. This is the same pattern
// already used by db.helpers.ts (buildTenantClient) and tested in integration.
//
// Trade-off: one extra PrismaClient per request (no connection pooling for
// tenant schemas). Acceptable for v2 phase 1; a PgBouncer/Prisma Accelerate
// layer can be added later if connection limits become a concern.
//
// M-04 NOTE: Fastify v5 runs each hook and route handler in its own
// async execution scope, so AsyncLocalStorage.enterWith() set in a
// preHandler does NOT propagate to the route handler. Route handlers
// must pass req.tenantContext explicitly as the second argument.
// The AsyncLocalStorage fallback (getTenantContext) is preserved for
// non-Fastify call sites (e.g. CLI scripts, standalone utilities).

import { PrismaClient } from '@prisma/client';

// @ts-ignore — generated at build time via 'pnpm db:generate'; not present in git checkout
import { PrismaClient as TenantPrismaClient } from '../../prisma/generated/tenant-client/index.js';

import { prisma as coreDb } from './database.js';
import { logger } from './logger.js';
import { getTenantContext } from './tenant-context-store.js';

import type { TenantContext } from './tenant-context-store.js';

export type { TenantPrismaClient };

// ---------------------------------------------------------------------------
// Transaction-client detection (runtime guard)
//
// WHY A RUNTIME GUARD AND NOT A BRANDED TYPE
// The obvious compile-time defence — brand the client returned by
// `withTenantDb` so that a `Prisma.TransactionClient` fails to typecheck — was
// evaluated and rejected on evidence:
//
//   1. TYPE ERASURE IS CONDITIONAL. The `@ts-ignore` on the tenant-client
//      import above only erases the type when `prisma/generated/` is absent
//      (it is .gitignored). Measured: with the client generated, the type is
//      real; on a fresh checkout it collapses to `any` and any brand silently
//      evaporates. A guarantee that depends on whether someone has run
//      `pnpm db:generate` is not a guarantee.
//   2. THE CALL SITES ARE ALREADY TYPE-ERASED. Every consumer of the tenant
//      client declares its parameter as `tenantDb: unknown` (workspace-member,
//      user-profile, invitation, tenant-settings, user-management, workspace…).
//      `unknown` is not assignable to a branded type, so branding would break
//      ~13 call sites; making it compile would mean threading the brand
//      through those modules first.
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
 * Creates a TenantPrismaClient connected to the tenant's schema via the
 * `?schema=<schemaName>` connection URL parameter, runs the callback,
 * then disconnects. On error the client is disconnected and the error
 * is re-thrown.
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
  fn: (db: InstanceType<typeof TenantPrismaClient>) => Promise<T>,
  context?: TenantContext
): Promise<T> {
  // Use explicit context when provided (required in Fastify v5 route handlers).
  // Fall back to AsyncLocalStorage for non-Fastify call sites.
  const { schemaName } = context ?? getTenantContext();

  const baseUrl = process.env['DATABASE_URL'] ?? '';
  const tenantUrl = baseUrl.includes('?')
    ? `${baseUrl}&schema=${schemaName}`
    : `${baseUrl}?schema=${schemaName}`;

  const tenantDb = new TenantPrismaClient({ datasources: { db: { url: tenantUrl } } });
  try {
    return await fn(tenantDb);
  } finally {
    await tenantDb.$disconnect();
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
export async function withCoreDb<T>(
  fn: (db: PrismaClient) => Promise<T>
): Promise<T> {
  return fn(coreDb);
}
