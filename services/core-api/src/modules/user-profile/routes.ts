// routes.ts
// User-profile module Fastify plugin — registers GET/PATCH /profile and POST /profile/avatar.
//
// NOTE: authMiddleware, tenantContextMiddleware, and userProfileResolver are
// registered as scope-level addHook('preHandler', ...) in index.ts and run
// automatically for every route in this plugin. Do NOT re-add them here.

import { Readable } from 'node:stream';

import { ValidationError } from '../../lib/app-error.js';
import { config } from '../../lib/config.js';
import {
  AVATAR_ALLOWED_MIME_TYPES,
  validateFileContent,
  validateFileSize,
  validateMimeType,
} from '../../lib/file-upload.js';
import { withTenantDb } from '../../lib/tenant-database.js';
import { UPLOAD_RATE_LIMIT } from '../../lib/rate-limit-config.js';

import { updateProfileSchema } from './schema.js';
import { getProfile, updateProfile, uploadAvatar } from './service.js';

import type { MultipartFile } from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';

export async function userProfileRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/v1/profile ───────────────────────────────────────────────────
  fastify.get('/api/v1/profile', {}, async (request) => {
    return withTenantDb(
      (db) => getProfile(db, request.user.keycloakUserId, request.tenantContext),
      request.tenantContext
    );
  });

  // ── PATCH /api/v1/profile ─────────────────────────────────────────────────
  fastify.patch('/api/v1/profile', {}, async (request) => {
    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
    }
    // Cast required because Zod infers optional fields as `T | undefined` which
    // conflicts with exactOptionalPropertyTypes. Runtime values are correct.
    const input = parsed.data as Parameters<typeof updateProfile>[2];

    return withTenantDb(
      (db) => updateProfile(db, request.user.keycloakUserId, input, request.tenantContext),
      request.tenantContext
    );
  });

  // ── POST /api/v1/profile/avatar ───────────────────────────────────────────
  // Returns the payload bare ({ avatarUrl }), like GET and PATCH above and like
  // every other tenant-scoped module. The previous { data: … } envelope was the
  // only one in this module and forced the client to special-case it.
  fastify.post(
    '/api/v1/profile/avatar',
    { config: { rateLimit: UPLOAD_RATE_LIMIT } },
    async (request) => {
      const file = await request.file();
      if (file === undefined) {
        throw new ValidationError('No file uploaded');
      }
      // 1. Cheap reject on the client-declared type, before buffering anything.
      //    The allowlist is imported, never restated — service.ts does not
      //    redeclare it (and does not re-validate at all: this route is its
      //    only caller, and step 2 below is already authoritative).
      validateMimeType(file.mimetype, AVATAR_ALLOWED_MIME_TYPES);

      // 2. Authoritative check on the real bytes. @fastify/multipart caps the
      //    part at 5 MB, so this buffer is bounded before our own size guard.
      const content = await file.toBuffer();
      validateFileSize(content.length, config.AVATAR_MAX_BYTES);
      validateFileContent(content, file.mimetype, AVATAR_ALLOWED_MIME_TYPES);

      // toBuffer() drains the part stream; hand the service an equivalent
      // readable so its own size guard and the MinIO streaming path are unchanged.
      const validated = {
        ...file,
        file: Readable.from(content) as unknown as MultipartFile['file'],
      };

      return withTenantDb(
        (db) => uploadAvatar(db, request.user.keycloakUserId, validated, request.tenantContext),
        request.tenantContext
      );
    }
  );
}
