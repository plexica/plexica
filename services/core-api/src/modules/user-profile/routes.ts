// routes.ts
// User-profile module Fastify plugin — registers GET/PATCH /profile and POST /profile/avatar.


import { authMiddleware } from '../../middleware/auth-middleware.js';
import { tenantContextMiddleware } from '../../middleware/tenant-context.js';
import { ValidationError } from '../../lib/app-error.js';
import { validateMimeType } from '../../lib/file-upload.js';
import { withTenantDb } from '../../lib/tenant-database.js';

import { updateProfileSchema } from './schema.js';
import { getProfile, updateProfile, uploadAvatar } from './service.js';

import type { FastifyInstance } from 'fastify';

const AVATAR_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const pre = [authMiddleware, tenantContextMiddleware];

export async function userProfileRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/v1/profile ───────────────────────────────────────────────────
  fastify.get('/api/v1/profile', { preHandler: pre }, async (request) => {
    return withTenantDb(
      (tx) => getProfile(tx, request.user.id, request.tenantContext),
      request.tenantContext
    );
  });

  // ── PATCH /api/v1/profile ─────────────────────────────────────────────────
  fastify.patch('/api/v1/profile', { preHandler: pre }, async (request) => {
    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
    }
    // Cast required because Zod infers optional fields as `T | undefined` which
    // conflicts with exactOptionalPropertyTypes. Runtime values are correct.
    const input = parsed.data as Parameters<typeof updateProfile>[2];

    return withTenantDb(
      (tx) => updateProfile(tx, request.user.id, input, request.tenantContext),
      request.tenantContext
    );
  });

  // ── POST /api/v1/profile/avatar ───────────────────────────────────────────
  fastify.post('/api/v1/profile/avatar', { preHandler: pre }, async (request, reply) => {
    const file = await request.file();
    if (file === undefined) {
      throw new ValidationError('No file uploaded');
    }
    validateMimeType(file.mimetype, AVATAR_ALLOWED_MIME_TYPES);
    const result = await withTenantDb(
      (tx) => uploadAvatar(tx, request.user.id, file, request.tenantContext),
      request.tenantContext
    );
    return reply.send({ data: result });
  });
}
