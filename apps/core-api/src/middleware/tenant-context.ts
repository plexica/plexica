import { AsyncLocalStorage } from 'async_hooks';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { Prisma } from '@plexica/database';
import { tenantService } from '../services/tenant.service.js';
import { validateCustomHeaders, logSuspiciousHeader } from '../lib/header-validator.js';

// Tenant context stored in AsyncLocalStorage
export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  schemaName: string;
  workspaceId?: string; // Optional: Current workspace for workspace-scoped operations
  userId?: string; // Optional: Current user ID for user-scoped operations
}

// AsyncLocalStorage instance for tenant context
export const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Get current tenant context from AsyncLocalStorage
 */
export function getTenantContext(): TenantContext | undefined {
  return tenantContextStorage.getStore();
}

/**
 * Fastify hook to extract tenant from request and set context
 *
 * The tenant can be identified by:
 * 1. JWT token (tenant claim) - for authenticated requests (primary method)
 * 2. X-Tenant-Slug header - for public/unauthenticated requests (fallback)
 * 3. Subdomain - for web requests (future)
 *
 * Constitution Compliance:
 * - Article 1.2: Multi-Tenancy Isolation via JWT-based tenant extraction
 * - Article 6.2: Constitution-compliant error format
 * - Article 6.3: Structured logging with Pino
 */
export async function tenantContextMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Skip tenant context for certain routes
    const skipRoutes = ['/health', '/docs', '/api/tenants'];
    if (skipRoutes.some((route) => request.url.startsWith(route))) {
      return;
    }

    let tenantSlug: string | undefined;

    // Method 1: Extract tenant from JWT token (primary method for authenticated requests)
    // authMiddleware sets request.user.tenantSlug from the JWT token's realm claim
    const user = (request as any).user;
    if (user && user.tenantSlug) {
      tenantSlug = user.tenantSlug;
    }

    // Method 2: Fallback to X-Tenant-Slug header for public/unauthenticated requests
    if (!tenantSlug) {
      // SECURITY: Validate and extract custom headers
      const headerValidation = validateCustomHeaders(request.headers);

      // Log any header validation errors
      if (headerValidation.errors.length > 0) {
        headerValidation.errors.forEach((error) => {
          logSuspiciousHeader('custom-header', JSON.stringify(request.headers), error);
        });
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid header format',
            details: headerValidation.errors,
          },
        });
      }

      // Use validated tenant slug from header
      if (headerValidation.tenantSlug) {
        tenantSlug = headerValidation.tenantSlug;
      }
    }

    // Method 3: Extract tenant from subdomain (future)
    // const host = request.headers.host;
    // if (host) {
    //   const subdomain = extractSubdomain(host);
    //   if (subdomain) {
    //     tenantSlug = subdomain;
    //   }
    // }

    if (!tenantSlug) {
      return reply.code(400).send({
        error: {
          code: 'TENANT_IDENTIFICATION_REQUIRED',
          message:
            'Tenant identification required. Authenticate with JWT or provide X-Tenant-Slug header.',
        },
      });
    }

    // Fetch tenant from database
    const tenant = await tenantService.getTenantBySlug(tenantSlug);

    if (!tenant) {
      return reply.code(404).send({
        error: {
          code: 'TENANT_NOT_FOUND',
          message: `Tenant '${tenantSlug}' not found`,
          details: {
            tenantSlug,
          },
        },
      });
    }

    // Check tenant status
    if (tenant.status !== 'ACTIVE') {
      return reply.code(403).send({
        error: {
          code: 'TENANT_NOT_ACTIVE',
          message: `Tenant '${tenantSlug}' is not active (status: ${tenant.status})`,
          details: {
            tenantSlug,
            status: tenant.status,
          },
        },
      });
    }

    // Create tenant context
    const context: TenantContext = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      schemaName: tenantService.getSchemaName(tenant.slug),
      // SECURITY: Set workspace ID if provided and validated
      workspaceId: user ? undefined : validateCustomHeaders(request.headers).workspaceId,
    };

    // Store context in AsyncLocalStorage using enterWith
    // This makes the context available for the rest of this async execution chain
    tenantContextStorage.enterWith(context);

    // Also add context to request for easy access
    (request as any).tenant = context;

    // NOTE: User sync to tenant schema is now handled asynchronously via UserSyncConsumer
    // (Phase 5, FR-007) - no request-time UPSERT needed
  } catch (error) {
    // Handle tenant-not-found separately (getTenantBySlug throws instead of returning null)
    if (error instanceof Error && error.message === 'Tenant not found') {
      const tenantSlug =
        (request as any).user?.tenantSlug ||
        (request.headers['x-tenant-slug'] as string) ||
        'unknown';

      request.log.warn(
        { tenantSlug, error: error.message },
        'Tenant not found in tenant-context middleware'
      );

      return reply.code(404).send({
        error: {
          code: 'TENANT_NOT_FOUND',
          message: `Tenant '${tenantSlug}' not found`,
          details: {
            tenantSlug,
          },
        },
      });
    }

    request.log.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Error in tenant context middleware'
    );
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to set tenant context',
      },
    });
  }
}

