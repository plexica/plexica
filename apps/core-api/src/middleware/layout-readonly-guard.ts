/**
 * Layout Read-Only Field Enforcement Middleware — T014-12 (Spec 014)
 *
 * Opt-in middleware for plugin form submission endpoints.
 * Resolves the current user's layout, identifies fields marked `readonly`
 * for their effective role, and strips those field values from the request
 * body BEFORE the route handler runs.
 *
 * Also injects manifest default values for hidden-but-required fields so
 * that non-browser API consumers receive a valid body even when a required
 * field has been hidden by a tenant admin (P1-B / FR-010 server-side fix).
 *
 * This ensures server-side enforcement regardless of what the client sends.
 * The client-side read-only presentation is cosmetic only (FR-021, NFR-006).
 *
 * Usage:
 *   fastify.put('/my-plugin-form', {
 *     preHandler: [authMiddleware, layoutReadonlyGuard('my-plugin.my-form')],
 *   }, handler)
 *
 * Fail behaviour (NFR-006):
 *   - WRITE PATH (default): FAIL-CLOSED — if layout resolution fails (Redis down,
 *     DB unreachable, etc.) the request is rejected with 503 LAYOUT_RESOLUTION_UNAVAILABLE.
 *     This prevents bypassing read-only enforcement during infrastructure degradation.
 *   - READ DISPLAY PATH: resolveForUser() inside LayoutConfigService always fails open
 *     (returns manifest defaults) — that path is untouched by this middleware.
 *   - Override: pass `{ failOpen: true }` to revert to fail-open behaviour for routes
 *     where availability is more important than enforcement (advisory fields only).
 *
 * Constitution Compliance:
 *   - Article 1.2: Tenant isolation — resolution scoped to tenant from JWT
 *   - Article 5.1: Authoritative server-side enforcement of read-only fields
 *   - Article 6.2: Structured error response on fail-closed rejection
 *   - FR-010: Hidden required field default injection (server-side)
 *   - FR-021, NFR-006: Server-side read-only stripping — fail-closed on write path
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ResolvedField } from '@plexica/types';
import { layoutConfigService } from '../services/layout-config.service.js';
import { tenantService } from '../services/tenant.service.js';
import { logger } from '../lib/logger.js';

/**
 * Returns a Fastify preHandler that strips readonly field values for the
 * given `formId` from the request body before the route handler executes.
 *
 * Also injects manifest `defaultValue` for fields that are hidden AND
 * required, so that route handler validation does not reject the request
 * for a missing required field that the admin chose to hide (FR-010).
 *
 * @param formId  - The layout engine form identifier (e.g. "crm.contact-edit")
 * @param options - Optional configuration:
 *   - `workspaceIdParam` — name of the URL param holding the workspace ID
 *     (default: "workspaceId"). Set to null to always use tenant-scope resolution.
 *   - `failOpen` — if true, resolution failures allow the request through (fail-open).
 *     Default: false (fail-closed — 503 on resolution error). Use failOpen:true only
 *     for advisory fields where availability > enforcement.
 */
