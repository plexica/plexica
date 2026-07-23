// tenant-routes.ts
// Tenant API routes: resolve (public), migrate all (super_admin).
// Tenant provisioning (POST /api/admin/tenants) moved to the admin module
// (modules/admin/routes/tenant-provision.routes.ts) per plan §3.4 route
// ownership move. Admin routes use auth-only scope — no tenant context
// middleware (Decision log ID-003).
//
// H-03 fix: requireSuperAdmin (shared middleware) enforces that the token was
// issued by the Keycloak master realm. A tenant admin cannot escalate to
// super_admin by creating a role with the same name in their own realm.

import { authMiddleware } from '../../middleware/auth-middleware.js';
import { requireSuperAdmin } from '../../middleware/require-super-admin.js';
import { TenantRequiredError } from '../../lib/app-error.js';
import { rateLimitKey } from '../../lib/rate-limit-key.js';
import { config } from '../../lib/config.js';
import { prisma } from '../../lib/database.js';
import { SLUG_REGEX } from '../../lib/tenant-schema-helpers.js';
import { migrateAll } from '../../lib/multi-schema-migrate.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

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
  fastify.get(
    '/api/tenants/resolve',
    {
      config: {
        rateLimit: {
          max: config.RATE_LIMIT_RESOLVE_MAX,
          timeWindow: '1 minute',
          keyGenerator: (request) => request.ip,
        },
      },
    },
    async (request) => {
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

      request.log.info({ tenant: slug }, 'Tenant resolved');

      // NEW-H-3: return only { exists: true } — realm name is derived client-side
      return { exists: true };
    }
  );

  // ---------------------------------------------------------------------------
  // ADMIN SCOPE: auth required, no tenant context (ID-003)
  // Tenant provisioning (POST /api/admin/tenants) now lives in the admin
  // module under /api/v1/admin/tenants (S5-401). Only migrate-all remains here.
  // ---------------------------------------------------------------------------
  await fastify.register(async (adminScope) => {
    adminScope.addHook('preHandler', authMiddleware);

    // POST /api/admin/tenants/migrate-all — run migrations for all tenants
    // ADR-012: 2 req/5 min override — DDL-heavy operation, strict throttle.
    // hook:'preHandler' for same reason as above (user-keyed after auth).
    adminScope.post(
      '/api/admin/tenants/migrate-all',
      {
        preHandler: [requireSuperAdmin],
        config: {
          rateLimit: {
            max: 2,
            timeWindow: '5 minutes',
            hook: 'preHandler',
            keyGenerator: rateLimitKey,
          },
        },
      },
      async (_request, reply) => {
        const report = await migrateAll();
        const status = report.failed > 0 ? 207 : 200;
        return reply.status(status).send(report);
      }
    );
  });
};

export default tenantRoutes;