/**
 * Decorator to add tenant context type to FastifyRequest
 */
declare module 'fastify' {
  interface FastifyRequest {
    tenant?: TenantContext;
  }
}

/**
 * Helper to get schema name for current tenant
 */
export function getCurrentTenantSchema(): string | undefined {
  const context = getTenantContext();
  return context?.schemaName;
}

/**
 * Get current workspace ID from context
 * @throws Error if no workspace context is set
 */
export function getWorkspaceIdOrThrow(): string {
  const context = getTenantContext();
  if (!context) {
    throw new Error('No tenant context available');
  }
  if (!context.workspaceId) {
    throw new Error('No workspace context available');
  }
  return context.workspaceId;
}

/**
 * Get current workspace ID from context (returns undefined if not set)
 */
export function getWorkspaceId(): string | undefined {
  const context = getTenantContext();
  return context?.workspaceId;
}

/**
 * Set workspace ID in current context
 * Note: This should only be called by workspace middleware
 */
export function setWorkspaceId(workspaceId: string): void {
  const context = getTenantContext();
  if (!context) {
    throw new Error('No tenant context available');
  }
  context.workspaceId = workspaceId;
}

/**
 * Get current user ID from context
 */
export function getUserId(): string | undefined {
  const context = getTenantContext();
  return context?.userId;
}

/**
 * Set user ID in current context
 * Note: This should only be called by auth middleware
 */
export function setUserId(userId: string): void {
  const context = getTenantContext();
  if (!context) {
    throw new Error('No tenant context available');
  }
  context.userId = userId;
}

/**
 * Helper to execute a query in the current tenant's schema
 *
 * Usage:
 * await executeInTenantSchema(prisma, async (client) => {
 *   return client.user.findMany();
 * }, tenantContext);
 */
export async function executeInTenantSchema<T>(
  prismaClient: any,
  callback: (client: any) => Promise<T>,
  tenantCtx?: TenantContext
): Promise<T> {
  const context = tenantCtx || getTenantContext();
  const schemaName = context?.schemaName;

  if (!schemaName) {
    throw new Error('No tenant context available');
  }

  // Validate schema name to prevent SQL injection
  // Only allow lowercase alphanumeric characters and underscores
  if (!/^[a-z0-9_]+$/.test(schemaName)) {
    throw new Error(`Invalid schema name: ${schemaName}`);
  }

  // Set the schema for this query using parameterized query
  // Note: This is a simplified approach. In production, you might want to use
  // Prisma's multi-schema support or create separate Prisma clients per tenant
  const setSearchPath = Prisma.raw(`"${schemaName}"`);
  await prismaClient.$executeRaw`SET search_path TO ${setSearchPath}`;

  try {
    const result = await callback(prismaClient);
    return result;
  } finally {
    // Reset to default schema
    await prismaClient.$executeRaw`SET search_path TO public, core`;
  }
}
