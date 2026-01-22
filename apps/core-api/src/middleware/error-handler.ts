// File: apps/core-api/src/middleware/error-handler.ts

import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Error sanitization middleware
 * Prevents sensitive database/system information from leaking to clients
 * In production, returns generic error messages
 * In development, returns detailed errors for debugging
 */
export function setupErrorHandler(server: FastifyInstance) {
  server.setErrorHandler(
    async (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      // Always log the full error server-side
      request.log.error(error, 'Request error');

      // Determine if we should expose details
      const isProduction = process.env.NODE_ENV === 'production';

      // Extract error status code
      let statusCode = error.statusCode || 500;

      // Sanitize error message
      let message = error.message || 'An error occurred';

      // Detect if this is a database error that should be sanitized
      const isDatabaseError =
        error.message?.includes('Prisma') ||
        error.message?.includes('postgres') ||
        error.message?.includes('database') ||
        error.message?.toLowerCase().includes('sql');

      const isValidationError = (error as any).validation;

      // In production, sanitize sensitive errors
      if (isProduction) {
        if (isDatabaseError) {
          statusCode = 500;
          message = 'An internal server error occurred. Please contact support.';
        } else if (isValidationError) {
          // Keep validation errors, but they're already safe
          statusCode = statusCode || 400;
        } else if (statusCode >= 500) {
          // Generic 500 error message
          message = 'An internal server error occurred. Please contact support.';
        }
      }

      // Send error response
      return reply.status(statusCode).send({
        error: error.name || 'Error',
        message,
        // Only include validation errors in response if present
        ...(isValidationError && {
          validation: (error as any).validation,
        }),
        // Request ID for debugging (user can provide this to support)
        requestId: request.id,
      });
    }
  );
}
