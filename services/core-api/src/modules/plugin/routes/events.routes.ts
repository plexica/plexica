// routes/events.routes.ts
// Plugin event emission endpoint — accepts events from plugin backends via SDK.
// SDK posts to /api/v1/events/emit (see packages/sdk/src/index.ts).

import { z } from 'zod';
import { emitEvent } from '../../../lib/kafka.js';
import { requireAbac } from '../../../middleware/abac.js';
import { ValidationError } from '../../../lib/app-error.js';
import { logger } from '../../../lib/logger.js';

import type { FastifyInstance } from 'fastify';

const emitEventSchema = z.object({
  type: z
    .string()
    .min(1)
    .refine((v) => v.startsWith('plugin.'), 'Event type must start with "plugin."'),
  payload: z.any(),
  timestamp: z.string(),
  correlationId: z.string().min(1),
});

export async function eventEmitRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/api/v1/events/emit',
    { preHandler: [requireAbac('plugin:access')] },
    async (request) => {
      const parsed = emitEventSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      }

      const { type, payload, correlationId } = parsed.data;

      try {
        await emitEvent(type, payload as Record<string, unknown>, correlationId);
      } catch (err) {
        logger.error({ err, eventType: type }, 'Failed to emit plugin event');
        throw err;
      }

      return { status: 'emitted', type, correlationId };
    }
  );
}
