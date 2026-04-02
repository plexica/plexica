// tenant-routes.ts
// Tenant API routes: resolve (public), create tenant (super_admin), migrate all (super_admin).
// Admin routes use auth-only scope — no tenant context middleware (Decision log ID-003).

import { z } from 'zod';


import { authMiddleware } from '../../middleware/auth-middleware.js';
import { TenantRequiredError, ValidationError, UnauthorizedError } from '../../lib/app-error.js';
import { prisma } from '../../lib/database.js';
import { slugSchema, SLUG_REGEX } from '../../lib/tenant-schema-helpers.js';
import { migrateAll } from '../../lib/multi-schema-migrate.js';

import { provisionTenant } from './tenant-provisioning.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

// L-2: Use the canonical slugSchema from tenant-schema-helpers so that route
// validation is consistent with provisioning validation (same regex, same limits).
const createTenantBody = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(255),
  adminEmail: z.string().email(),
});

function requireSuperAdmin(roles: string[]): void {
  if (!roles.includes('super_admin')) {
    throw new UnauthorizedError('super_admin role required');
  }
}

const tenantRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // ---------------------------------------------------------------------------
  // PUBLIC: GET /api/tenants/resolve?slug=…
  // Always returns HTTP 200 — never reveals whether a slug is valid or not (anti-enumeration).
  // Returns { exists: true } for known tenants, { exists: false } otherwise.
  // NEW-H-3: (1) Validates slug with SLUG_REGEX before DB lookup to prevent injection.
  //          (2) Does NOT return keycloakRealm — frontend derives realm via toRealmName()
  //              convention; exposing the internal realm name to unauthenticated callers
  //              aids enumeration attacks.
  // ---------------------------------------------------------------------------
  fastify.get('/api/tenants/resolve', async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const slug = query['slug'];

    if (slug === undefined || slug.trim() === '') {
      throw new TenantRequiredError();
    }

    // NEW-H-3: validate slug format before touching the DB
    if (!SLUG_REGEX.test(slug)) {
      throw new TenantRequiredError();
    }

    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { status: true },
    });

    if (tenant === null || tenant.status !== 'active') {
      return { exists: false };
    }

    // NEW-H-3: return only { exists: true } — realm name is derived client-side
    return { exists: true };
  });

  // ---------------------------------------------------------------------------
  // ADMIN SCOPE: auth required, no tenant context (ID-003)
  // ---------------------------------------------------------------------------
  await fastify.register(async (adminScope) => {
    adminScope.addHook('preHandler', authMiddleware);

    // POST /api/admin/tenants — provision a new tenant
    adminScope.post('/api/admin/tenants', async (request, reply) => {
      requireSuperAdmin(request.user.roles);

      const parseResult = createTenantBody.safeParse(request.body);
      if (!parseResult.success) {
        throw new ValidationError(parseResult.error.issues.map((i) => i.message).join(', '));
      }

      const { slug, name, adminEmail } = parseResult.data;
      const result = await provisionTenant({ slug, name, adminEmail });

      return reply.status(201).send(result);
    });

    // POST /api/admin/tenants/migrate-all — run migrations for all tenants
    adminScope.post('/api/admin/tenants/migrate-all', async (_request, reply) => {
      requireSuperAdmin(_request.user.roles);

      const report = await migrateAll();
      const status = report.failed > 0 ? 207 : 200;
      return reply.status(status).send(report);
    });
  });
};

export default tenantRoutes;
