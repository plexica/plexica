import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';
import { config } from '../config/index.js';
import { verifyKeycloakToken, extractUserInfo } from '../lib/jwt.js';

// Token response from Keycloak
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
}

const loginSchema = {
  body: {
    type: 'object',
    required: ['username', 'password', 'tenant'],
    properties: {
      username: {
        type: 'string',
        minLength: 1,
        description: 'Username or email',
      },
      password: {
        type: 'string',
        minLength: 1,
        description: 'User password',
      },
      tenant: {
        type: 'string',
        minLength: 1,
        description: 'Tenant slug',
      },
    },
  },
};

const refreshTokenSchema = {
  body: {
    type: 'object',
    required: ['refreshToken', 'tenant'],
    properties: {
      refreshToken: {
        type: 'string',
        minLength: 1,
        description: 'Refresh token',
      },
      tenant: {
        type: 'string',
        minLength: 1,
        description: 'Tenant slug',
      },
    },
  },
};

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * Login endpoint
   * Authenticates user with Keycloak and returns tokens
   */
  fastify.post<{
    Body: { username: string; password: string; tenant: string };
  }>(
    '/auth/login',
    {
      schema: {
        description: 'Authenticate user and get access token',
        tags: ['auth'],
        ...loginSchema,
        response: {
          200: {
            description: 'Authentication successful',
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
              expiresIn: { type: 'number' },
              tokenType: { type: 'string' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  username: { type: 'string' },
                  email: { type: 'string' },
                  name: { type: 'string' },
                },
              },
            },
          },
          401: {
            description: 'Authentication failed',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { username: string; password: string; tenant: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { username, password, tenant } = request.body;

        // Get token from Keycloak
        const tokenUrl = `${config.keycloakUrl}/realms/${tenant}/protocol/openid-connect/token`;

        const response = await axios.post<TokenResponse>(
          tokenUrl,
          new URLSearchParams({
            grant_type: 'password',
            client_id: config.keycloakClientId,
            client_secret: config.keycloakClientSecret || '',
            username,
            password,
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        );

        const tokens = response.data;

        // Verify and decode the access token to get user info
        const payload = await verifyKeycloakToken(tokens.access_token, tenant);
        const user = extractUserInfo(payload);

        return reply.send({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresIn: tokens.expires_in,
          tokenType: tokens.token_type,
          user,
        });
      } catch (error: any) {
        request.log.error(error, 'Login failed');

        if (error.response?.status === 401) {
          return reply.code(401).send({
            error: 'Unauthorized',
            message: 'Invalid username or password',
          });
        }

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Authentication failed',
        });
      }
    }
  );

  /**
   * Refresh token endpoint
   * Exchanges refresh token for new access token
   */
  fastify.post<{
    Body: { refreshToken: string; tenant: string };
  }>(
    '/auth/refresh',
    {
      schema: {
        description: 'Refresh access token using refresh token',
        tags: ['auth'],
        ...refreshTokenSchema,
        response: {
          200: {
            description: 'Token refreshed successfully',
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
              expiresIn: { type: 'number' },
              tokenType: { type: 'string' },
            },
          },
          401: {
            description: 'Invalid or expired refresh token',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { refreshToken: string; tenant: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { refreshToken, tenant } = request.body;

        // Refresh token with Keycloak
        const tokenUrl = `${config.keycloakUrl}/realms/${tenant}/protocol/openid-connect/token`;

        const response = await axios.post<TokenResponse>(
          tokenUrl,
          new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: config.keycloakClientId,
            client_secret: config.keycloakClientSecret || '',
            refresh_token: refreshToken,
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        );

        const tokens = response.data;

        return reply.send({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresIn: tokens.expires_in,
          tokenType: tokens.token_type,
        });
      } catch (error: any) {
        request.log.error(error, 'Token refresh failed');

        if (error.response?.status === 401) {
          return reply.code(401).send({
            error: 'Unauthorized',
            message: 'Invalid or expired refresh token',
          });
        }

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: 'Token refresh failed',
        });
      }
    }
  );

  /**
   * Logout endpoint
   * Revokes tokens in Keycloak
   */
  fastify.post<{
    Body: { refreshToken: string; tenant: string };
  }>(
    '/auth/logout',
    {
      schema: {
        description: 'Logout user and revoke tokens',
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['refreshToken', 'tenant'],
          properties: {
            refreshToken: { type: 'string' },
            tenant: { type: 'string' },
          },
        },
        response: {
          204: {
            description: 'Logout successful',
            type: 'null',
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { refreshToken: string; tenant: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { refreshToken, tenant } = request.body;

        // Logout from Keycloak
        const logoutUrl = `${config.keycloakUrl}/realms/${tenant}/protocol/openid-connect/logout`;

        await axios.post(
          logoutUrl,
          new URLSearchParams({
            client_id: config.keycloakClientId,
            client_secret: config.keycloakClientSecret || '',
            refresh_token: refreshToken,
          }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        );

        return reply.code(204).send();
      } catch (error: any) {
        request.log.error(error, 'Logout failed');
        // Even if logout fails, return success to client
        return reply.code(204).send();
      }
    }
  );

  /**
   * Get current user info
   * Requires authentication
   */
  fastify.get(
    '/auth/me',
    {
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
              tenant: { type: 'string' },
            },
          },
          401: {
            description: 'Not authenticated',
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
          },
        },
      },
      preHandler: async (request, reply) => {
        // Import authMiddleware here to avoid circular dependency
        const { authMiddleware } = await import('../middleware/auth.js');
        await authMiddleware(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.code(401).send({
          error: 'Not authenticated',
        });
      }

      return reply.send({
        id: request.user.id,
        username: request.user.username,
        email: request.user.email,
        name: request.user.name,
        roles: request.user.roles,
        tenant: request.user.tenantSlug,
      });
    }
  );
}
