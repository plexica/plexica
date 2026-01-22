// File: apps/core-api/src/routes/plugin-upload.ts

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { minioClient } from '../services/minio-client';
import { authMiddleware } from '../middleware/auth.js';

/**
 * Plugin Upload Routes
 * Handles multipart file uploads for plugin bundles
 */
export async function pluginUploadRoutes(server: FastifyInstance) {
  /**
   * Upload plugin bundle
   * SECURITY: Requires authentication to prevent unauthorized plugin uploads
   */
  server.post(
    '/plugins/upload',
    {
      schema: {
        hide: true, // Hide from swagger docs to avoid schema validation issues
      },
      // SECURITY: Add authentication middleware to require valid JWT token
      preHandler: [authMiddleware],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Handle multipart/form-data
        const parts = request.parts();
        const filesData: Array<{ filename: string; buffer: Buffer; contentType?: string }> = [];
        let pluginId = '';
        let version = '';

        for await (const part of parts) {
          if (part.type === 'field') {
            if (part.fieldname === 'pluginId') {
              pluginId = part.value as string;
            } else if (part.fieldname === 'version') {
              version = part.value as string;
            }
          } else if (part.type === 'file') {
            const buffer = await part.toBuffer();
            filesData.push({
              filename: part.filename,
              buffer,
              contentType: part.mimetype,
            });
          }
        }

        if (!pluginId || !version) {
          return reply.status(400).send({
            error: 'BadRequest',
            message: 'pluginId and version are required',
          });
        }

        if (filesData.length === 0) {
          return reply.status(400).send({
            error: 'BadRequest',
            message: 'At least one file is required',
          });
        }

        server.log.info(`Uploading ${filesData.length} files for plugin ${pluginId}@${version}`);

        // Upload files to MinIO
        const files = filesData.map((f) => ({
          name: f.filename,
          buffer: f.buffer,
          contentType: f.contentType,
        }));

        const urls = await minioClient.uploadPluginFiles(pluginId, version, files);
        const remoteEntryUrl = minioClient.getPluginRemoteEntryUrl(pluginId, version);

        server.log.info(`Successfully uploaded plugin ${pluginId}@${version}`);

        return reply.send({
          success: true,
          pluginId,
          version,
          urls,
          remoteEntryUrl,
        });
      } catch (error) {
        server.log.error({ error }, 'Error uploading plugin');
        return reply.status(500).send({
          error: 'InternalServerError',
          message: 'Failed to upload plugin bundle',
        });
      }
    }
  );

  /**
   * List plugin versions
   */
  server.get(
    '/plugins/:pluginId/versions',
    {
      schema: {
        description: 'List all versions of a plugin',
        tags: ['plugins'],
        params: {
          type: 'object',
          properties: {
            pluginId: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              pluginId: { type: 'string' },
              versions: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { pluginId: string } }>, reply: FastifyReply) => {
      try {
        const { pluginId } = request.params;
        const versions = await minioClient.listPluginVersions(pluginId);

        return reply.send({
          pluginId,
          versions,
        });
      } catch (error) {
        server.log.error({ error }, 'Error listing plugin versions');
        return reply.status(500).send({
          error: 'InternalServerError',
          message: 'Failed to list plugin versions',
        });
      }
    }
  );

  /**
   * Delete a plugin version
   */
  server.delete(
    '/plugins/:pluginId/versions/:version',
    {
      schema: {
        description: 'Delete a specific version of a plugin',
        tags: ['plugins'],
        params: {
          type: 'object',
          properties: {
            pluginId: { type: 'string' },
            version: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { pluginId: string; version: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { pluginId, version } = request.params;
        await minioClient.deletePluginVersion(pluginId, version);

        return reply.send({
          success: true,
          message: `Deleted plugin ${pluginId}@${version}`,
        });
      } catch (error) {
        server.log.error({ error }, 'Error deleting plugin version');
        return reply.status(500).send({
          error: 'InternalServerError',
          message: 'Failed to delete plugin version',
        });
      }
    }
  );

  /**
   * Get plugin remote entry URL
   */
  server.get(
    '/plugins/:pluginId/versions/:version/remote-entry',
    {
      schema: {
        description: 'Get the remote entry URL for a specific plugin version',
        tags: ['plugins'],
        params: {
          type: 'object',
          properties: {
            pluginId: { type: 'string' },
            version: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              pluginId: { type: 'string' },
              version: { type: 'string' },
              remoteEntryUrl: { type: 'string' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { pluginId: string; version: string } }>,
      reply: FastifyReply
    ) => {
      const { pluginId, version } = request.params;
      const remoteEntryUrl = minioClient.getPluginRemoteEntryUrl(pluginId, version);

      return reply.send({
        pluginId,
        version,
        remoteEntryUrl,
      });
    }
  );
}
