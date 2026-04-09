// routes.ts
// Fastify plugin — tenant settings, branding, and auth-config routes.
// All routes require auth + tenant context + ABAC check.
// Implements: Spec 003, Phase 9
//
// NOTE: authMiddleware, tenantContextMiddleware, and userProfileResolver are
// registered as scope-level addHook('preHandler', ...) in index.ts and run
// automatically for every route in this plugin. Do NOT re-add them here.

import { requireAbac } from '../../middleware/abac.js';
import { withTenantDb } from '../../lib/tenant-database.js';
import { ValidationError } from '../../lib/app-error.js';

import { updateSettingsSchema, updateBrandingSchema, updateAuthConfigSchema } from './schema.js';
import { getSettings, updateSettings, getAuthConfig, updateAuthConfig } from './service.js';
import { getBranding, updateBranding } from './service-branding.js';

import type { FastifyInstance } from 'fastify';
import type { UpdateBrandingInput } from './types.js';

export async function tenantSettingsRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/v1/tenant/settings ──────────────────────────────────────────
  fastify.get(
    '/api/v1/tenant/settings',
    { preHandler: [requireAbac('settings:read')] },
    async (request) => {
      return getSettings(request.tenantContext);
    }
  );

  // ── PATCH /api/v1/tenant/settings ────────────────────────────────────────
  fastify.patch(
    '/api/v1/tenant/settings',
    { preHandler: [requireAbac('settings:update')] },
    async (request) => {
      const parsed = updateSettingsSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      }
      return withTenantDb(
        (tx) => updateSettings(tx, request.user.id, request.tenantContext, parsed.data),
        request.tenantContext
      );
    }
  );

  // ── GET /api/v1/tenant/branding ──────────────────────────────────────────
  fastify.get(
    '/api/v1/tenant/branding',
    { preHandler: [requireAbac('settings:read')] },
    async (request) => {
      return withTenantDb((tx) => getBranding(tx, request.tenantContext), request.tenantContext);
    }
  );

  // ── PATCH /api/v1/tenant/branding ────────────────────────────────────────
  fastify.patch(
    '/api/v1/tenant/branding',
    { preHandler: [requireAbac('branding:update')] },
    async (request) => {
      if (request.isMultipart()) {
        const parts = request.parts();
        const fields: Record<string, string> = {};
        let logoFile: import('@fastify/multipart').MultipartFile | undefined;

        for await (const part of parts) {
          if (part.type === 'file') {
            logoFile = part;
          } else {
            fields[part.fieldname] = part.value as string;
          }
        }

        const rawInput: Record<string, unknown> = {};
        if (fields['primaryColor'] !== undefined) rawInput['primaryColor'] = fields['primaryColor'];
        if (fields['darkMode'] !== undefined) rawInput['darkMode'] = fields['darkMode'] === 'true';

        const parsed = updateBrandingSchema.safeParse(rawInput);
        if (!parsed.success) {
          throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
        }
        const input = parsed.data as UpdateBrandingInput;

        return withTenantDb(
          (tx) => updateBranding(tx, request.user.id, request.tenantContext, input, logoFile),
          request.tenantContext
        );
      }

      const parsed = updateBrandingSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      }
      const input = parsed.data as UpdateBrandingInput;
      return withTenantDb(
        (tx) => updateBranding(tx, request.user.id, request.tenantContext, input),
        request.tenantContext
      );
    }
  );

  // ── GET /api/v1/tenant/auth-config ───────────────────────────────────────
  fastify.get(
    '/api/v1/tenant/auth-config',
    { preHandler: [requireAbac('auth:config-read')] },
    async (request) => {
      return getAuthConfig(request.tenantContext);
    }
  );

  // ── PATCH /api/v1/tenant/auth-config ─────────────────────────────────────
  fastify.patch(
    '/api/v1/tenant/auth-config',
    { preHandler: [requireAbac('auth:config-update')] },
    async (request) => {
      const parsed = updateAuthConfigSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      }
      // Cast required: Zod infers optional fields as T | undefined, which conflicts
      // with exactOptionalPropertyTypes. Runtime values are correct.
      const input = parsed.data as Parameters<typeof updateAuthConfig>[3];
      return withTenantDb(
        (tx) => updateAuthConfig(tx, request.user.id, request.tenantContext, input),
        request.tenantContext
      );
    }
  );
}
