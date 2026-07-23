// ID-001: $queryRawUnsafe intentional — slug is regex-validated.
// ID-002: single error code for unknown/deleted prevents tenant enumeration.
// H-1: enterWithTenant() (AsyncLocalStorage.enterWith) so getTenantContext()
//      and withTenantDb() work in route handlers without param drilling.
// H-2: verifies request.user.realm matches the resolved tenant's realm.
// H-3: X-Tenant-Slug header is only accepted in non-production environments.
// ADR-022 Decision 1: reject non-admin requests for suspended / pending_deletion
//      tenants with 403; deleted stays 400 INVALID_TENANT_CONTEXT (anti-enumeration).
//
// M-01: tenant DB access uses withTenantDb(), backed by this request context.

import {
  InvalidTenantContextError,
  NotFoundError,
  TenantSuspendedError,
  TenantPendingDeletionError,
} from '../lib/app-error.js';
import { prisma } from '../lib/database.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { tenantSlugFromHost } from '../lib/tenant-host.js';
import { clearTenantLifecycle, writeTenantLifecycle } from '../lib/tenant-context-cache.js';
import { SLUG_REGEX } from '../lib/tenant-schema-helpers.js';
import { type TenantContext, enterWithTenant } from '../lib/tenant-context-store.js';
import { toRealmName, toSchemaName } from '../lib/tenant-schema-helpers.js';

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import type { TenantStatus } from '@prisma/client';

export async function clearTenantCache(slug: string, client?: Redis): Promise<void> {
  await clearTenantLifecycle(slug, client);
}

export async function publishTenantStatus(
  slug: string,
  id: string,
  status: TenantStatus,
  version: number,
  client?: Redis
): Promise<boolean> {
  return writeTenantLifecycle(slug, { id, status, version }, client);
}

function extractSlug(request: FastifyRequest): string | null {
  // H-3: Only accept X-Tenant-Slug override in non-production environments.
  if (config.NODE_ENV !== 'production') {
    const headerSlug = request.headers['x-tenant-slug'];
    if (typeof headerSlug === 'string' && headerSlug.length > 0) {
      return headerSlug;
    }
  }

  // Production (and fallback): resolve the validated first Host label.
  return tenantSlugFromHost(request.headers.host);
}

/**
 * Resolves authoritative tenant state and publishes a short-lived shared cache entry.
 * Exported for the plugin event-emission route (service-token path). Returns
 * null for unknown / `deleted` (ID-002 anti-enumeration) or `{ status, context:
 * null }` for `suspended` / `pending_deletion` so callers can reject with 403.
 */
export type ResolvedTenant =
  | { status: 'active'; context: TenantContext }
  | { status: 'suspended'; context: null }
  | { status: 'pending_deletion'; context: null };

export async function resolveTenant(slug: string, client?: Redis): Promise<ResolvedTenant | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, status: true, version: true },
  });

  // ID-002: unknown OR deleted → null (same generic 400, no enumeration leak).
  if (tenant === null || tenant.status === 'deleted') {
    if (tenant !== null) {
      await writeTenantLifecycle(slug, tenant, client);
    }
    return null;
  }

  // Inactive statuses are shared briefly so every replica rejects consistently.
  if (tenant.status !== 'active') {
    await writeTenantLifecycle(slug, tenant, client);
    return { status: tenant.status, context: null };
  }

  const context: TenantContext = {
    tenantId: tenant.id,
    slug: tenant.slug,
    schemaName: toSchemaName(tenant.slug),
    realmName: toRealmName(tenant.slug),
  };

  await writeTenantLifecycle(slug, tenant, client);
  return { status: 'active', context };
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

  // EC-01: missing tenant identifier — ID-002: generic error code.
  if (slug === null) {
    throw new InvalidTenantContextError();
  }

  // M-1: canonical SLUG_REGEX from tenant-schema-helpers (max 51 chars,
  // no trailing hyphens) — same regex used at provisioning time.
  if (!SLUG_REGEX.test(slug)) {
    throw new InvalidTenantContextError();
  }

  // P4-M-1: Check user presence BEFORE the tenant DB lookup to eliminate an
  // enumeration oracle — all no-auth requests return 404 before any DB call.
  const userRealm = request.user?.realm;
  if (userRealm === undefined) {
    logger.debug('Missing auth before tenant lookup — rejecting (P4-M-1)');
    throw new NotFoundError();
  }

  const resolved = await resolveTenant(slug);

  // EC-02: unknown or deleted tenant — ID-002: same generic error code as EC-01.
  if (resolved === null) {
    logger.debug({ slug }, 'Tenant not found or deleted');
    throw new InvalidTenantContextError();
  }

  const expectedRealm = toRealmName(slug);

  // H-2: Verify the JWT realm matches the tenant's realm to prevent cross-realm
  // access. Returns 404 per AC-2 (anti-enumeration). Checked BEFORE the status
  // 403 so a wrong-realm caller cannot learn a slug's suspended / pending_deletion state.
  if (userRealm !== expectedRealm) {
    logger.debug(
      { tokenRealm: userRealm, tenantRealm: expectedRealm },
      'Realm mismatch — rejecting request (H-2)'
    );
    throw new NotFoundError();
  }

  // ADR-022 Decision 1: reject non-admin requests for inactive tenants with 403.
  if (resolved.status === 'suspended') {
    throw new TenantSuspendedError();
  }
  if (resolved.status === 'pending_deletion') {
    throw new TenantPendingDeletionError();
  }

  // H-1: Wire AsyncLocalStorage so getTenantContext() and withTenantDb() work
  // in route handlers. enterWith() sets context for the remaining async tree.
  enterWithTenant(resolved.context);
  request.tenantContext = resolved.context;
}

declare module 'fastify' {
  interface FastifyRequest {
    tenantContext: TenantContext;
  }
}
