// routes/tenant-provision.routes.ts
// POST /api/v1/admin/tenants — provision a new tenant with pre-flight conflict
// detection + platform audit logging (S5-401 / Feature 005-04).
//
// Mounted under the /api/v1/admin prefix by modules/admin/index.ts, so the
// route path here is RELATIVE (/tenants). requireSuperAdmin is applied BOTH
// at the admin scope and here per route (defense in depth).
//
// This route REPLACES the legacy POST /api/admin/tenants that lived in
// modules/tenant/tenant-routes.ts (route-ownership move per plan §3.4). The
// legacy route is removed when this module is registered. Conflict detection
// (core row + schema + realm + bucket) is delegated to the service, which
// throws TenantConflictError → serialized by the global error handler as
// 409 CONFLICT with a `conflictType` field.

import { z } from 'zod';

import { withCoreDb } from '../../../lib/tenant-database.js';
import { ValidationError } from '../../../lib/app-error.js';
import { slugSchema } from '../../../lib/tenant-schema-helpers.js';
import { requireSuperAdmin } from '../../../middleware/require-super-admin.js';
import { provisionTenantWithAudit } from '../services/tenant-provision.service.js';

import type { FastifyInstance, FastifyReply } from 'fastify';

const ProvisionTenantBodySchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(255),
  adminEmail: z.string().email(),
});

export async function tenantProvisionRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // ── POST /api/v1/admin/tenants ─────────────────────────────────────────────
  fastify.post(
    '/tenants',
    { preHandler: [requireSuperAdmin] },
    async (request, reply: FastifyReply) => {
      const parsed = ProvisionTenantBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(
          parsed.error.issues.map((i) => i.message).join(', ')
        );
      }

      const { slug, name, adminEmail } = parsed.data;
      const actorId = request.user.keycloakUserId;

      const result = await withCoreDb((prisma) =>
        provisionTenantWithAudit(prisma, { slug, name, adminEmail }, actorId)
      );

      return reply.status(201).send(result);
    }
  );
}
