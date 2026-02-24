// apps/core-api/src/routes/policies.ts
//
// ABAC policy management API — 4 endpoints for policy CRUD.
// Spec 003 Task 4.5 — FR-007–FR-009, FR-017, NFR-010, plan §3.10–§3.13, Appendix C
//
// Feature-flag behavior (Appendix C):
//   GET  /v1/policies        → returns empty array with meta.featureEnabled=false
//   POST/PUT/DELETE          → returns 404 FEATURE_NOT_AVAILABLE
//
// Source immutability (FR-009):
//   source='core'|'plugin'   → 403 POLICY_SOURCE_IMMUTABLE on PUT/DELETE
//
// Constitution Compliance:
//   - Art. 1.2: Tenant isolation via tenantContextMiddleware
//   - Art. 3.4: REST naming convention (/api/v1/policies)
//   - Art. 5.1: requirePermission() on all protected endpoints
//   - Art. 6.2: Standard { error: { code, message, details? } } error format
//   - NFR-010: Write endpoints protected by authzRateLimiter

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware, requirePermission } from '../middleware/auth.js';
import { tenantContextMiddleware } from '../middleware/tenant-context.js';
import { tenantService } from '../services/tenant.service.js';
import {
  policyService,
  PolicyNotFoundError,
  PolicyNameConflictError,
  PolicySourceImmutableError,
  FeatureNotAvailableError,
  ConditionTreeInvalidError,
} from '../modules/authorization/policy.service.js';
import { authzRateLimiter } from '../modules/authorization/guards/rate-limiter.guard.js';
import { CreatePolicySchema } from '../modules/authorization/dto/create-policy.dto.js';
import { UpdatePolicySchema } from '../modules/authorization/dto/update-policy.dto.js';
import { logger } from '../lib/logger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve tenantId + schemaName from request context (set by tenantContextMiddleware) */
function resolveTenantContext(request: FastifyRequest): { tenantId: string; schemaName: string } {
  const tenant = (request as any).tenant as { tenantId: string; tenantSlug: string } | undefined;
  if (!tenant?.tenantId || !tenant?.tenantSlug) {
    throw new Error('Tenant context not available on request');
  }
  return {
    tenantId: tenant.tenantId,
    schemaName: tenantService.getSchemaName(tenant.tenantSlug),
  };
}

/** Map service errors to HTTP status codes */
function mapServiceError(error: unknown): {
  statusCode: number;
  code: string;
  message: string;
  details?: object;
} {
  if (error instanceof PolicyNotFoundError) {
    return { statusCode: 404, code: error.code, message: error.message };
  }
  if (error instanceof PolicyNameConflictError) {
    return { statusCode: 409, code: error.code, message: error.message };
  }
  if (error instanceof PolicySourceImmutableError) {
    return { statusCode: 403, code: error.code, message: error.message };
  }
  if (error instanceof FeatureNotAvailableError) {
    return { statusCode: 404, code: error.code, message: error.message };
  }
  if (error instanceof ConditionTreeInvalidError) {
    return {
      statusCode: 422,
      code: error.code,
      message: error.message,
      details: { errors: error.details },
    };
  }
  // Unknown error — log and return generic 500
  logger.error({ error }, 'Unexpected error in policies route');
  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  };
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function policiesRoutes(fastify: FastifyInstance): Promise<void> {
  const authChain = [authMiddleware, tenantContextMiddleware];
  const authWriteChain = [authMiddleware, tenantContextMiddleware, authzRateLimiter];

  // -------------------------------------------------------------------------
  // GET /api/v1/policies — list policies (paginated, feature-flag aware)
  // FR-007, FR-009, FR-017, Appendix C, plan §3.10
  // -------------------------------------------------------------------------
  fastify.get(
    '/v1/policies',
    {
      preHandler: [...authChain, requirePermission('policies:read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { tenantId, schemaName } = resolveTenantContext(request);
        const query = request.query as Record<string, string>;

        const filters = {
          resource: query.resource,
          effect: query.effect as 'DENY' | 'FILTER' | undefined,
          isActive:
            query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined,
          page: query.page ? parseInt(query.page, 10) : 1,
          limit: query.limit ? Math.min(parseInt(query.limit, 10), 100) : 50,
        };

        const result = await policyService.listPolicies(tenantId, schemaName, filters);
        return reply.code(200).send(result);
      } catch (error) {
        const mapped = mapServiceError(error);
        return reply.code(mapped.statusCode).send({
          error: { code: mapped.code, message: mapped.message, details: mapped.details },
        });
      }
    }
  );

  // -------------------------------------------------------------------------
  // POST /api/v1/policies — create policy
  // FR-007, FR-008, Appendix C, plan §3.11
  // Returns 404 when ABAC feature flag is off.
  // Returns 422 when condition tree exceeds limits.
  // -------------------------------------------------------------------------
  fastify.post(
    '/v1/policies',
    {
      preHandler: [...authWriteChain, requirePermission('policies:write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { tenantId, schemaName } = resolveTenantContext(request);

        const parseResult = CreatePolicySchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid request body',
              details: parseResult.error.flatten(),
            },
          });
        }

        const policy = await policyService.createPolicy(tenantId, schemaName, parseResult.data);
        return reply.code(201).send(policy);
      } catch (error) {
        const mapped = mapServiceError(error);
        return reply.code(mapped.statusCode).send({
          error: { code: mapped.code, message: mapped.message, details: mapped.details },
        });
      }
    }
  );

  // -------------------------------------------------------------------------
  // PUT /api/v1/policies/:id — update policy
  // FR-007, FR-009, plan §3.12
  // Returns 403 POLICY_SOURCE_IMMUTABLE for core/plugin policies.
  // -------------------------------------------------------------------------
  fastify.put<{ Params: { id: string } }>(
    '/v1/policies/:id',
    {
      preHandler: [...authWriteChain, requirePermission('policies:write')],
    },
    async (request, reply) => {
      try {
        const { tenantId, schemaName } = resolveTenantContext(request);
        const { id: policyId } = request.params;

        const parseResult = UpdatePolicySchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid request body',
              details: parseResult.error.flatten(),
            },
          });
        }

        const policy = await policyService.updatePolicy(
          tenantId,
          schemaName,
          policyId,
          parseResult.data
        );
        return reply.code(200).send(policy);
      } catch (error) {
        const mapped = mapServiceError(error);
        return reply.code(mapped.statusCode).send({
          error: { code: mapped.code, message: mapped.message, details: mapped.details },
        });
      }
    }
  );

  // -------------------------------------------------------------------------
  // DELETE /api/v1/policies/:id — delete policy
  // FR-007, FR-009, plan §3.13
  // Returns 403 POLICY_SOURCE_IMMUTABLE for core/plugin policies.
  // Returns 204 No Content on success.
  // -------------------------------------------------------------------------
  fastify.delete<{ Params: { id: string } }>(
    '/v1/policies/:id',
    {
      preHandler: [...authWriteChain, requirePermission('policies:write')],
    },
    async (request, reply) => {
      try {
        const { tenantId, schemaName } = resolveTenantContext(request);
        const { id: policyId } = request.params;

        await policyService.deletePolicy(tenantId, schemaName, policyId);
        return reply.code(204).send();
      } catch (error) {
        const mapped = mapServiceError(error);
        return reply.code(mapped.statusCode).send({
          error: { code: mapped.code, message: mapped.message, details: mapped.details },
        });
      }
    }
  );
}
