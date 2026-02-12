/**
 * Marketplace Routes (M2.4)
 *
 * REST API endpoints for the plugin marketplace:
 * - Plugin search & discovery
 * - Publishing workflow
 * - Version management
 * - Rating & reviews
 * - Installation
 * - Analytics
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { marketplaceService } from '../services/marketplace.service.js';
import { authMiddleware, requireSuperAdmin } from '../middleware/auth.js';
import { getTenantContext } from '../middleware/tenant-context.js';
import {
  SearchPluginsSchema,
  PublishPluginSchema,
  PublishVersionSchema,
  UpdatePluginMetadataSchema,
  SubmitForReviewSchema,
  ReviewPluginSchema,
  RatePluginSchema,
  UpdateRatingSchema,
  VoteRatingSchema,
  InstallPluginSchema,
  UninstallPluginSchema,
  GetRatingsSchema,
  PluginAnalyticsSchema,
} from '../schemas/marketplace.schema.js';

export async function marketplaceRoutes(fastify: FastifyInstance) {
  // =====================================
  // Public Marketplace Routes
  // =====================================

  /**
   * Search plugins in marketplace
   * GET /marketplace/plugins
   */
  fastify.get(
    '/marketplace/plugins',
    {
      preHandler: [authMiddleware],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = SearchPluginsSchema.parse(request.query);
        const result = await marketplaceService.searchPlugins(query);
        return reply.send(result);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * Get marketplace statistics
   * GET /marketplace/stats
   */
  fastify.get(
    '/marketplace/stats',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const stats = await marketplaceService.getMarketplaceStats();
        return reply.send(stats);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(500)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * Get plugin details by ID
   * GET /marketplace/plugins/:id
   */
  fastify.get<{
    Params: { id: string };
    Querystring: { includeAllVersions?: boolean };
  }>(
    '/marketplace/plugins/:id',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const includeAllVersions = request.query.includeAllVersions === true;
        const plugin = await marketplaceService.getPluginById(
          request.params.id,
          includeAllVersions
        );
        return reply.send(plugin);
      } catch (error: unknown) {
        request.log.error(error);
        if (error instanceof Error && error.message.includes('not found')) {
          return reply.code(404).send({ error: error.message });
        }
        return reply
          .code(500)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  // =====================================
  // Plugin Publishing Routes
  // =====================================

  /**
   * Publish a new plugin (creates DRAFT)
   * POST /marketplace/publish
   */
  fastify.post(
    '/marketplace/publish',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const dto = PublishPluginSchema.parse(request.body);
        const userId = request.user?.id;
        if (!userId) {
          return reply.code(401).send({ error: 'User not authenticated' });
        }

        const plugin = await marketplaceService.publishPlugin(dto, userId);
        return reply.code(201).send(plugin);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * Update plugin metadata
   * PATCH /marketplace/plugins/:id
   */
  fastify.patch<{
    Params: { id: string };
  }>(
    '/marketplace/plugins/:id',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const dto = UpdatePluginMetadataSchema.parse(request.body);
        const plugin = await marketplaceService.updatePluginMetadata(request.params.id, dto);
        return reply.send(plugin);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * Publish a new version
   * POST /marketplace/plugins/:id/versions
   */
  fastify.post<{
    Params: { id: string };
  }>(
    '/marketplace/plugins/:id/versions',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const dto = PublishVersionSchema.parse(request.body);
        const version = await marketplaceService.publishVersion(request.params.id, dto);
        return reply.code(201).send(version);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * Submit plugin for review
   * POST /marketplace/plugins/:id/submit
   */
  fastify.post<{
    Params: { id: string };
  }>(
    '/marketplace/plugins/:id/submit',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      try {
        SubmitForReviewSchema.parse(request.body); // Validate
        const plugin = await marketplaceService.submitForReview(request.params.id);
        return reply.send(plugin);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * Review plugin (Super Admin only)
   * POST /marketplace/plugins/:id/review
   */
  fastify.post<{
    Params: { id: string };
  }>(
    '/marketplace/plugins/:id/review',
    {
      preHandler: [authMiddleware, requireSuperAdmin],
    },
    async (request, reply) => {
      try {
        const dto = ReviewPluginSchema.parse(request.body);
        const plugin = await marketplaceService.reviewPlugin(request.params.id, dto);
        return reply.send(plugin);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * Deprecate plugin
   * POST /marketplace/plugins/:id/deprecate
   */
  fastify.post<{
    Params: { id: string };
  }>(
    '/marketplace/plugins/:id/deprecate',
    {
      preHandler: [authMiddleware, requireSuperAdmin],
    },
    async (request, reply) => {
      try {
        const plugin = await marketplaceService.deprecatePlugin(request.params.id);
        return reply.send(plugin);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  // =====================================
  // Rating & Review Routes
  // =====================================

  /**
   * Get plugin ratings
   * GET /marketplace/plugins/:id/ratings
   */
  fastify.get<{
    Params: { id: string };
  }>(
    '/marketplace/plugins/:id/ratings',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const options = GetRatingsSchema.parse(request.query);
        const result = await marketplaceService.getPluginRatings(request.params.id, options);
        return reply.send(result);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(500)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * Rate a plugin
   * POST /marketplace/plugins/:id/ratings
   */
  fastify.post<{
    Params: { id: string };
  }>(
    '/marketplace/plugins/:id/ratings',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const dto = RatePluginSchema.parse(request.body);
        const tenantContext = getTenantContext();
        if (!tenantContext) {
          return reply.code(400).send({ error: 'No tenant context available' });
        }

        const userId = request.user?.id;
        if (!userId) {
          return reply.code(401).send({ error: 'User not authenticated' });
        }

        const rating = await marketplaceService.ratePlugin(
          request.params.id,
          tenantContext.tenantId,
          userId,
          dto
        );
        return reply.code(201).send(rating);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * Update a rating
   * PATCH /marketplace/plugins/:id/ratings
   */
  fastify.patch<{
    Params: { id: string };
  }>(
    '/marketplace/plugins/:id/ratings',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const dto = UpdateRatingSchema.parse(request.body);
        const tenantContext = getTenantContext();
        if (!tenantContext) {
          return reply.code(400).send({ error: 'No tenant context available' });
        }

        const userId = request.user?.id;
        if (!userId) {
          return reply.code(401).send({ error: 'User not authenticated' });
        }

        const rating = await marketplaceService.updateRating(
          request.params.id,
          tenantContext.tenantId,
          userId,
          dto
        );
        return reply.send(rating);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * Delete a rating
   * DELETE /marketplace/plugins/:id/ratings
   */
  fastify.delete<{
    Params: { id: string };
  }>(
    '/marketplace/plugins/:id/ratings',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const tenantContext = getTenantContext();
        if (!tenantContext) {
          return reply.code(400).send({ error: 'No tenant context available' });
        }

        const userId = request.user?.id;
        if (!userId) {
          return reply.code(401).send({ error: 'User not authenticated' });
        }

        await marketplaceService.deleteRating(request.params.id, tenantContext.tenantId, userId);
        return reply.code(204).send();
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * Vote on a rating
   * POST /marketplace/ratings/:ratingId/vote
   */
  fastify.post<{
    Params: { ratingId: string };
  }>(
    '/marketplace/ratings/:ratingId/vote',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const dto = VoteRatingSchema.parse(request.body);
        const rating = await marketplaceService.voteRating(request.params.ratingId, dto.helpful);
        return reply.send(rating);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  // =====================================
  // Installation Routes
  // =====================================

  /**
   * Install a plugin
   * POST /marketplace/plugins/:id/install
   */
  fastify.post<{
    Params: { id: string };
  }>(
    '/marketplace/plugins/:id/install',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const dto = InstallPluginSchema.parse(request.body);
        const tenantContext = getTenantContext();
        if (!tenantContext) {
          return reply.code(400).send({ error: 'No tenant context available' });
        }

        const userId = request.user?.id;
        if (!userId) {
          return reply.code(401).send({ error: 'User not authenticated' });
        }

        const tenantPlugin = await marketplaceService.installPlugin(
          request.params.id,
          tenantContext.tenantId,
          userId,
          dto
        );
        return reply.code(201).send(tenantPlugin);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  /**
   * Uninstall a plugin
   * DELETE /marketplace/plugins/:id/install
   */
  fastify.delete<{
    Params: { id: string };
  }>(
    '/marketplace/plugins/:id/install',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      try {
        UninstallPluginSchema.parse(request.body); // Validate
        const tenantContext = getTenantContext();
        if (!tenantContext) {
          return reply.code(400).send({ error: 'No tenant context available' });
        }

        await marketplaceService.uninstallPlugin(request.params.id, tenantContext.tenantId);
        return reply.code(204).send();
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(400)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );

  // =====================================
  // Analytics Routes
  // =====================================

  /**
   * Get plugin analytics
   * GET /marketplace/plugins/:id/analytics
   */
  fastify.get<{
    Params: { id: string };
  }>(
    '/marketplace/plugins/:id/analytics',
    {
      preHandler: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const query = PluginAnalyticsSchema.parse(request.query);
        const analytics = await marketplaceService.getPluginAnalytics(
          request.params.id,
          query.timeRange
        );
        return reply.send(analytics);
      } catch (error: unknown) {
        request.log.error(error);
        return reply
          .code(500)
          .send({ error: error instanceof Error ? error.message : String(error) });
      }
    }
  );
}
