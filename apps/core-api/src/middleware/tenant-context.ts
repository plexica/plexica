import { AsyncLocalStorage } from 'async_hooks';
import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { tenantService } from '../services/tenant.service.js';

// Tenant context stored in AsyncLocalStorage
export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  schemaName: string;
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
 * 1. JWT token (tenant claim) - for authenticated requests
 * 2. X-Tenant-Slug header - for API requests
 * 3. Subdomain - for web requests (future)
 */
export async function tenantContextMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): Promise<void> {
  try {
    // Skip tenant context for certain routes
    const skipRoutes = ['/health', '/docs', '/api/tenants'];
    if (skipRoutes.some((route) => request.url.startsWith(route))) {
      return done();
    }

    let tenantSlug: string | undefined;

    // Method 1: Extract tenant from X-Tenant-Slug header
    const tenantHeader = request.headers['x-tenant-slug'];
    if (tenantHeader && typeof tenantHeader === 'string') {
      tenantSlug = tenantHeader;
    }

    // Method 2: Extract tenant from JWT token (to be implemented with auth)
    // const token = request.headers.authorization?.replace('Bearer ', '');
    // if (token) {
    //   const decoded = await verifyToken(token);
    //   tenantSlug = decoded.tenant;
    // }

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
        error: 'Bad Request',
        message: 'Tenant identification required. Provide X-Tenant-Slug header.',
      });
    }

    // Fetch tenant from database
    const tenant = await tenantService.getTenantBySlug(tenantSlug);

    if (!tenant) {
      return reply.code(404).send({
        error: 'Not Found',
        message: `Tenant '${tenantSlug}' not found`,
      });
    }

    // Check tenant status
    if (tenant.status !== 'ACTIVE') {
      return reply.code(403).send({
        error: 'Forbidden',
        message: `Tenant '${tenantSlug}' is not active (status: ${tenant.status})`,
      });
    }

    // Create tenant context
    const context: TenantContext = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      schemaName: tenantService.getSchemaName(tenant.slug),
    };

    // Store context in AsyncLocalStorage
    tenantContextStorage.run(context, () => {
      // Add context to request for easy access
      (request as any).tenant = context;
      done();
    });
  } catch (error) {
    request.log.error(error, 'Error in tenant context middleware');
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Failed to set tenant context',
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
 * Helper to execute a query in the current tenant's schema
 * 
 * Usage:
 * await executeInTenantSchema(prisma, async (client) => {
 *   return client.user.findMany();
 * });
 */
export async function executeInTenantSchema<T>(
  prismaClient: any,
  callback: (client: any) => Promise<T>
): Promise<T> {
  const schemaName = getCurrentTenantSchema();
  
  if (!schemaName) {
    throw new Error('No tenant context available');
  }

  // Set the schema for this query
  // Note: This is a simplified approach. In production, you might want to use
  // Prisma's multi-schema support or create separate Prisma clients per tenant
  await prismaClient.$executeRawUnsafe(`SET search_path TO "${schemaName}"`);

  try {
    return await callback(prismaClient);
  } finally {
    // Reset to default schema
    await prismaClient.$executeRawUnsafe(`SET search_path TO public, core`);
  }
}
