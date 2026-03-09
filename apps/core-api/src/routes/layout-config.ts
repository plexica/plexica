/**
 * Layout Config Routes — Spec 014 Frontend Layout Engine
 *
 * Exposes 10 REST endpoints for managing tenant and workspace-scoped layout
 * configurations and serving resolved layouts to end users.
 *
 * Endpoints:
 *   T014-10 (tenant-scope):
 *     GET  /api/v1/layout-configs/forms                        — list configurable forms
 *     GET  /api/v1/layout-configs/:formId                      — get tenant config
 *     PUT  /api/v1/layout-configs/:formId                      — save tenant config
 *     POST /api/v1/layout-configs/:formId/revert               — revert tenant config
 *     DELETE /api/v1/layout-configs/:formId                    — delete tenant config
 *     GET  /api/v1/layout-configs/:formId/resolved             — resolved layout for user
 *
 *   T014-11 (workspace-scope):
 *     GET  /api/v1/workspaces/:workspaceId/layout-configs/:formId          — get workspace config
 *     PUT  /api/v1/workspaces/:workspaceId/layout-configs/:formId          — save workspace config
 *     POST /api/v1/workspaces/:workspaceId/layout-configs/:formId/revert   — revert workspace config
 *     DELETE /api/v1/workspaces/:workspaceId/layout-configs/:formId        — delete workspace config
 *
 * Authentication / Authorization:
 *   - All routes require `authMiddleware` (valid JWT).
 *   - TENANT_ADMIN mutations require `requireTenantAdmin` guard.
 *   - Workspace mutations require workspace ADMIN+ membership check (inline).
 *
 * Constitution Compliance:
 *   - Article 1.2 §2: All queries scoped to tenant via tenantSlug from JWT
 *   - Article 3.4: REST conventions, versioned `/api/v1` prefix, standard error format
 *   - Article 5.1: RBAC enforced on every mutation route
 *   - Article 6.2: { error: { code, message, details? } } format
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware, requireTenantAdmin } from '../middleware/auth.js';
import { layoutConfigService, DomainError } from '../services/layout-config.service.js';
import { tenantService } from '../services/tenant.service.js';
import { db } from '../lib/db.js';
import { saveLayoutConfigSchema } from '../schemas/layout-config.schema.js';
import type { SaveLayoutConfigInput } from '../schemas/layout-config.schema.js';

// ---------------------------------------------------------------------------
// Helper: resolve tenant context from JWT
// ---------------------------------------------------------------------------

interface TenantContext {
  tenantId: string;
  tenantSlug: string;
}

async function resolveTenantContext(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<TenantContext | null> {
  if (!request.user) {
    reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return null;
  }

  const { tenantSlug } = request.user;
  if (!tenantSlug) {
    reply.code(401).send({
      error: { code: 'UNAUTHORIZED', message: 'No tenant context in token' },
    });
    return null;
  }

  let tenant;
  try {
    tenant = await tenantService.getTenantBySlug(tenantSlug);
  } catch {
    reply.code(403).send({
      error: { code: 'FORBIDDEN', message: 'Tenant not found for authenticated user' },
    });
    return null;
  }

  if (!tenant) {
    reply.code(403).send({
      error: { code: 'FORBIDDEN', message: 'Tenant not found for authenticated user' },
    });
    return null;
  }

  return { tenantId: tenant.id, tenantSlug };
}

// ---------------------------------------------------------------------------
// Helper: map DomainError → HTTP response
// ---------------------------------------------------------------------------

function handleServiceError(err: unknown, reply: FastifyReply, request: FastifyRequest): void {
  if (err instanceof DomainError) {
    reply.code(err.statusCode).send({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  request.log.error({ err }, 'layout-config route: unexpected error');
  reply.code(500).send({
    error: { code: 'INTERNAL_ERROR', message },
  });
}

// ---------------------------------------------------------------------------
// Helper: validate PUT body with Zod
// ---------------------------------------------------------------------------

function parseBody(body: unknown, reply: FastifyReply): SaveLayoutConfigInput | null {
  const result = saveLayoutConfigSchema.safeParse(body);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request body validation failed',
        details,
      },
    });
    return null;
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function layoutConfigRoutes(fastify: FastifyInstance): Promise<void> {
  // H05 / T014-32: Gate all mutation routes (PUT, POST, DELETE) behind the
  // layout_engine_enabled tenant feature flag.  GET routes remain accessible
  // so that the resolved endpoint can always return manifest defaults.
  // Per Constitution Art. 9.1: feature flags required for all user-facing changes.
  fastify.addHook(
    'preHandler',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const mutationMethods = new Set(['PUT', 'POST', 'DELETE']);
      if (!mutationMethods.has(request.method)) return;

      // Resolved endpoint always allowed (serves manifest defaults when disabled)
      if (request.url.endsWith('/resolved')) return;

      // Resolve tenant from JWT so we can check the flag
      if (!request.user?.tenantSlug) return; // auth guard will handle missing user
      let tenantId: string | null = null;
      try {
        const tenant = await tenantService.getTenantBySlug(request.user.tenantSlug);
        tenantId = tenant?.id ?? null;
      } catch {
        return; // tenant resolution errors are handled by individual route guards
      }
      if (!tenantId) return;

      const enabled = await isLayoutEngineEnabled(tenantId);
      if (!enabled) {
        return void reply.code(404).send({
          error: {
            code: 'FEATURE_NOT_AVAILABLE',
            message: 'Layout engine is not enabled for this tenant',
          },
        });
      }
    }
  );

  // ==========================================================================
  // T014-10: Tenant-scope layout config routes
  // ==========================================================================

  /**
   * GET /api/v1/layout-configs/forms
   * List all configurable forms derived from enabled plugin manifests.
   * Auth: TENANT_ADMIN required.
   * Query params: ?page=1&pageSize=50 (pageSize max 100)
   * Plan §4.1
   */
  fastify.get<{ Querystring: { page?: string; pageSize?: string } }>(
    '/layout-configs/forms',
    { preHandler: [authMiddleware, requireTenantAdmin] },
    async (
      request: FastifyRequest<{ Querystring: { page?: string; pageSize?: string } }>,
      reply: FastifyReply
    ) => {
      const ctx = await resolveTenantContext(request, reply);
      if (!ctx) return;

      const page = Math.max(1, parseInt(request.query.page ?? '1', 10) || 1);
      const pageSize = Math.min(
        100,
        Math.max(1, parseInt(request.query.pageSize ?? '50', 10) || 50)
      );

      try {
        const result = await layoutConfigService.listConfigurableForms(
          ctx.tenantId,
          ctx.tenantSlug,
          page,
          pageSize
        );
        return reply.code(200).send(result);
      } catch (err) {
        handleServiceError(err, reply, request);
      }
    }
  );

  /**
   * GET /api/v1/layout-configs/:formId/resolved
   * Get fully resolved layout for the current authenticated user.
   * Auth: any authenticated user.
   * Query param: ?workspaceId= (optional)
   * Cache-Control: private, no-store
   * Plan §4.10
   *
   * NOTE: This route MUST be registered before /:formId to prevent "resolved"
   * being treated as a formId value.
   */
  fastify.get<{ Params: { formId: string }; Querystring: { workspaceId?: string } }>(
    '/layout-configs/:formId/resolved',
    { preHandler: [authMiddleware] },
    async (
      request: FastifyRequest<{
        Params: { formId: string };
        Querystring: { workspaceId?: string };
      }>,
      reply: FastifyReply
    ) => {
      const ctx = await resolveTenantContext(request, reply);
      if (!ctx) return;

      if (!request.user) {
        return reply
          .code(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      }

      const { formId } = request.params;
      const { workspaceId } = request.query;

      try {
        const resolved = await layoutConfigService.resolveForUser(
          ctx.tenantId,
          ctx.tenantSlug,
          request.user.id,
          request.user.roles,
          formId,
          workspaceId ?? null
        );

        reply.header('Cache-Control', 'private, no-store');
        return reply.code(200).send(resolved);
      } catch (err) {
        handleServiceError(err, reply, request);
      }
    }
  );

  /**
   * GET /api/v1/layout-configs/:formId
   * Get tenant-level layout config for a form.
   * Auth: TENANT_ADMIN required (raw config exposes admin policy — P2-A).
   * Plan §4.2
   */
  fastify.get<{ Params: { formId: string } }>(
    '/layout-configs/:formId',
    { preHandler: [authMiddleware, requireTenantAdmin] },
    async (request: FastifyRequest<{ Params: { formId: string } }>, reply: FastifyReply) => {
      const ctx = await resolveTenantContext(request, reply);
      if (!ctx) return;

      const { formId } = request.params;

      try {
        const config = await layoutConfigService.getConfig(ctx.tenantSlug, formId, 'tenant', null);

        if (!config) {
          return reply.code(404).send({
            error: {
              code: 'LAYOUT_CONFIG_NOT_FOUND',
              message: `No layout config found for form "${formId}"`,
            },
          });
        }

        reply.header('ETag', config.updatedAt.toISOString());
        return reply.code(200).send(config);
      } catch (err) {
        handleServiceError(err, reply, request);
      }
    }
  );

  /**
   * PUT /api/v1/layout-configs/:formId
   * Create or update tenant-level layout config.
   * Auth: TENANT_ADMIN required.
   * Headers: If-Match (optional ETag for optimistic concurrency)
   * Plan §4.3
   */
  fastify.put<{ Params: { formId: string }; Body: unknown }>(
    '/layout-configs/:formId',
    { preHandler: [authMiddleware, requireTenantAdmin] },
    async (
      request: FastifyRequest<{ Params: { formId: string }; Body: unknown }>,
      reply: FastifyReply
    ) => {
      const ctx = await resolveTenantContext(request, reply);
      if (!ctx) return;

      if (!request.user) {
        return reply
          .code(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      }

      const body = parseBody(request.body, reply);
      if (!body) return;

      // TD-038: Defence-in-depth size guard (Edge Case #6).
      // The Zod schema already rejects over-sized payloads in parseBody; this
      // call ensures the service-layer guard is also exercised in the request path.
      if (!layoutConfigService.validateSize(body)) {
        return reply.code(413).send({
          error: {
            code: 'LAYOUT_CONFIG_TOO_LARGE',
            message: 'Layout config payload exceeds the 256 KB limit',
          },
        });
      }

      const etag = request.headers['if-match'] ?? body.etag ?? null; // TD-034: body.etag fallback
      const { formId } = request.params;

      try {
        // H04 + NEW-M02: Reject the PUT if the plugin is not installed (formSchema === null).
        // Silently skipping validation would allow arbitrary fieldIds to be saved.
        const formSchema = await layoutConfigService.getFormSchema(ctx.tenantId, formId);
        if (!formSchema) {
          return reply.code(404).send({
            error: {
              code: 'PLUGIN_NOT_INSTALLED',
              message: `No plugin manifest found for form '${formId}'. Ensure the plugin is installed before configuring its layout.`,
            },
          });
        }

        const validation = layoutConfigService.validate(body, formSchema);
        if (!validation.valid) {
          return reply.code(400).send({
            error: {
              code: 'INVALID_FIELD_REFERENCE',
              message:
                'Layout config overrides reference field or column IDs not present in the plugin manifest schema',
              details: validation.invalidReferences,
            },
          });
        }

        const saved = await layoutConfigService.saveConfig(
          ctx.tenantId,
          ctx.tenantSlug,
          request.user.id,
          formId,
          'tenant',
          null,
          body,
          etag as string | null
        );

        return reply.code(200).send({
          id: saved.id,
          formId: saved.formId,
          updatedAt: saved.updatedAt,
        });
      } catch (err) {
        handleServiceError(err, reply, request);
      }
    }
  );

  /**
   * POST /api/v1/layout-configs/:formId/revert
   * Revert tenant-level config to previous version.
   * Auth: TENANT_ADMIN required.
   * Plan §4.4
   */
  fastify.post<{ Params: { formId: string } }>(
    '/layout-configs/:formId/revert',
    { preHandler: [authMiddleware, requireTenantAdmin] },
    async (request: FastifyRequest<{ Params: { formId: string } }>, reply: FastifyReply) => {
      const ctx = await resolveTenantContext(request, reply);
      if (!ctx) return;

      if (!request.user) {
        return reply
          .code(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      }

      const { formId } = request.params;

      try {
        const reverted = await layoutConfigService.revertConfig(
          ctx.tenantId,
          ctx.tenantSlug,
          request.user.id,
          formId,
          'tenant',
          null
        );

        return reply.code(200).send({
          id: reverted.id,
          formId: reverted.formId,
          updatedAt: reverted.updatedAt,
          source: 'reverted',
        });
      } catch (err) {
        handleServiceError(err, reply, request);
      }
    }
  );

  /**
   * DELETE /api/v1/layout-configs/:formId
   * Hard-delete tenant-level layout config (restores manifest defaults).
   * Auth: TENANT_ADMIN required.
   * Plan §4.5
   */
  fastify.delete<{ Params: { formId: string } }>(
    '/layout-configs/:formId',
    { preHandler: [authMiddleware, requireTenantAdmin] },
    async (request: FastifyRequest<{ Params: { formId: string } }>, reply: FastifyReply) => {
      const ctx = await resolveTenantContext(request, reply);
      if (!ctx) return;

      if (!request.user) {
        return reply
          .code(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      }

      const { formId } = request.params;

      try {
        await layoutConfigService.deleteConfig(
          ctx.tenantId,
          ctx.tenantSlug,
          request.user.id,
          formId,
          'tenant',
          null
        );

        return reply.code(204).send();
      } catch (err) {
        handleServiceError(err, reply, request);
      }
    }
  );

  // ==========================================================================
  // T014-11: Workspace-scope layout config routes
  // ==========================================================================

  /**
   * GET /api/v1/workspaces/:workspaceId/layout-configs/:formId
   * Get workspace-level layout config override.
   * Auth: any authenticated workspace member.
   * Plan §4.6
   */
  fastify.get<{ Params: { workspaceId: string; formId: string } }>(
    '/workspaces/:workspaceId/layout-configs/:formId',
    { preHandler: [authMiddleware] },
    async (
      request: FastifyRequest<{ Params: { workspaceId: string; formId: string } }>,
      reply: FastifyReply
    ) => {
      const ctx = await resolveTenantContext(request, reply);
      if (!ctx) return;

      const { workspaceId, formId } = request.params;

      // Verify workspace exists in this tenant
      const workspace = await db.workspace.findFirst({
        where: { id: workspaceId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!workspace) {
        return reply.code(404).send({
          error: { code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found' },
        });
      }

      try {
        const config = await layoutConfigService.getConfig(
          ctx.tenantSlug,
          formId,
          'workspace',
          workspaceId
        );

        if (!config) {
          return reply.code(404).send({
            error: {
              code: 'LAYOUT_CONFIG_NOT_FOUND',
              message: `No workspace layout config found for form "${formId}"`,
            },
          });
        }

        reply.header('ETag', config.updatedAt.toISOString());
        return reply.code(200).send(config);
      } catch (err) {
        handleServiceError(err, reply, request);
      }
    }
  );

  /**
   * PUT /api/v1/workspaces/:workspaceId/layout-configs/:formId
   * Create or update workspace-level layout config.
   * Auth: workspace ADMIN+ role required (ADR-024).
   * Plan §4.7
   */
  fastify.put<{ Params: { workspaceId: string; formId: string }; Body: unknown }>(
    '/workspaces/:workspaceId/layout-configs/:formId',
    { preHandler: [authMiddleware] },
    async (
      request: FastifyRequest<{ Params: { workspaceId: string; formId: string }; Body: unknown }>,
      reply: FastifyReply
    ) => {
      const ctx = await resolveTenantContext(request, reply);
      if (!ctx) return;

      if (!request.user) {
        return reply
          .code(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      }

      const { workspaceId, formId } = request.params;

      // Enforce workspace ADMIN+ role (ADR-024)
      const hasAccess = await checkWorkspaceAdminRole(
        ctx.tenantId,
        ctx.tenantSlug,
        workspaceId,
        request.user.id,
        request.user.roles
      );
      if (!hasAccess) {
        return reply.code(403).send({
          error: {
            code: 'INSUFFICIENT_WORKSPACE_ROLE',
            message: 'Workspace ADMIN or OWNER role required',
          },
        });
      }

      const body = parseBody(request.body, reply);
      if (!body) return;

      // TD-038: Defence-in-depth size guard (Edge Case #6) — mirrors tenant PUT handler.
      if (!layoutConfigService.validateSize(body)) {
        return reply.code(413).send({
          error: {
            code: 'LAYOUT_CONFIG_TOO_LARGE',
            message: 'Layout config payload exceeds the 256 KB limit',
          },
        });
      }

      const etag = request.headers['if-match'] ?? body.etag ?? null; // TD-034: body.etag fallback

      try {
        // H04 + NEW-M02: Reject the PUT if the plugin is not installed (formSchema === null).
        // Silently skipping validation would allow arbitrary fieldIds to be saved.
        const formSchema = await layoutConfigService.getFormSchema(ctx.tenantId, formId);
        if (!formSchema) {
          return reply.code(404).send({
            error: {
              code: 'PLUGIN_NOT_INSTALLED',
              message: `No plugin manifest found for form '${formId}'. Ensure the plugin is installed before configuring its layout.`,
            },
          });
        }

        const validation = layoutConfigService.validate(body, formSchema);
        if (!validation.valid) {
          return reply.code(400).send({
            error: {
              code: 'INVALID_FIELD_REFERENCE',
              message:
                'Layout config overrides reference field or column IDs not present in the plugin manifest schema',
              details: validation.invalidReferences,
            },
          });
        }

        const saved = await layoutConfigService.saveConfig(
          ctx.tenantId,
          ctx.tenantSlug,
          request.user.id,
          formId,
          'workspace',
          workspaceId,
          body,
          etag as string | null
        );

        return reply.code(200).send({
          id: saved.id,
          formId: saved.formId,
          updatedAt: saved.updatedAt,
        });
      } catch (err) {
        handleServiceError(err, reply, request);
      }
    }
  );

  /**
   * POST /api/v1/workspaces/:workspaceId/layout-configs/:formId/revert
   * Revert workspace-level config to previous version.
   * Auth: workspace ADMIN+ role required.
   * Plan §4.8
   */
  fastify.post<{ Params: { workspaceId: string; formId: string } }>(
    '/workspaces/:workspaceId/layout-configs/:formId/revert',
    { preHandler: [authMiddleware] },
    async (
      request: FastifyRequest<{ Params: { workspaceId: string; formId: string } }>,
      reply: FastifyReply
    ) => {
      const ctx = await resolveTenantContext(request, reply);
      if (!ctx) return;

      if (!request.user) {
        return reply
          .code(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      }

      const { workspaceId, formId } = request.params;

      const hasAccess = await checkWorkspaceAdminRole(
        ctx.tenantId,
        ctx.tenantSlug,
        workspaceId,
        request.user.id,
        request.user.roles
      );
      if (!hasAccess) {
        return reply.code(403).send({
          error: {
            code: 'INSUFFICIENT_WORKSPACE_ROLE',
            message: 'Workspace ADMIN or OWNER role required',
          },
        });
      }

      try {
        const reverted = await layoutConfigService.revertConfig(
          ctx.tenantId,
          ctx.tenantSlug,
          request.user.id,
          formId,
          'workspace',
          workspaceId
        );

        return reply.code(200).send({
          id: reverted.id,
          formId: reverted.formId,
          updatedAt: reverted.updatedAt,
          source: 'reverted',
        });
      } catch (err) {
        handleServiceError(err, reply, request);
      }
    }
  );

  /**
   * DELETE /api/v1/workspaces/:workspaceId/layout-configs/:formId
   * Hard-delete workspace-level layout config.
   * Auth: workspace ADMIN+ role required.
   * Plan §4.9
   */
  fastify.delete<{ Params: { workspaceId: string; formId: string } }>(
    '/workspaces/:workspaceId/layout-configs/:formId',
    { preHandler: [authMiddleware] },
    async (
      request: FastifyRequest<{ Params: { workspaceId: string; formId: string } }>,
      reply: FastifyReply
    ) => {
      const ctx = await resolveTenantContext(request, reply);
      if (!ctx) return;

      if (!request.user) {
        return reply
          .code(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
      }

      const { workspaceId, formId } = request.params;

      const hasAccess = await checkWorkspaceAdminRole(
        ctx.tenantId,
        ctx.tenantSlug,
        workspaceId,
        request.user.id,
        request.user.roles
      );
      if (!hasAccess) {
        return reply.code(403).send({
          error: {
            code: 'INSUFFICIENT_WORKSPACE_ROLE',
            message: 'Workspace ADMIN or OWNER role required',
          },
        });
      }

      try {
        await layoutConfigService.deleteConfig(
          ctx.tenantId,
          ctx.tenantSlug,
          request.user.id,
          formId,
          'workspace',
          workspaceId
        );

        return reply.code(204).send();
      } catch (err) {
        handleServiceError(err, reply, request);
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Helper: check layout_engine_enabled feature flag per tenant (H05 / T014-32)
//
// Reads the flag from core.tenants.settings->'features'->>'layout_engine_enabled'.
// Fail-open (returns true) when the tenant row is not found — this matches the
// overall fail-open philosophy of the layout engine (Constitution Art. 9.1).
// ---------------------------------------------------------------------------

async function isLayoutEngineEnabled(tenantId: string): Promise<boolean> {
  try {
    const rows = await db.$queryRaw<Array<{ layout_engine_enabled: string | null }>>`
      SELECT settings->'features'->>'layout_engine_enabled' AS layout_engine_enabled
      FROM "core"."tenants"
      WHERE id = ${tenantId}
      LIMIT 1
    `;
    // Absent flag → default enabled (fail-open per Constitution Art. 9.1)
    if (!rows.length || rows[0]?.layout_engine_enabled === null) return true;
    return rows[0]?.layout_engine_enabled !== 'false';
  } catch {
    // DB error → fail-open
    return true;
  }
}

// ---------------------------------------------------------------------------
// Helper: check workspace ADMIN+ membership (ADR-024)
//
// Returns true if the user holds OWNER or ADMIN role in the workspace,
// OR if the user is a TENANT_ADMIN / SUPER_ADMIN (they implicitly have access).
// ---------------------------------------------------------------------------

const WS_ADMIN_ROLES = new Set(['OWNER', 'ADMIN']);
const REALM_BYPASS_ROLES = new Set([
  'super_admin',
  'super-admin',
  'tenant_admin',
  'tenant-admin',
  'tenant_owner',
  'admin',
]);

async function checkWorkspaceAdminRole(
  tenantId: string,
  _tenantSlug: string,
  workspaceId: string,
  userId: string,
  keycloakRoles: string[]
): Promise<boolean> {
  // Tenant/super admins bypass workspace role check
  if (keycloakRoles.some((r) => REALM_BYPASS_ROLES.has(r))) {
    return true;
  }

  // Verify workspace belongs to tenant
  const workspace = await db.workspace.findFirst({
    where: { id: workspaceId, tenantId },
    select: { id: true },
  });
  if (!workspace) return false;

  // Check workspace membership directly (ADR-024)
  const members = await db.workspaceMember.findMany({
    where: { userId, workspaceId },
    select: { role: true },
  });

  if (members.length === 0) return false;
  return members.some((m: { role: string }) => WS_ADMIN_ROLES.has(m.role));
}
