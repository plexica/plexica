// File: apps/core-api/src/modules/search/search.routes.ts
// Spec 007 T007-16: Search REST endpoints
// POST   /api/v1/search         — full-text search
// POST   /api/v1/search/index   — index a document
// DELETE /api/v1/search/:id     — delete a document
// POST   /api/v1/search/reindex — enqueue background reindex (202 Accepted)

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware, requireRole } from '../../middleware/auth.js';
import { SearchService } from './search.service.js';
import { getJobQueueServiceInstance } from '../jobs/job-queue.singleton.js';
import {
  SearchQuerySchema,
  IndexableSchema,
  SearchErrorCode,
} from '../../types/core-services.types.js';
import { USER_ROLES } from '../../constants/index.js';

// ============================================================================
// Module-level singletons
// ============================================================================

let _searchSvc: SearchService | null = null;

function getSearchService(): SearchService {
  if (!_searchSvc) {
    _searchSvc = new SearchService();
    // Wire shared JobQueueService singleton — avoids duplicate BullMQ Queue instances (HIGH #5)
    _searchSvc.setJobQueueService(getJobQueueServiceInstance());
  }
  return _searchSvc;
}

// ============================================================================
// Helpers
// ============================================================================

function getTenantId(request: FastifyRequest): string {
  // Priority: request.tenant.tenantId (set by tenantContextMiddleware in integration/E2E)
  // → user.tenantSlug (set by authMiddleware) → user.tenantId (unit test mocks)
  const tenantId =
    (request as any).tenant?.tenantId ??
    (request as any).user?.tenantSlug ??
    (request as any).user?.tenantId;
  if (!tenantId)
    throw Object.assign(new Error('Tenant context not available'), { statusCode: 400 });
  return tenantId;
}

// ============================================================================
// Route plugin
// ============================================================================