export function layoutReadonlyGuard(
  formId: string,
  options: { workspaceIdParam?: string | null; failOpen?: boolean } = {}
) {
  const { workspaceIdParam = 'workspaceId', failOpen = false } = options;

  return async function layoutReadonlyGuardMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    // Guard: auth must have run before this middleware
    if (!request.user) {
      // Should not happen in normal usage (authMiddleware always precedes this).
      // Even on the write path: no user → cannot enforce → fail-closed.
      logger.warn({ formId }, 'layout-readonly-guard: no user on request — rejecting');
      reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    // Guard: tenantSlug must be present on the JWT (set by authMiddleware)
    if (!request.user.tenantSlug) {
      logger.warn(
        { userId: request.user.id, formId },
        'layout-readonly-guard: missing tenantSlug on user — rejecting'
      );
      reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Tenant context required' },
      });
      return;
    }

    try {
      // 1. Resolve tenant context
      let tenantId: string;
      let tenantSlug: string;
      try {
        const tenant = await tenantService.getTenantBySlug(request.user.tenantSlug);
        tenantId = tenant.id;
        tenantSlug = tenant.slug;
      } catch {
        // Tenant not found — cannot enforce → fail-closed
        logger.warn(
          { tenantSlug: request.user.tenantSlug, formId },
          'layout-readonly-guard: tenant not found — rejecting (fail-closed)'
        );
        reply.code(503).send({
          error: {
            code: 'LAYOUT_RESOLUTION_UNAVAILABLE',
            message: 'Layout enforcement unavailable — please retry',
          },
        });
        return;
      }

      // 2. Determine workspace scope (if applicable)
      const workspaceId =
        workspaceIdParam && request.params && typeof request.params === 'object'
          ? ((request.params as Record<string, string>)[workspaceIdParam] ?? null)
          : null;

      // 3. Resolve the layout for this user
      const resolved = await layoutConfigService.resolveForUser(
        tenantId,
        tenantSlug,
        request.user.id,
        request.user.roles,
        formId,
        workspaceId
      );

      // 4. Collect readonly and hidden field IDs
      const readonlyFieldIds = new Set<string>(
        resolved.fields
          .filter((f: ResolvedField) => f.visibility === 'readonly')
          .map((f: ResolvedField) => f.fieldId)
      );
      const hiddenFieldIds = new Set<string>(
        resolved.fields
          .filter((f: ResolvedField) => f.visibility === 'hidden')
          .map((f: ResolvedField) => f.fieldId)
      );

      // 5. Only proceed with body mutation when body is a plain object
      const body = request.body;
      if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
        const mutableBody = body as Record<string, unknown>;

        // 5a. Strip readonly field values (collect BEFORE deletion — M02 fix)
        const strippedFieldIds: string[] = [];
        for (const fieldId of readonlyFieldIds) {
          if (Object.prototype.hasOwnProperty.call(mutableBody, fieldId)) {
            strippedFieldIds.push(fieldId);
          }
        }
        for (const fieldId of strippedFieldIds) {
          delete mutableBody[fieldId];
        }

        if (strippedFieldIds.length > 0) {
          logger.info(
            {
              formId,
              tenantId,
              userId: request.user.id,
              strippedFields: strippedFieldIds,
            },
            'layout-readonly-guard: stripped readonly fields from request body'
          );
        }

        // 5b. Inject manifest default values for hidden-but-required fields (P1-B / FR-010).
        //     When an admin hides a required field, non-browser clients get a validation
        //     error unless the server injects the manifest default before the handler runs.
        //     We only inject when the field is absent from the body (don't override a
        //     value the client explicitly sent — hidden fields may still carry a value
        //     that the client supplied before the layout was configured).
        if (hiddenFieldIds.size > 0) {
          const formSchema = await layoutConfigService
            .getFormSchema(tenantId, formId)
            .catch(() => null);
          if (formSchema) {
            const injectedFieldIds: string[] = [];
            for (const manifestField of formSchema.fields) {
              if (
                manifestField.required &&
                hiddenFieldIds.has(manifestField.fieldId) &&
                !Object.prototype.hasOwnProperty.call(mutableBody, manifestField.fieldId) &&
                manifestField.defaultValue !== undefined
              ) {
                mutableBody[manifestField.fieldId] = manifestField.defaultValue;
                injectedFieldIds.push(manifestField.fieldId);
              }
            }
            if (injectedFieldIds.length > 0) {
              logger.info(
                {
                  formId,
                  tenantId,
                  userId: request.user.id,
                  injectedFields: injectedFieldIds,
                },
                'layout-readonly-guard: injected manifest defaults for hidden required fields'
              );
            }
          }
        }
      }
    } catch (err) {
      if (failOpen) {
        // Explicit opt-in fail-open: log warning and let the request proceed unchanged
        logger.warn(
          { formId, userId: request.user?.id, err },
          'layout-readonly-guard: resolution error — skipping enforcement (fail-open by option)'
        );
      } else {
        // Default fail-closed: reject with 503 so readonly fields cannot be bypassed
        // during infrastructure degradation (NFR-006, Constitution Art. 5.1)
        logger.error(
          { formId, userId: request.user?.id, err },
          'layout-readonly-guard: resolution error — rejecting request (fail-closed)'
        );
        reply.code(503).send({
          error: {
            code: 'LAYOUT_RESOLUTION_UNAVAILABLE',
            message: 'Layout enforcement unavailable — please retry',
          },
        });
        return; // TD-037: prevent "reply already sent" log noise on Redis failure
      }
    }
  };
}
