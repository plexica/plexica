// error-handler.ts
// Fastify error handler setup.
// Maps AppError subclasses to structured HTTP responses.
// Non-AppError errors → 500 with generic message (no stack traces exposed).
//
// IMPORTANT — use configureErrorHandler(fastify) directly on the root instance
// rather than fastify.register(errorHandlerPlugin). Fastify's plugin system
// creates an encapsulated child scope; setErrorHandler inside a plugin only
// applies to routes registered within that scope. Calling configureErrorHandler
// on the root instance makes the handler apply to the entire application.

import { AppError } from '../lib/app-error.js';

import type { FastifyInstance } from 'fastify';

// Use a wide type so configureErrorHandler works with any Fastify instance,
// regardless of logger or server generics (avoids type errors when called
// with a server created using a custom Pino logger instance).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFastifyInstance = FastifyInstance<any, any, any, any, any>;

interface FastifyValidationError {
  validation?: unknown[];
  message?: string;
}

/**
 * Registers the application error handler on the given Fastify instance.
 * Call this directly on the root server instance — do NOT use server.register().
 */
export function configureErrorHandler(fastify: AnyFastifyInstance): void {
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
}
