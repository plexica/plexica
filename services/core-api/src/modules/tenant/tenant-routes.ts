// tenant-routes.ts
// Tenant API routes: resolve (public), create tenant (super_admin), migrate all (super_admin).
// Admin routes use auth-only scope — no tenant context middleware (Decision log ID-003).
//
// H-03 fix: requireSuperAdmin now enforces that the token was issued by the Keycloak
// master realm. A tenant admin cannot escalate to super_admin by creating a role with
// the same name in their own realm.

import { z } from 'zod';

import { authMiddleware } from '../../middleware/auth-middleware.js';
import { TenantRequiredError, ValidationError, UnauthorizedError } from '../../lib/app-error.js';
import { rateLimitKey } from '../../lib/rate-limit-key.js';
import { config } from '../../lib/config.js';
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

// H-03 fix: enforces that the token was issued by the Keycloak master realm.
// A tenant admin who creates a 'super_admin' role in their own realm cannot
// call admin routes — only tokens from KEYCLOAK_MASTER_REALM are accepted.
function requireSuperAdmin(roles: string[], realm: string): void {
  if (realm !== config.KEYCLOAK_MASTER_REALM) {
    throw new UnauthorizedError('super_admin endpoints require a master realm token');
  }
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
  fastify.get(
    '/api/tenants/resolve',
    {
      config: {
        rateLimit: {
          max: 30,
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

      // NEW-H-3: return only { exists: true } — realm name is derived client-side
      return { exists: true };
    }
  );

  // ---------------------------------------------------------------------------
  // ADMIN SCOPE: auth required, no tenant context (ID-003)
  // ---------------------------------------------------------------------------
  await fastify.register(async (adminScope) => {
    adminScope.addHook('preHandler', authMiddleware);

    // POST /api/admin/tenants — provision a new tenant
    // ADR-012: 5 req/min override (stricter than global 100 req/min default).
    // hook:'preHandler' ensures keyGenerator runs AFTER authMiddleware has
    // populated request.user, enabling per-user rate-limit keying (HIGH-2 fix).
    adminScope.post(
      '/api/admin/tenants',
      {
        config: {
          rateLimit: {
            max: 5,
            timeWindow: '1 minute',
            hook: 'preHandler',
            keyGenerator: rateLimitKey,
          },
        },
      },
      async (request, reply) => {
        requireSuperAdmin(request.user.roles, request.user.realm);

        const parseResult = createTenantBody.safeParse(request.body);
        if (!parseResult.success) {
          throw new ValidationError(parseResult.error.issues.map((i) => i.message).join(', '));
        }

        const { slug, name, adminEmail } = parseResult.data;
        const result = await provisionTenant({ slug, name, adminEmail });

        return reply.status(201).send(result);
      }
    );

    // POST /api/admin/tenants/migrate-all — run migrations for all tenants
    // ADR-012: 2 req/5 min override — DDL-heavy operation, strict throttle.
    // hook:'preHandler' for same reason as above (user-keyed after auth).
    adminScope.post(
      '/api/admin/tenants/migrate-all',
      {
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
        requireSuperAdmin(_request.user.roles, _request.user.realm);

        const report = await migrateAll();
        const status = report.failed > 0 ? 207 : 200;
        return reply.status(status).send(report);
      }
    );
  });
};

export default tenantRoutes;
