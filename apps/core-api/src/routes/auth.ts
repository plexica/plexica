// apps/core-api/src/routes/auth.ts

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import axios from 'axios';
import { authService } from '../services/auth.service.js';
import { authRateLimitHook } from '../middleware/auth-rate-limit.js';
import { authMiddleware } from '../middleware/auth.js';
import { config } from '../config/index.js';
import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

/**
 * Auth Routes - OAuth 2.0 Authorization Code Flow
 *
 * Implements secure OAuth 2.0 authentication flow:
 * 1. GET /auth/login - Build authorization URL
 * 2. GET /auth/callback - Exchange code for tokens
 * 3. POST /auth/refresh - Refresh access token
 * 4. POST /auth/logout - Revoke tokens and logout
 * 5. GET /auth/me - Get current user info
 * 6. GET /auth/jwks/:tenantSlug - Proxy JWKS endpoint
 *
 * Constitution Compliance:
 * - Article 3.2: Service layer delegation (AuthService)
 * - Article 5.1: Tenant validation on all endpoints
 * - Article 5.3: Zod input validation
 * - Article 6.2: Constitution-compliant error format
 * - Article 6.3: Structured Pino logging
 */

// ===== Zod Validation Schemas =====

/**
 * Tenant slug validation regex
 * SECURITY: Prevents SSRF and path traversal attacks
 * Format: 1-50 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphens
 */
const TENANT_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/;

const LoginQuerySchema = z.object({
  tenantSlug: z
    .string()
    .min(1, 'Tenant slug is required')
    .regex(TENANT_SLUG_REGEX, 'Invalid tenant slug format'),
  redirectUri: z.string().url('Invalid redirect URI'),
  state: z.string().optional(),
});

const CallbackQuerySchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  tenantSlug: z
    .string()
    .min(1, 'Tenant slug is required')
    .regex(TENANT_SLUG_REGEX, 'Invalid tenant slug format'),
  state: z.string().optional(),
  codeVerifier: z.string().optional(),
});

