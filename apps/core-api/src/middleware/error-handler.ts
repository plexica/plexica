// File: apps/core-api/src/middleware/error-handler.ts
// Constitution-compliant error handler (Art. 6.2)
// Error format: { error: { code: string, message: string, details?: object } }

import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Error classification per Constitution Art. 6.1
 * - Operational errors: Expected errors (validation, auth failures, etc.)
 * - Programmer errors: Unexpected errors (null refs, type errors, etc.)
 */
enum ErrorType {
  OPERATIONAL = 'operational',
  PROGRAMMER = 'programmer',
}

/**
 * Constitution-compliant error response format (Art. 6.2)
 */
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

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
 * Classify error as operational or programmer error
 * Operational errors are expected (validation, auth, etc.)
 * Programmer errors are unexpected (bugs, null refs, etc.)
 */
function classifyError(error: FastifyError): ErrorType {
  const statusCode = error.statusCode || 500;

  // Client errors (4xx) are typically operational
  if (statusCode >= 400 && statusCode < 500) {
    return ErrorType.OPERATIONAL;
  }

  // Database errors, network errors, and 500s are programmer errors
  if (isDatabaseError(error) || statusCode >= 500) {
    return ErrorType.PROGRAMMER;
  }

  return ErrorType.OPERATIONAL;
}

/**
 * Map error name to stable error code
 * Uses error name or custom code property if available
 */
function getErrorCode(error: FastifyError): string {
  // If error has a custom code property (e.g., from auth middleware), use it
  if ('code' in error && typeof error.code === 'string' && error.code.includes('_')) {
    return error.code;
  }

  // Map known error names to stable codes
  const errorName = error.name || 'Error';
  switch (errorName) {
    case 'BadRequestError':
    case 'FST_ERR_VALIDATION':
      return 'VALIDATION_ERROR';
    case 'UnauthorizedError':
      return 'UNAUTHORIZED';
    case 'ForbiddenError':
      return 'FORBIDDEN';
    case 'NotFoundError':
      return 'NOT_FOUND';
    case 'ConflictError':
      return 'CONFLICT';
    default:
      // Generic codes by status
      const statusCode = error.statusCode || 500;
      if (statusCode === 400) return 'BAD_REQUEST';
      if (statusCode === 401) return 'UNAUTHORIZED';
      if (statusCode === 403) return 'FORBIDDEN';
      if (statusCode === 404) return 'NOT_FOUND';
      if (statusCode === 409) return 'CONFLICT';
      if (statusCode === 429) return 'RATE_LIMITED';
      return 'INTERNAL_SERVER_ERROR';
  }
}

/**
 * Error sanitization middleware (Constitution Art. 6)
 * - Classifies errors as operational vs programmer (Art. 6.1)
 * - Returns Constitution-compliant format (Art. 6.2)
 * - Prevents sensitive information leakage (Art. 6.2)
 * - No stack traces in production (Art. 6.2)
 */
export function setupErrorHandler(server: FastifyInstance) {
  server.setErrorHandler(
    async (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      // Always log the full error server-side (Constitution Art. 6.3)
      const errorType = classifyError(error);
      const logLevel = errorType === ErrorType.OPERATIONAL ? 'warn' : 'error';

      request.log[logLevel](
        {
          err: error,
          errorType,
          statusCode: error.statusCode,
          requestId: request.id,
          userId: (request as any).user?.id,
          tenantId: (request as any).tenantId,
        },
        'Request error'
      );

      // Determine if we should expose details
      const isProduction = process.env.NODE_ENV === 'production';

      // Extract error status code
      let statusCode = error.statusCode || 500;

      // Get stable error code
      const errorCode = getErrorCode(error);

      // Sanitize error message
      let message = error.message || 'An error occurred';

      // Extract validation details if present
      const validationArray =
        'validation' in error
          ? (error as unknown as Record<string, unknown>).validation
          : undefined;
      const isValidationError = Array.isArray(validationArray);

      // In production, sanitize sensitive errors (programmer errors)
      if (isProduction && errorType === ErrorType.PROGRAMMER) {
        if (isDatabaseError(error)) {
          statusCode = 500;
          message = 'An internal server error occurred. Please contact support.';
        } else if (statusCode >= 500) {
          // Generic 500 error message (no stack traces per Art. 6.2)
          message = 'An internal server error occurred. Please contact support.';
        }
      }

      // Build Constitution-compliant error response (Art. 6.2)
      const errorResponse: ErrorResponse = {
        error: {
          code: errorCode,
          message,
          // Include details only if present and safe to expose
          ...(isValidationError &&
            !isProduction && {
              details: {
                validation: validationArray,
                requestId: request.id,
              },
            }),
          // In production, only include requestId for support correlation
          ...(isProduction && {
            details: {
              requestId: request.id,
            },
          }),
        },
      };

      // Send error response
      return reply.status(statusCode).send(errorResponse);
    }
  );
}
