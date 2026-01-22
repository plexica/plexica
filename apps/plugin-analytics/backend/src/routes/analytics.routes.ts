/**
 * Analytics Routes (M2.3 Task 10)
 *
 * REST API endpoints for analytics and reports
 */

import type { FastifyInstance } from 'fastify';
import type { AnalyticsService } from '../services/analytics.service.js';

export async function analyticsRoutes(
  fastify: FastifyInstance,
  analyticsService: AnalyticsService
) {
  /**
   * GET /reports
   * List all available reports
   */
  fastify.get('/reports', async (request, reply) => {
    const reports = analyticsService.list();

    return reply.send({
      success: true,
      data: reports,
      total: reports.length,
    });
  });

  /**
   * GET /reports/:id
   * Get a specific report
   */
  fastify.get<{ Params: { id: string } }>('/reports/:id', async (request, reply) => {
    const { id } = request.params;
    const report = analyticsService.getById(id);

    if (!report) {
      return reply.status(404).send({
        success: false,
        error: 'Report not found',
      });
    }

    return reply.send({
      success: true,
      data: report,
    });
  });

  /**
   * POST /reports/:id/run
   * Run a report and generate results
   *
   * THIS IS WHERE PLUGIN-TO-PLUGIN COMMUNICATION HAPPENS!
   * Analytics calls CRM plugin APIs to fetch data
   */
  fastify.post<{ Params: { id: string } }>('/reports/:id/run', async (request, reply) => {
    const { id } = request.params;

    try {
      const result = await analyticsService.runReport(id);

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error(`[Analytics API] Failed to run report ${id}:`, error);
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to generate report',
      });
    }
  });
}