const RefreshBodySchema = z.object({
  tenantSlug: z
    .string()
    .min(1, 'Tenant slug is required')
    .regex(TENANT_SLUG_REGEX, 'Invalid tenant slug format'),
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const LogoutBodySchema = z.object({
  tenantSlug: z
    .string()
    .min(1, 'Tenant slug is required')
    .regex(TENANT_SLUG_REGEX, 'Invalid tenant slug format'),
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const JwksParamsSchema = z.object({
  tenantSlug: z
    .string()
    .min(1, 'Tenant slug is required')
    .regex(TENANT_SLUG_REGEX, 'Invalid tenant slug format'),
});

// ===== Route Handlers =====

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * Error Handler: Transform Fastify validation errors to Constitution format
   *
   * Fastify's built-in schema validation returns errors like:
   * { statusCode: 400, code: 'FST_ERR_VALIDATION', error: 'Bad Request', message: '...' }
   *
   * We transform these to Constitution Article 6.2 format:
   * { error: { code: 'VALIDATION_ERROR', message: '...', details: {...} } }
   *
   * For non-validation errors we also ensure the Constitution-compliant object
   * format so that workspace (and other) errors propagated into this scope are
   * serialised correctly even when setupErrorHandler has not been registered
   * (e.g. in unit-test environments that use a bare Fastify instance).
   */
  fastify.setErrorHandler((error, _request, reply) => {
    const errorAny = error as any;

    // Check if this is a Fastify validation error (by validation property or error code)
    if (errorAny.validation || errorAny.code === 'FST_ERR_VALIDATION') {
      // Map Fastify's technical messages to user-friendly messages
      const message = errorAny.message || '';
      let userMessage = 'Validation failed';

      if (message.includes('querystring')) {
        userMessage = 'Invalid query parameters';
      } else if (message.includes('body')) {
        userMessage = 'Invalid request body';
      } else if (message.includes('params')) {
        userMessage = 'Invalid path parameters';
      }

      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: userMessage,
          details: errorAny.validation || { message: errorAny.message },
        },
      });
    }

    // For all other errors produce a Constitution Art. 6.2 compliant response.
    // Using error.code (if it looks like a stable error code) or a generic fallback.
    const statusCode: number = errorAny.statusCode || 500;
    const code: string =
      typeof errorAny.code === 'string' && errorAny.code.includes('_')
        ? errorAny.code
        : statusCode === 401
          ? 'UNAUTHORIZED'
          : statusCode === 403
            ? 'FORBIDDEN'
            : statusCode === 404
              ? 'NOT_FOUND'
              : statusCode === 409
                ? 'CONFLICT'
                : 'INTERNAL_SERVER_ERROR';

    return reply.code(statusCode).send({
      error: {
        code,
        message: errorAny.message || 'An error occurred',
      },
    });
  });

  /**
   * GET /auth/login
   *
   * Build OAuth 2.0 authorization URL for tenant login
   *
   * Query Parameters:
   * - tenantSlug: Tenant identifier
   * - redirectUri: Callback URL after authentication
   * - state: Optional CSRF protection token
   *
   * Response:
   * - 200: { authUrl: string }
   * - 400: Validation error
   * - 403: Tenant not found or suspended
   * - 429: Rate limited
   */
  fastify.get<{
    Querystring: z.infer<typeof LoginQuerySchema>;
  }>(
    '/auth/login',
    {
      preHandler: [authRateLimitHook],
      schema: {
        description: 'Build OAuth 2.0 authorization URL for login',
        tags: ['auth'],
        querystring: {
          type: 'object',
          required: ['tenantSlug', 'redirectUri'],
          properties: {
            tenantSlug: {
              type: 'string',
              description: 'Tenant identifier',
              pattern: '^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$',
            },
            redirectUri: {
              type: 'string',
              format: 'uri',
              pattern: '^https?://',
              description: 'OAuth callback URL',
            },
            state: { type: 'string', description: 'CSRF protection token' },
          },
        },
        response: {
          200: {
            description: 'Authorization URL built successfully',
            type: 'object',
            properties: {
              authUrl: { type: 'string', description: 'Keycloak authorization URL' },
            },
          },
          400: {
            description: 'Validation error',
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object' },
                },
              },
            },
          },
          403: {
            description: 'Tenant not found or suspended',
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
          429: {
            description: 'Rate limited',
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object' },
                },
              },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Querystring: z.infer<typeof LoginQuerySchema> }>,
      reply: FastifyReply
    ) => {
      try {
        const { tenantSlug, redirectUri, state } = request.query;

        // Build authorization URL via AuthService
        const authUrl = await authService.buildLoginUrl(tenantSlug, redirectUri, state);

        logger.info(
          {
            tenantSlug,
            redirectUri,
            hasState: !!state,
            ip: request.ip,
          },
          'OAuth login URL requested'
        );

        return reply.send({ authUrl });
      } catch (error: any) {
        // AuthService throws Constitution-compliant errors
        if (error.error && error.error.code) {
          const statusCode =
            error.error.code === 'AUTH_TENANT_NOT_FOUND'
              ? 404
              : error.error.code === 'AUTH_TENANT_SUSPENDED'
                ? 403
                : 500;

          return reply.code(statusCode).send(error);
        }

        // Unexpected error
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            ip: request.ip,
          },
          'Unexpected error building login URL'
        );

        return reply.code(500).send({
          error: {
            code: 'AUTH_KEYCLOAK_ERROR',
            message: 'Failed to build authorization URL',
          },
        });
      }
    }
  );

  /**
   * GET /auth/callback
   *
   * OAuth 2.0 callback - exchange authorization code for tokens
   *
   * Query Parameters:
   * - code: Authorization code from Keycloak
   * - tenantSlug: Tenant identifier
   * - state: Optional CSRF protection token (should match login request)
   *
   * Response:
   * - 200: { success: true, access_token, refresh_token, expires_in, refresh_expires_in }
   * - 400: Validation error
   * - 401: Code exchange failed (expired or invalid code)
   * - 403: Tenant not found or suspended
   * - 429: Rate limited
   */
  fastify.get<{
    Querystring: z.infer<typeof CallbackQuerySchema>;
  }>(
    '/auth/callback',
    {
      preHandler: [authRateLimitHook],
      schema: {
        description: 'OAuth 2.0 callback - exchange authorization code for tokens',
        tags: ['auth'],
        querystring: {
          type: 'object',
          required: ['code', 'tenantSlug'],
          properties: {
            code: { type: 'string', description: 'Authorization code' },
            tenantSlug: {
              type: 'string',
              description: 'Tenant identifier',
              pattern: '^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$',
            },
            state: { type: 'string', description: 'CSRF token' },
            codeVerifier: { type: 'string', description: 'PKCE code verifier' },
          },
        },
        response: {
          200: {
            description: 'Tokens exchanged successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              access_token: { type: 'string' },
              refresh_token: { type: 'string' },
              token_type: { type: 'string' },
              expires_in: { type: 'number' },
              refresh_expires_in: { type: 'number' },
            },
          },
          400: {
            description: 'Validation error',
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object' },
                },
              },
            },
          },
          401: {
            description: 'Code exchange failed',
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object' },
                },
              },
            },
          },
          403: {
            description: 'Tenant not found or suspended',
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object' },
                },
              },
            },
          },
          429: {
            description: 'Rate limited',
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object' },
                },
              },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Querystring: z.infer<typeof CallbackQuerySchema> }>,
      reply: FastifyReply
    ) => {
      try {
        const { code, tenantSlug, state } = request.query;

        // Exchange authorization code for tokens
        // Note: redirectUri must match the one used in /auth/login
        const redirectUri = config.oauthCallbackUrl;
        const tokens = await authService.exchangeCode(
          tenantSlug,
          code,
          redirectUri,
          request.query.codeVerifier
        );

        logger.info(
          {
            tenantSlug,
            hasState: !!state,
            ip: request.ip,
            expiresIn: tokens.expires_in,
          },
          'OAuth callback successful - tokens issued'
        );

        return reply.send({
          success: true,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_type: tokens.token_type,
          expires_in: tokens.expires_in,
          refresh_expires_in: tokens.refresh_expires_in,
        });
      } catch (error: any) {
        // AuthService throws Constitution-compliant errors
        if (error.error && error.error.code) {
          const statusCode =
            error.error.code === 'AUTH_CODE_EXCHANGE_FAILED'
              ? 401
              : error.error.code === 'AUTH_TENANT_NOT_FOUND'
                ? 404
                : error.error.code === 'AUTH_TENANT_SUSPENDED'
                  ? 403
                  : 500;

          return reply.code(statusCode).send(error);
        }

        // Unexpected error
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            ip: request.ip,
          },
          'Unexpected error in OAuth callback'
        );

        return reply.code(500).send({
          error: {
            code: 'AUTH_KEYCLOAK_ERROR',
            message: 'Failed to exchange authorization code',
          },
        });
      }
    }
  );

  /**
   * POST /auth/refresh
   *
   * Refresh access token using refresh token
   *
   * Body:
   * - tenantSlug: Tenant identifier
   * - refreshToken: Valid refresh token
   *
   * Response:
   * - 200: { access_token, refresh_token, expires_in, refresh_expires_in, token_type }
   * - 400: Validation error
   * - 401: Token refresh failed (invalid or expired refresh token)
   * - 403: Tenant not found or suspended
   */
  fastify.post<{
    Body: z.infer<typeof RefreshBodySchema>;
  }>(
    '/auth/refresh',
    {
      preHandler: [authRateLimitHook],
      schema: {
        description: 'Refresh access token using refresh token',
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['tenantSlug', 'refreshToken'],
          properties: {
            tenantSlug: {
              type: 'string',
              description: 'Tenant identifier',
              pattern: '^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$',
            },
            refreshToken: { type: 'string', description: 'Refresh token' },
          },
        },
        response: {
          200: {
            description: 'Token refreshed successfully',
            type: 'object',
            properties: {
              access_token: { type: 'string' },
              refresh_token: { type: 'string' },
              expires_in: { type: 'number' },
              refresh_expires_in: { type: 'number' },
              token_type: { type: 'string' },
            },
          },
          400: {
            description: 'Validation error',
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object' },
                },
              },
            },
          },
          401: {
            description: 'Token refresh failed',
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object' },
                },
              },
            },
          },
          403: {
            description: 'Tenant not found or suspended',
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object' },
                },
              },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof RefreshBodySchema> }>,
      reply: FastifyReply
    ) => {
      try {
        const { tenantSlug, refreshToken } = request.body;

        // Refresh tokens via AuthService
        const tokens = await authService.refreshTokens(tenantSlug, refreshToken);

        logger.info(
          {
            tenantSlug,
            ip: request.ip,
            expiresIn: tokens.expires_in,
          },
          'Access token refreshed successfully'
        );

        return reply.send({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expires_in,
          refresh_expires_in: tokens.refresh_expires_in,
          token_type: tokens.token_type,
        });
      } catch (error: any) {
        // AuthService throws Constitution-compliant errors
        if (error.error && error.error.code) {
          const statusCode =
            error.error.code === 'AUTH_TOKEN_REFRESH_FAILED'
              ? 401
              : error.error.code === 'AUTH_TENANT_NOT_FOUND'
                ? 404
                : error.error.code === 'AUTH_TENANT_SUSPENDED'
                  ? 403
                  : 500;

          return reply.code(statusCode).send(error);
        }

        // Unexpected error
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            ip: request.ip,
          },
          'Unexpected error refreshing token'
        );

        return reply.code(500).send({
          error: {
            code: 'AUTH_KEYCLOAK_ERROR',
            message: 'Failed to refresh token',
          },
        });
      }
    }
  );

  /**
   * POST /auth/logout
   *
   * Logout user and revoke tokens
   *
   * Body:
   * - tenantSlug: Tenant identifier
   * - refreshToken: Refresh token to revoke
   *
   * Response:
   * - 200: { success: true }
   * - 400: Validation error
   * - 401: Not authenticated
   *
   * Side Effects:
   * - Revokes tokens in Keycloak (best-effort)
   *
   * Note: Returns success even if revocation fails (token will expire naturally)
   */
  fastify.post<{
    Body: z.infer<typeof LogoutBodySchema>;
  }>(
    '/auth/logout',
    {
      preHandler: [authRateLimitHook, authMiddleware],
      schema: {
        description: 'Logout user and revoke tokens',
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['tenantSlug', 'refreshToken'],
          properties: {
            tenantSlug: {
              type: 'string',
              description: 'Tenant identifier',
              pattern: '^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$',
            },
            refreshToken: { type: 'string', description: 'Refresh token' },
          },
        },
        response: {
          200: {
            description: 'Logout successful',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          400: {
            description: 'Validation error',
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object' },
                },
              },
            },
          },
          401: {
            description: 'Not authenticated',
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof LogoutBodySchema> }>,
      reply: FastifyReply
    ) => {
      try {
        const { tenantSlug, refreshToken } = request.body;

        // Revoke tokens (best-effort - doesn't throw on failure)
        await authService.revokeTokens(tenantSlug, refreshToken, 'refresh_token');

        logger.info(
          {
            tenantSlug,
            userId: request.user?.id,
            ip: request.ip,
          },
          'User logged out successfully'
        );

        return reply.send({ success: true });
      } catch (error: any) {
        // Even if an unexpected error occurs, return success
        // Token revocation is best-effort
        logger.warn(
          {
            error: error instanceof Error ? error.message : String(error),
            ip: request.ip,
          },
          'Logout completed with error'
        );

        return reply.send({ success: true });
      }
    }
  );

  /**
   * GET /auth/me
   *
   * Get current authenticated user information
   *
   * Response:
   * - 200: { id, username, email, name, roles, tenant }
   * - 401: Not authenticated
   */
  fastify.get(
    '/auth/me',
    {
      preHandler: [authMiddleware],
      schema: {
        description: 'Get current authenticated user information',
        tags: ['auth'],
        response: {
          200: {
            description: 'Current user information',
            type: 'object',
            properties: {
              id: { type: 'string' },
              username: { type: 'string' },
              email: { type: 'string' },
              name: { type: 'string' },
              roles: { type: 'array', items: { type: 'string' } },
              tenantSlug: { type: 'string' },
            },
          },
          401: {
            description: 'Not authenticated',
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // authMiddleware ensures request.user is present
      if (!request.user) {
        return reply.code(401).send({
          error: {
            code: 'AUTH_REQUIRED',
            message: 'User information not available',
          },
        });
      }

      return reply.send({
        id: request.user.id,
        username: request.user.username,
        email: request.user.email,
        name: request.user.name,
        roles: request.user.roles,
        tenantSlug: request.user.tenantSlug,
      });
    }
  );

  /**
   * GET /auth/jwks/:tenantSlug
   *
   * Proxy JWKS endpoint for tenant realm
   *
   * Params:
   * - tenantSlug: Tenant identifier
   *
   * Response:
   * - 200: JWKS JSON (cached for 10 minutes)
   * - 400: Invalid tenant slug format
   * - 404: Tenant not found
   * - 500: Failed to fetch JWKS from Keycloak
   *
   * Security:
   * - Validates tenant slug format to prevent SSRF
   * - Caches JWKS in Redis with 10-minute TTL
   * - Returns raw JWKS JSON from Keycloak
   */
  fastify.get<{
    Params: z.infer<typeof JwksParamsSchema>;
  }>(
    '/auth/jwks/:tenantSlug',
    {
      // SECURITY: Rate limit JWKS endpoint to prevent tenant enumeration
      // and cache miss amplification DDoS (each miss triggers a Keycloak fetch).
      preHandler: [authRateLimitHook],
      schema: {
        description: 'Get JWKS for tenant realm (cached)',
        tags: ['auth'],
        params: {
          type: 'object',
          required: ['tenantSlug'],
          properties: {
            tenantSlug: { type: 'string', description: 'Tenant identifier' },
          },
        },
        response: {
          200: {
            description: 'JWKS JSON',
            type: 'object',
            properties: {
              keys: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    kid: { type: 'string' },
                    kty: { type: 'string' },
                    alg: { type: 'string' },
                    use: { type: 'string' },
                    n: { type: 'string' },
                    e: { type: 'string' },
                  },
                  additionalProperties: true, // Allow other JWKS properties
                },
              },
            },
          },
          400: {
            description: 'Invalid tenant slug',
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object' },
                },
              },
            },
          },
          404: {
            description: 'Tenant not found',
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
          500: {
            description: 'Failed to fetch JWKS',
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: z.infer<typeof JwksParamsSchema> }>,
      reply: FastifyReply
    ) => {
      try {
        // Validate tenant slug format (SSRF prevention)
        const validation = JwksParamsSchema.safeParse(request.params);
        if (!validation.success) {
          return reply.code(400).send({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid tenant slug',
              details: validation.error.flatten(),
            },
          });
        }

        const { tenantSlug } = validation.data;

        // Check Redis cache first
        const cacheKey = `auth:jwks:${tenantSlug}`;
        const cached = await redis.get(cacheKey);

        if (cached) {
          logger.debug(
            {
              tenantSlug,
              cacheHit: true,
            },
            'JWKS cache hit'
          );

          return reply.type('application/json').send(JSON.parse(cached));
        }

        // Cache miss - fetch from Keycloak
        const jwksUrl = `${config.keycloakUrl}/realms/${tenantSlug}/protocol/openid-connect/certs`;

        logger.debug(
          {
            tenantSlug,
            jwksUrl,
            cacheMiss: true,
          },
          'Fetching JWKS from Keycloak'
        );

        const response = await axios.get(jwksUrl, {
          timeout: 5000,
          validateStatus: (status) => status < 500, // Allow 4xx for better error handling
        });

        // Handle Keycloak errors
        if (response.status === 404) {
          return reply.code(404).send({
            error: {
              code: 'TENANT_NOT_FOUND',
              message: 'Tenant not found in Keycloak',
            },
          });
        }

        if (response.status >= 400) {
          logger.error(
            {
              tenantSlug,
              keycloakStatus: response.status,
              keycloakError: response.data,
            },
            'Keycloak JWKS fetch failed'
          );

          return reply.code(500).send({
            error: {
              code: 'JWKS_FETCH_FAILED',
              message: 'Failed to fetch JWKS from Keycloak',
            },
          });
        }

        const jwks = response.data;

        // Cache JWKS with 10-minute TTL
        const ttlSeconds = Math.floor(config.jwksCacheTtl / 1000);
        await redis.setex(cacheKey, ttlSeconds, JSON.stringify(jwks));

        logger.info(
          {
            tenantSlug,
            ttl: ttlSeconds,
            keysCount: jwks.keys?.length || 0,
          },
          'JWKS fetched and cached successfully'
        );

        return reply.type('application/json').send(jwks);
      } catch (error: any) {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
          'Unexpected error fetching JWKS'
        );

        // Handle axios network errors
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
          return reply.code(500).send({
            error: {
              code: 'JWKS_FETCH_FAILED',
              message: 'Failed to fetch JWKS from Keycloak',
            },
          });
        }

        return reply.code(500).send({
          error: {
            code: 'AUTH_KEYCLOAK_ERROR',
            message: 'Failed to retrieve JWKS',
          },
        });
      }
    }
  );
}
