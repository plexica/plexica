// File: apps/core-api/src/modules/storage/storage.routes.ts
// Spec 007 T007-13: Storage REST endpoints
// POST   /api/v1/storage/upload
// GET    /api/v1/storage/download/:path
// DELETE /api/v1/storage/:path
// GET    /api/v1/storage/list
// GET    /api/v1/storage/signed-url/:path

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware, requireRole } from '../../middleware/auth.js';
import { StorageService } from './storage.service.js';
import { StorageErrorCode } from '../../types/core-services.types.js';
import { USER_ROLES } from '../../constants/index.js';

// ============================================================================
// Helpers
// ============================================================================

function getTenantId(request: FastifyRequest): string {
  const tenantId = (request as any).user?.tenantSlug;
  if (!tenantId) {
    throw Object.assign(new Error('Tenant context not available'), { statusCode: 400 });
  }
  return tenantId;
}

function getStorageService(request: FastifyRequest): StorageService {
  const tenantId = getTenantId(request);
  return new StorageService(tenantId);
}

// ============================================================================
// Route plugin
// ============================================================================

export const storageRoutes: FastifyPluginAsync = async (server) => {
  // All routes require authentication
  server.addHook('preHandler', authMiddleware);

  // --------------------------------------------------------------------------
  // POST /storage/upload — multipart file upload
  // --------------------------------------------------------------------------
  server.post(
    '/storage/upload',
    {
      schema: {
        tags: ['storage'],
        summary: 'Upload a file',
        description: 'Upload a file to the tenant-scoped bucket (max 100 MB by default).',
        consumes: ['multipart/form-data'],
        response: {
          201: {
            description: 'File uploaded successfully',
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Storage path key' },
              bucket: { type: 'string' },
              size: { type: 'integer' },
              contentType: { type: 'string' },
              url: { type: 'string' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
          400: { description: 'No file provided or path traversal detected', type: 'object' },
          413: { description: 'File exceeds the allowed size limit', type: 'object' },
          500: { description: 'Internal upload error', type: 'object' },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request);
      const userId = (request as any).user?.id ?? (request as any).user?.sub;
      const svc = getStorageService(request);

      try {
        const data = await request.file();
        if (!data) {
          return reply.code(400).send({
            error: { code: 'STORAGE_NO_FILE', message: 'No file provided in the request' },
          });
        }

        // Derive storage path from filename — do NOT log filename (may contain PII)
        const filename = data.filename || 'upload';
        const path = `uploads/${Date.now()}-${filename}`;

        // Max file size from query param or default 100 MB
        const maxSizeBytes =
          typeof (request.query as any).maxSizeMb === 'string'
            ? parseInt((request.query as any).maxSizeMb, 10) * 1024 * 1024
            : 100 * 1024 * 1024;

        // Buffer the stream for size validation
        const chunks: Buffer[] = [];
        for await (const chunk of data.file) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        const fileInfo = await svc.upload(path, buffer, {
          contentType: data.mimetype,
          maxSizeBytes,
        });

        request.log.info(
          { tenantId, userId, path: fileInfo.key, size: fileInfo.size },
          '[StorageRoute] file uploaded'
        );
        return reply.code(201).send(fileInfo);
      } catch (err: any) {
        if (err.code === StorageErrorCode.FILE_TOO_LARGE) {
          request.log.warn(
            { tenantId, userId, code: err.code },
            '[StorageRoute] upload rejected: file too large'
          );
          return reply.code(413).send({ error: { code: err.code, message: err.message } });
        }
        if (err.code === StorageErrorCode.PATH_TRAVERSAL) {
          request.log.warn(
            { tenantId, userId, code: err.code },
            '[StorageRoute] upload rejected: path traversal'
          );
          return reply.code(400).send({ error: { code: err.code, message: err.message } });
        }
        request.log.error({ tenantId, userId, err: err.message }, '[StorageRoute] upload failed');
        return reply
          .code(500)
          .send({ error: { code: 'STORAGE_UPLOAD_FAILED', message: 'Upload failed' } });
      }
    }
  );

  // --------------------------------------------------------------------------
  // GET /storage/download/:path — stream file
  // --------------------------------------------------------------------------
  server.get<{ Params: { '*': string } }>(
    '/storage/download/*',
    {
      schema: {
        tags: ['storage'],
        summary: 'Download a file',
        description:
          'Stream a file from the tenant-scoped bucket. Sets Content-Disposition header.',
        response: {
          200: { description: 'File stream' },
          400: { description: 'Path traversal detected', type: 'object' },
          404: { description: 'File not found', type: 'object' },
          500: { description: 'Internal download error', type: 'object' },
        },
      },
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const userId = (request as any).user?.id ?? (request as any).user?.sub;
      const svc = getStorageService(request);
      const path = (request.params as any)['*'] as string;

      try {
        const stream = await svc.download(path);
        const filename = path.split('/').pop() ?? 'download';
        request.log.info({ tenantId, userId, path }, '[StorageRoute] file download started');
        reply.header('Content-Disposition', `attachment; filename="${filename}"`);
        return reply.send(stream);
      } catch (err: any) {
        if (err.code === StorageErrorCode.FILE_NOT_FOUND) {
          request.log.warn(
            { tenantId, userId, path, code: err.code },
            '[StorageRoute] file not found'
          );
          return reply.code(404).send({ error: { code: err.code, message: err.message } });
        }
        if (err.code === StorageErrorCode.PATH_TRAVERSAL) {
          request.log.warn(
            { tenantId, userId, code: err.code },
            '[StorageRoute] download rejected: path traversal'
          );
          return reply.code(400).send({ error: { code: err.code, message: err.message } });
        }
        request.log.error(
          { tenantId, userId, path, err: err.message },
          '[StorageRoute] download failed'
        );
        return reply
          .code(500)
          .send({ error: { code: 'STORAGE_DOWNLOAD_FAILED', message: 'Download failed' } });
      }
    }
  );

  // --------------------------------------------------------------------------
  // DELETE /storage/:path — delete a file (admin only)
  // --------------------------------------------------------------------------
  server.delete<{ Params: { '*': string } }>(
    '/storage/*',
    {
      schema: {
        tags: ['storage'],
        summary: 'Delete a file',
        description: 'Delete a file from the tenant-scoped bucket. Requires admin role.',
        response: {
          204: { description: 'File deleted successfully' },
          400: { description: 'Path traversal detected', type: 'object' },
          403: { description: 'Insufficient permissions', type: 'object' },
          500: { description: 'Internal delete error', type: 'object' },
        },
      },
      preHandler: requireRole(
        USER_ROLES.ADMIN,
        USER_ROLES.TENANT_OWNER,
        USER_ROLES.SUPER_ADMIN,
        USER_ROLES.TENANT_ADMIN
      ),
    },
    async (request, reply) => {
      const tenantId = getTenantId(request);
      const userId = (request as any).user?.id ?? (request as any).user?.sub;
      const svc = getStorageService(request);
      const path = (request.params as any)['*'] as string;

      try {
        await svc.delete(path);
        request.log.info({ tenantId, userId, path }, '[StorageRoute] file deleted');
        return reply.code(204).send();
      } catch (err: any) {
        if (err.code === StorageErrorCode.PATH_TRAVERSAL) {
          request.log.warn(
            { tenantId, userId, code: err.code },
            '[StorageRoute] delete rejected: path traversal'
          );
          return reply.code(400).send({ error: { code: err.code, message: err.message } });
        }
        request.log.error(
          { tenantId, userId, path, err: err.message },
          '[StorageRoute] delete failed'
        );
        return reply
          .code(500)
          .send({ error: { code: 'STORAGE_DELETE_FAILED', message: 'Delete failed' } });
      }
    }
  );

  // --------------------------------------------------------------------------
  // GET /storage/list — list files
  // --------------------------------------------------------------------------
  server.get(
    '/storage/list',
    {
      schema: {
        tags: ['storage'],
        summary: 'List files',
        description: 'List files in the tenant-scoped bucket, optionally filtered by prefix',
        querystring: {
          type: 'object',
          properties: {
            prefix: { type: 'string', description: 'Optional path prefix filter' },
          },
        },
        response: {
          200: {
            description: 'File list',
            type: 'object',
            properties: {
              files: { type: 'array', items: { type: 'object' } },
              count: { type: 'integer' },
            },
          },
          500: { description: 'Internal list error', type: 'object' },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = getTenantId(request);
      const userId = (request as any).user?.id ?? (request as any).user?.sub;
      const svc = getStorageService(request);
      const prefix = (request.query as any).prefix as string | undefined;

      try {
        const files = await svc.list(prefix);
        request.log.info({ tenantId, userId, count: files.length }, '[StorageRoute] files listed');
        return reply.send({ files, count: files.length });
      } catch (err: any) {
        request.log.error({ tenantId, userId, err: err.message }, '[StorageRoute] list failed');
        return reply
          .code(500)
          .send({ error: { code: 'STORAGE_LIST_FAILED', message: 'List failed' } });
      }
    }
  );

  // --------------------------------------------------------------------------
  // GET /storage/signed-url/:path — generate pre-signed URL
  // --------------------------------------------------------------------------
  server.get<{ Params: { '*': string } }>(
    '/storage/signed-url/*',
    {
      schema: {
        tags: ['storage'],
        summary: 'Get signed URL',
        description:
          'Generate a pre-signed URL for direct download. Target <10ms P95 (NFR-002). Default expiry: 3600s.',
        querystring: {
          type: 'object',
          properties: {
            expiresIn: { type: 'integer', default: 3600, description: 'Expiry in seconds' },
          },
        },
        response: {
          200: {
            description: 'Signed URL',
            type: 'object',
            properties: {
              url: { type: 'string', description: 'Pre-signed download URL' },
              expiresIn: { type: 'integer' },
            },
          },
          400: { description: 'Path traversal detected', type: 'object' },
          500: { description: 'Failed to generate signed URL', type: 'object' },
        },
      },
    },
    async (request, reply) => {
      // Check raw URL BEFORE Fastify normalization strips traversal sequences
      if (request.url.includes('..')) {
        return reply.code(400).send({
          error: { code: StorageErrorCode.PATH_TRAVERSAL, message: 'Path traversal detected' },
        });
      }
      const tenantId = getTenantId(request);
      const userId = (request as any).user?.id ?? (request as any).user?.sub;
      const svc = getStorageService(request);
      const path = (request.params as any)['*'] as string;
      const expiresIn = parseInt((request.query as any).expiresIn ?? '3600', 10);

      try {
        const url = await svc.getSignedUrl(path, { expiresIn });
        request.log.info(
          { tenantId, userId, path, expiresIn },
          '[StorageRoute] signed URL generated'
        );
        return reply.send({ url, expiresIn });
      } catch (err: any) {
        if (err.code === StorageErrorCode.PATH_TRAVERSAL) {
          request.log.warn(
            { tenantId, userId, code: err.code },
            '[StorageRoute] signed-url rejected: path traversal'
          );
          return reply.code(400).send({ error: { code: err.code, message: err.message } });
        }
        request.log.error(
          { tenantId, userId, path, err: err.message },
          '[StorageRoute] signed URL failed'
        );
        return reply.code(500).send({
          error: { code: 'STORAGE_SIGNED_URL_FAILED', message: 'Failed to generate signed URL' },
        });
      }
    }
  );
};
