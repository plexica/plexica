// File: apps/core-api/src/middleware/error-handler.ts

import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Known error name patterns that are safe to expose to clients.
 * Anything not matching is replaced with a generic label in production.
 */
const SAFE_ERROR_NAMES = new Set([
  'Error',
  'BadRequestError',
  'UnauthorizedError',
  'ForbiddenError',
  'NotFoundError',
  'ConflictError',
  'ValidationError',
  'FST_ERR_VALIDATION',
]);

/**
 * Detect database / ORM errors by checking the error constructor chain
 * rather than fragile keyword matching on the message string.
 */
function isDatabaseError(error: FastifyError): boolean {
  // Prisma errors always have a `code` starting with "P"
  if (typeof error.code === 'string' && /^P\d{4}$/.test(error.code)) {
    return true;
  }

  // Check the constructor name for Prisma client errors
  const ctorName = error.constructor?.name ?? '';
  if (
    ctorName.startsWith('PrismaClient') ||
    ctorName === 'PrismaClientKnownRequestError' ||
    ctorName === 'PrismaClientUnknownRequestError' ||
    ctorName === 'PrismaClientValidationError'
  ) {
    return true;
  }

  return false;
}

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
      // Fastify attaches a `validation` array on schema validation failures
      const validationArray =
        'validation' in error
          ? (error as unknown as Record<string, unknown>).validation
          : undefined;
      const isValidationError = Array.isArray(validationArray);

      // In production, sanitize sensitive errors
      if (isProduction) {
        if (isDatabaseError(error)) {
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

      // Sanitize the error name in production to avoid leaking internal class names
      const errorName =
        isProduction && !SAFE_ERROR_NAMES.has(error.name) ? 'Error' : error.name || 'Error';

      // Send error response
      return reply.status(statusCode).send({
        error: errorName,
        message,
        // Only include validation errors in response if present
        ...(isValidationError && {
          validation: validationArray,
        }),
        // Request ID for debugging (user can provide this to support)
        requestId: request.id,
      });
    }
  );
}
