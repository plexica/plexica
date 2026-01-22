/**
 * Deals Routes (M2.3 Task 10)
 *
 * REST API endpoints for deal management
 */

import type { FastifyInstance } from 'fastify';
import type { DealsService } from '../services/deals.service.js';
import type { CreateDealInput, UpdateDealInput, DealStage } from '../types/index.js';

export async function dealsRoutes(fastify: FastifyInstance, dealsService: DealsService) {
  /**
   * GET /deals
   * List all deals with optional filtering
   */
  fastify.get('/deals', async (request, reply) => {
    const { skip, take, search, tags, sortBy, sortOrder } = request.query as any;

    const result = dealsService.list({
      skip: skip ? parseInt(skip) : undefined,
      take: take ? parseInt(take) : undefined,
      search,
      tags: tags ? (Array.isArray(tags) ? tags : [tags]) : undefined,
      sortBy,
      sortOrder,
    });

    return reply.send({
      success: true,
      data: result.deals,
      total: result.total,
    });
  });

  /**
   * GET /deals/:id
   * Get a specific deal by ID
   */
  fastify.get<{ Params: { id: string } }>('/deals/:id', async (request, reply) => {
    const { id } = request.params;
    const deal = dealsService.getById(id);

    if (!deal) {
      return reply.status(404).send({
        success: false,
        error: 'Deal not found',
      });
    }

    return reply.send({
      success: true,
      data: deal,
    });
  });

  /**
   * POST /deals
   * Create a new deal
   */
  fastify.post<{ Body: CreateDealInput }>('/deals', async (request, reply) => {
    const input = request.body;

    // Basic validation
    if (!input.title || input.value === undefined || !input.stage) {
      return reply.status(400).send({
        success: false,
        error: 'title, value, and stage are required',
      });
    }

    const deal = dealsService.create(input);

    return reply.status(201).send({
      success: true,
      data: deal,
    });
  });

  /**
   * PUT /deals/:id
   * Update an existing deal
   */
  fastify.put<{ Params: { id: string }; Body: UpdateDealInput }>(
    '/deals/:id',
    async (request, reply) => {
      const { id } = request.params;
      const input = request.body;

      const deal = dealsService.update(id, input);

      if (!deal) {
        return reply.status(404).send({
          success: false,
          error: 'Deal not found',
        });
      }

      return reply.send({
        success: true,
        data: deal,
      });
    }
  );

  /**
   * DELETE /deals/:id
   * Delete a deal
   */
  fastify.delete<{ Params: { id: string } }>('/deals/:id', async (request, reply) => {
    const { id } = request.params;
    const deleted = dealsService.delete(id);

    if (!deleted) {
      return reply.status(404).send({
        success: false,
        error: 'Deal not found',
      });
    }

    return reply.send({
      success: true,
      message: 'Deal deleted',
    });
  });

  /**
   * GET /deals/stage/:stage
   * Get deals by stage
   */
  fastify.get<{ Params: { stage: DealStage } }>('/deals/stage/:stage', async (request, reply) => {
    const { stage } = request.params;
    const deals = dealsService.getByStage(stage);

    return reply.send({
      success: true,
      data: deals,
      total: deals.length,
    });
  });

  /**
   * GET /deals/contact/:contactId
   * Get deals by contact
   */
  fastify.get<{ Params: { contactId: string } }>(
    '/deals/contact/:contactId',
    async (request, reply) => {
      const { contactId } = request.params;
      const deals = dealsService.getByContact(contactId);

      return reply.send({
        success: true,
        data: deals,
        total: deals.length,
      });
    }
  );

  /**
   * GET /deals/pipeline/summary
   * Get pipeline summary statistics
   */
  fastify.get('/deals/pipeline/summary', async (request, reply) => {
    const summary = dealsService.getPipelineSummary();

    return reply.send({
      success: true,
      data: summary,
    });
  });
}
