// error-handler.ts
// Fastify error handler plugin.
// Maps AppError subclasses to structured HTTP responses.
// Non-AppError errors → 500 with generic message (no stack traces exposed).

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import { AppError } from '../lib/app-error.js';

interface FastifyValidationError {
  validation?: unknown[];
  message?: string;
}

const errorHandlerPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.setErrorHandler<Error & FastifyValidationError>((error, request, reply) => {
    if (error instanceof AppError) {
      request.log.warn(
        { code: error.code, statusCode: error.statusCode, msg: error.message },
        'Application error'
      );
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }

    // Fastify validation errors (from JSON schema)
    if ('validation' in error && error.validation !== undefined) {
      request.log.warn({ validation: error.validation }, 'Request validation error');
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Request validation failed' },
      });
    }

    // Unexpected errors — log full details, never expose to client
    request.log.error({ err: error }, 'Unhandled server error');
    return reply.status(500).send({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' },
    });
  });
};

export default errorHandlerPlugin;