export const searchRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', authMiddleware);

  // Admin-only role check for write/management endpoints (HIGH #3)
  const adminOnly = requireRole(
    USER_ROLES.ADMIN,
    USER_ROLES.TENANT_OWNER,
    USER_ROLES.SUPER_ADMIN,
    USER_ROLES.TENANT_ADMIN
  );

  // --------------------------------------------------------------------------
  // POST /search — full-text search (tenant auto-scoped, FR-012)
  // --------------------------------------------------------------------------
  server.post(
    '/search',
    {
      schema: {
        tags: ['search'],
        summary: 'Search documents',
        description:
          'Full-text search across indexed documents, scoped to the authenticated tenant',
        response: {
          200: {
            description: 'Search results',
            type: 'object',
            properties: {
              results: { type: 'array', items: { type: 'object' } },
              count: { type: 'integer' },
              query: { type: 'string' },
            },
          },
          400: { description: 'Validation error', type: 'object' },
          500: { description: 'Search failed', type: 'object' },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request);
      const userId = (request as any).user?.id ?? (request as any).user?.sub;
      const body = request.body as any;

      const parsed = SearchQuerySchema.safeParse(body);
      if (!parsed.success) {
        request.log.warn(
          { tenantId, userId, code: 'VALIDATION_ERROR' },
          '[SearchRoute] invalid search query'
        );
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid search query',
            details: parsed.error.flatten(),
          },
        });
      }

      try {
        const svc = getSearchService();
        const results = await svc.search(tenantId, parsed.data);
        request.log.debug(
          { tenantId, userId, query: parsed.data.q, count: results.length },
          '[SearchRoute] search completed'
        );
        return reply.send({ results, count: results.length, query: parsed.data.q });
      } catch (err: any) {
        request.log.error(
          { tenantId, userId, query: parsed.data.q, err: err.message },
          '[SearchRoute] search failed'
        );
        return reply
          .code(500)
          .send({ error: { code: SearchErrorCode.QUERY_FAILED, message: 'Search failed' } });
      }
    }
  );

  // --------------------------------------------------------------------------
  // POST /search/index — index a document
  // --------------------------------------------------------------------------
  server.post(
    '/search/index',
    {
      schema: {
        tags: ['search'],
        summary: 'Index a document',
        description: 'Add or update a document in the search index',
        response: {
          201: {
            description: 'Document indexed',
            type: 'object',
            properties: {
              message: { type: 'string' },
              documentId: { type: 'string' },
            },
          },
          400: { description: 'Validation error', type: 'object' },
          403: { description: 'Insufficient permissions', type: 'object' },
          500: { description: 'Indexing failed', type: 'object' },
        },
      },
      preHandler: adminOnly,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request);
      const userId = (request as any).user?.id ?? (request as any).user?.sub;
      const body = request.body as any;

      const parsed = IndexableSchema.safeParse(body);
      if (!parsed.success) {
        request.log.warn(
          { tenantId, userId, code: 'VALIDATION_ERROR' },
          '[SearchRoute] invalid indexable document'
        );
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid indexable document',
            details: parsed.error.flatten(),
          },
        });
      }

      try {
        const svc = getSearchService();
        await svc.index(tenantId, parsed.data);
        request.log.info(
          { tenantId, userId, documentId: parsed.data.documentId, type: parsed.data.type },
          '[SearchRoute] document indexed'
        );
        return reply
          .code(201)
          .send({ message: 'Document indexed', documentId: parsed.data.documentId });
      } catch (err: any) {
        request.log.error(
          { tenantId, userId, documentId: parsed.data.documentId, err: err.message },
          '[SearchRoute] index failed'
        );
        return reply
          .code(500)
          .send({ error: { code: SearchErrorCode.INDEX_FAILED, message: 'Indexing failed' } });
      }
    }
  );

  // --------------------------------------------------------------------------
  // DELETE /search/:documentId — delete a document from the index
  // --------------------------------------------------------------------------
  server.delete<{ Params: { documentId: string }; Querystring: { type: string } }>(
    '/search/:documentId',
    {
      schema: {
        tags: ['search'],
        summary: 'Delete a document',
        description: 'Remove a document from the search index',
        querystring: {
          type: 'object',
          required: ['type'],
          properties: {
            type: { type: 'string' },
          },
        },
        response: {
          204: { description: 'Document deleted from index' },
          400: { description: 'Missing type query parameter', type: 'object' },
          403: { description: 'Insufficient permissions', type: 'object' },
          500: { description: 'Delete failed', type: 'object' },
        },
      },
      preHandler: adminOnly,
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const userId = (request as any).user?.id ?? (request as any).user?.sub;
      const { documentId } = request.params;
      const { type } = request.query;

      if (!type) {
        request.log.warn(
          { tenantId, userId, documentId, code: 'VALIDATION_ERROR' },
          '[SearchRoute] delete: missing "type" query param'
        );
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Query param "type" is required' },
        });
      }

      try {
        const svc = getSearchService();
        await svc.delete(tenantId, documentId, type);
        request.log.info(
          { tenantId, userId, documentId, type },
          '[SearchRoute] document deleted from index'
        );
        return reply.code(204).send();
      } catch (err: any) {
        request.log.error(
          { tenantId, userId, documentId, type, err: err.message },
          '[SearchRoute] delete failed'
        );
        return reply
          .code(500)
          .send({ error: { code: SearchErrorCode.DELETE_FAILED, message: 'Delete failed' } });
      }
    }
  );

  // --------------------------------------------------------------------------
  // POST /search/reindex — background reindex job (202 Accepted, Edge Case #6)
  // --------------------------------------------------------------------------
  server.post(
    '/search/reindex',
    {
      schema: {
        tags: ['search'],
        summary: 'Reindex documents',
        description: 'Enqueue a background reindex job for all documents of a given type',
        response: {
          202: {
            description: 'Reindex job accepted',
            type: 'object',
            properties: {
              message: { type: 'string' },
              jobId: { type: 'string' },
              status: { type: 'string' },
            },
          },
          400: { description: 'Missing type in request body', type: 'object' },
          403: { description: 'Insufficient permissions', type: 'object' },
          500: { description: 'Reindex failed', type: 'object' },
        },
      },
      preHandler: adminOnly,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request);
      const userId = (request as any).user?.id ?? (request as any).user?.sub;
      const body = request.body as any;

      if (!body?.type || typeof body.type !== 'string') {
        request.log.warn(
          { tenantId, userId, code: 'VALIDATION_ERROR' },
          '[SearchRoute] reindex: missing "type" in body'
        );
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Request body must include "type" (string)' },
        });
      }

      try {
        const svc = getSearchService();
        const result = await svc.reindex(tenantId, body.type);
        request.log.info(
          { tenantId, userId, type: body.type, jobId: result.jobId },
          '[SearchRoute] reindex job enqueued'
        );
        // 202 Accepted — job is enqueued, not yet complete
        return reply.code(202).send({ message: 'Reindex job enqueued', ...result });
      } catch (err: any) {
        request.log.error(
          { tenantId, userId, type: body.type, err: err.message },
          '[SearchRoute] reindex failed'
        );
        return reply.code(500).send({
          error: {
            code: SearchErrorCode.REINDEX_FAILED,
            message: err.message ?? 'Reindex failed',
          },
        });
      }
    }
  );
};
