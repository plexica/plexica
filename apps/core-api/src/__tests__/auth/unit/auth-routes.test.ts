/**
 * Unit tests for auth routes (Task 4.7.1)
 *
 * Tests all OAuth 2.0 authentication endpoints with Constitution-compliant error format:
 * - GET /auth/login: OAuth authorization URL builder
 * - GET /auth/callback: Token exchange
 * - POST /auth/refresh: Token refresh
 * - POST /auth/logout: Token revocation
 * - GET /auth/me: Current user info
 * - GET /auth/jwks/:tenantSlug: JWKS proxy
 *
 * Coverage Target: ≥90%
 * Constitution Compliance: Articles 3.2, 5.1, 5.3, 6.2, 6.3
 * Spec Reference: FR-016, FR-015, Spec §3.1-3.6
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import axios from 'axios';

// Mock dependencies before imports
vi.mock('../../../services/auth.service.js', () => ({
  authService: {
    buildLoginUrl: vi.fn(),
    exchangeCode: vi.fn(),
    refreshTokens: vi.fn(),
    revokeTokens: vi.fn(),
    validateTenantForAuth: vi.fn(),
  },
}));

vi.mock('../../../middleware/auth-rate-limit.js', () => ({
  authRateLimitHook: vi.fn(async () => {
    // Allow by default - override in specific tests
  }),
}));

vi.mock('../../../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (request) => {
    // Set request.user by default - override in specific tests
    (request as any).user = {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      tenantSlug: 'test-tenant',
      roles: ['user'],
    };
  }),
}));

vi.mock('../../../lib/redis.js', () => ({
  redis: {
    get: vi.fn(),
    setex: vi.fn(),
  },
}));

vi.mock('axios', () => {
  return {
    default: {
      get: vi.fn(),
      post: vi.fn(),
    },
  };
});

vi.mock('../../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../config/index.js', () => ({
  config: {
    keycloakUrl: 'https://keycloak.example.com',
    oauthCallbackUrl: 'https://app.example.com/callback',
    jwksCacheTtl: 600000, // 10 minutes in milliseconds (600 seconds * 1000)
    nodeEnv: 'test',
  },
}));

// Import mocked dependencies
import { authService } from '../../../services/auth.service.js';
import { authRateLimitHook } from '../../../middleware/auth-rate-limit.js';
import { authMiddleware } from '../../../middleware/auth.js';
import { redis } from '../../../lib/redis.js';
import { authRoutes } from '../../../routes/auth.js';

describe('Auth Routes - OAuth 2.0', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // Reset all mocks (clears call history but preserves mock functions)
    vi.clearAllMocks();

    // Create fresh Fastify instance
    app = Fastify();

    // Register auth routes
    await app.register(authRoutes);

    // Await readiness
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // ========================================
  // GET /auth/login Tests
  // ========================================
  describe('GET /auth/login', () => {
    it('should return authUrl on successful request', async () => {
      const mockAuthUrl =
        'https://keycloak.example.com/realms/test-tenant/protocol/openid-connect/auth?client_id=plexica-web&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback&response_type=code&scope=openid+profile+email&state=csrf-token-123';

      vi.mocked(authService.buildLoginUrl).mockResolvedValue(mockAuthUrl);

      const response = await app.inject({
        method: 'GET',
        url: '/auth/login',
        query: {
          tenantSlug: 'test-tenant',
          redirectUri: 'https://app.example.com/callback',
          state: 'csrf-token-123',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ authUrl: mockAuthUrl });
      expect(authService.buildLoginUrl).toHaveBeenCalledWith(
        'test-tenant',
        'https://app.example.com/callback',
        'csrf-token-123'
      );
    });

    it('should return authUrl without state when state is not provided', async () => {
      const mockAuthUrl =
        'https://keycloak.example.com/realms/test-tenant/protocol/openid-connect/auth?client_id=plexica-web&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback&response_type=code&scope=openid+profile+email';

      vi.mocked(authService.buildLoginUrl).mockResolvedValue(mockAuthUrl);

      const response = await app.inject({
        method: 'GET',
        url: '/auth/login',
        query: {
          tenantSlug: 'test-tenant',
          redirectUri: 'https://app.example.com/callback',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ authUrl: mockAuthUrl });
      expect(authService.buildLoginUrl).toHaveBeenCalledWith(
        'test-tenant',
        'https://app.example.com/callback',
        undefined
      );
    });

    it('should return 400 VALIDATION_ERROR when tenantSlug is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/login',
        query: {
          redirectUri: 'https://app.example.com/callback',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Invalid query parameters');
      expect(body.error.details).toBeDefined();
    });

    it('should return 400 VALIDATION_ERROR when tenantSlug has invalid format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/login',
        query: {
          tenantSlug: 'INVALID_SLUG!',
          redirectUri: 'https://app.example.com/callback',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Invalid query parameters');
    });

    it('should return 400 VALIDATION_ERROR when redirectUri is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/login',
        query: {
          tenantSlug: 'test-tenant',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 VALIDATION_ERROR when redirectUri is not a valid URL', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/login',
        query: {
          tenantSlug: 'test-tenant',
          redirectUri: 'not-a-url',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 403 AUTH_TENANT_NOT_FOUND when tenant does not exist', async () => {
      vi.mocked(authService.buildLoginUrl).mockRejectedValue({
        error: {
          code: 'AUTH_TENANT_NOT_FOUND',
          message: 'The specified tenant does not exist.',
          details: { tenantSlug: 'nonexistent-tenant' },
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/auth/login',
        query: {
          tenantSlug: 'nonexistent-tenant',
          redirectUri: 'https://app.example.com/callback',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error.code).toBe('AUTH_TENANT_NOT_FOUND');
      expect(body.error.details.tenantSlug).toBe('nonexistent-tenant');
    });

    it('should return 403 AUTH_TENANT_SUSPENDED when tenant is suspended', async () => {
      vi.mocked(authService.buildLoginUrl).mockRejectedValue({
        error: {
          code: 'AUTH_TENANT_SUSPENDED',
          message: 'The tenant is currently suspended.',
          details: { tenantSlug: 'suspended-tenant' },
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/auth/login',
        query: {
          tenantSlug: 'suspended-tenant',
          redirectUri: 'https://app.example.com/callback',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error.code).toBe('AUTH_TENANT_SUSPENDED');
    });

    it('should return 429 AUTH_RATE_LIMITED when rate limited', async () => {
      // Override authRateLimitHook to block request
      vi.mocked(authRateLimitHook).mockImplementationOnce(async (_request, reply) => {
        return reply.code(429).send({
          error: {
            code: 'AUTH_RATE_LIMITED',
            message: 'Too many authentication attempts. Please try again later.',
            details: { retryAfter: 60 },
          },
        });
      });

      const response = await app.inject({
        method: 'GET',
        url: '/auth/login',
        query: {
          tenantSlug: 'test-tenant',
          redirectUri: 'https://app.example.com/callback',
        },
      });

      expect(response.statusCode).toBe(429);
      expect(response.json().error.code).toBe('AUTH_RATE_LIMITED');
    });

    it('should return 500 INTERNAL_ERROR on unexpected error', async () => {
      vi.mocked(authService.buildLoginUrl).mockRejectedValue(new Error('Unexpected error'));

      const response = await app.inject({
        method: 'GET',
        url: '/auth/login',
        query: {
          tenantSlug: 'test-tenant',
          redirectUri: 'https://app.example.com/callback',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('Failed to build authorization URL');
    });
  });

  // ========================================
  // GET /auth/callback Tests
  // ========================================
  describe('GET /auth/callback', () => {
    it('should return tokens with success=true on successful token exchange', async () => {
      const mockTokens = {
        success: true,
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 300,
        refresh_expires_in: 1800,
        token_type: 'Bearer',
      };

      vi.mocked(authService.exchangeCode).mockResolvedValue(mockTokens);

      const response = await app.inject({
        method: 'GET',
        url: '/auth/callback',
        query: {
          code: 'auth-code-123',
          tenantSlug: 'test-tenant',
          state: 'csrf-token-123',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(mockTokens);
      expect(authService.exchangeCode).toHaveBeenCalledWith(
        'test-tenant',
        'auth-code-123',
        'https://app.example.com/callback'
      );
    });

    it('should return tokens without state when state is not provided', async () => {
      const mockTokens = {
        success: true,
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 300,
        refresh_expires_in: 1800,
        token_type: 'Bearer',
      };

      vi.mocked(authService.exchangeCode).mockResolvedValue(mockTokens);

      const response = await app.inject({
        method: 'GET',
        url: '/auth/callback',
        query: {
          code: 'auth-code-123',
          tenantSlug: 'test-tenant',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(mockTokens);
    });

    it('should return 400 VALIDATION_ERROR when code is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/callback',
        query: {
          tenantSlug: 'test-tenant',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Invalid query parameters');
    });

    it('should return 400 VALIDATION_ERROR when tenantSlug is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/callback',
        query: {
          code: 'auth-code-123',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 VALIDATION_ERROR when tenantSlug has invalid format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/callback',
        query: {
          code: 'auth-code-123',
          tenantSlug: 'INVALID_SLUG!',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 AUTH_CODE_EXCHANGE_FAILED when code exchange fails', async () => {
      vi.mocked(authService.exchangeCode).mockRejectedValue({
        error: {
          code: 'AUTH_CODE_EXCHANGE_FAILED',
          message: 'Failed to exchange authorization code for tokens.',
          details: { reason: 'Invalid or expired authorization code' },
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/auth/callback',
        query: {
          code: 'expired-code',
          tenantSlug: 'test-tenant',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('AUTH_CODE_EXCHANGE_FAILED');
    });

    it('should return 403 AUTH_TENANT_NOT_FOUND when tenant does not exist', async () => {
      vi.mocked(authService.exchangeCode).mockRejectedValue({
        error: {
          code: 'AUTH_TENANT_NOT_FOUND',
          message: 'The specified tenant does not exist.',
          details: { tenantSlug: 'nonexistent-tenant' },
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/auth/callback',
        query: {
          code: 'auth-code-123',
          tenantSlug: 'nonexistent-tenant',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error.code).toBe('AUTH_TENANT_NOT_FOUND');
    });

    it('should return 403 AUTH_TENANT_SUSPENDED when tenant is suspended', async () => {
      vi.mocked(authService.exchangeCode).mockRejectedValue({
        error: {
          code: 'AUTH_TENANT_SUSPENDED',
          message: 'The tenant is currently suspended.',
          details: { tenantSlug: 'suspended-tenant' },
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/auth/callback',
        query: {
          code: 'auth-code-123',
          tenantSlug: 'suspended-tenant',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error.code).toBe('AUTH_TENANT_SUSPENDED');
    });

    it('should return 429 AUTH_RATE_LIMITED when rate limited', async () => {
      vi.mocked(authRateLimitHook).mockImplementationOnce(async (_request, reply) => {
        return reply.code(429).send({
          error: {
            code: 'AUTH_RATE_LIMITED',
            message: 'Too many authentication attempts. Please try again later.',
            details: { retryAfter: 60 },
          },
        });
      });

      const response = await app.inject({
        method: 'GET',
        url: '/auth/callback',
        query: {
          code: 'auth-code-123',
          tenantSlug: 'test-tenant',
        },
      });

      expect(response.statusCode).toBe(429);
      expect(response.json().error.code).toBe('AUTH_RATE_LIMITED');
    });

    it('should return 500 INTERNAL_ERROR on unexpected error', async () => {
      vi.mocked(authService.exchangeCode).mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await app.inject({
        method: 'GET',
        url: '/auth/callback',
        query: {
          code: 'auth-code-123',
          tenantSlug: 'test-tenant',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('Failed to exchange authorization code');
    });
  });

  // ========================================
  // POST /auth/refresh Tests
  // ========================================
  describe('POST /auth/refresh', () => {
    it('should return new tokens on successful refresh', async () => {
      const mockTokens = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 300,
        refresh_expires_in: 1800,
        token_type: 'Bearer',
      };

      vi.mocked(authService.refreshTokens).mockResolvedValue(mockTokens);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          tenantSlug: 'test-tenant',
          refreshToken: 'old-refresh-token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(mockTokens);
      expect(authService.refreshTokens).toHaveBeenCalledWith('test-tenant', 'old-refresh-token');
    });

    it('should return 400 VALIDATION_ERROR when tenantSlug is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          refreshToken: 'old-refresh-token',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Invalid request body');
    });

    it('should return 400 VALIDATION_ERROR when refreshToken is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          tenantSlug: 'test-tenant',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 VALIDATION_ERROR when tenantSlug has invalid format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          tenantSlug: 'INVALID_SLUG!',
          refreshToken: 'old-refresh-token',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 AUTH_TOKEN_REFRESH_FAILED when refresh token is invalid', async () => {
      vi.mocked(authService.refreshTokens).mockRejectedValue({
        error: {
          code: 'AUTH_TOKEN_REFRESH_FAILED',
          message: 'Failed to refresh access token.',
          details: { reason: 'Invalid or expired refresh token' },
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          tenantSlug: 'test-tenant',
          refreshToken: 'invalid-refresh-token',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('AUTH_TOKEN_REFRESH_FAILED');
    });

    it('should return 403 AUTH_TENANT_NOT_FOUND when tenant does not exist', async () => {
      vi.mocked(authService.refreshTokens).mockRejectedValue({
        error: {
          code: 'AUTH_TENANT_NOT_FOUND',
          message: 'The specified tenant does not exist.',
          details: { tenantSlug: 'nonexistent-tenant' },
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          tenantSlug: 'nonexistent-tenant',
          refreshToken: 'refresh-token',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error.code).toBe('AUTH_TENANT_NOT_FOUND');
    });

    it('should return 403 AUTH_TENANT_SUSPENDED when tenant is suspended', async () => {
      vi.mocked(authService.refreshTokens).mockRejectedValue({
        error: {
          code: 'AUTH_TENANT_SUSPENDED',
          message: 'The tenant is currently suspended.',
          details: { tenantSlug: 'suspended-tenant' },
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          tenantSlug: 'suspended-tenant',
          refreshToken: 'refresh-token',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error.code).toBe('AUTH_TENANT_SUSPENDED');
    });

    it('should return 500 INTERNAL_ERROR on unexpected error', async () => {
      vi.mocked(authService.refreshTokens).mockRejectedValue(new Error('Keycloak unreachable'));

      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: {
          tenantSlug: 'test-tenant',
          refreshToken: 'refresh-token',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('Failed to refresh token');
    });
  });

  // ========================================
  // POST /auth/logout Tests
  // ========================================
  describe('POST /auth/logout', () => {
    it('should return success on successful logout', async () => {
      vi.mocked(authService.revokeTokens).mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        payload: {
          tenantSlug: 'test-tenant',
          refreshToken: 'refresh-token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
      expect(authService.revokeTokens).toHaveBeenCalledWith(
        'test-tenant',
        'refresh-token',
        'refresh_token'
      );
    });

    it('should return success even if revokeTokens fails (best-effort)', async () => {
      vi.mocked(authService.revokeTokens).mockRejectedValue(new Error('Keycloak offline'));

      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        payload: {
          tenantSlug: 'test-tenant',
          refreshToken: 'refresh-token',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
    });

    it('should return 400 VALIDATION_ERROR when tenantSlug is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        payload: {
          refreshToken: 'refresh-token',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Invalid request body');
    });

    it('should return 400 VALIDATION_ERROR when refreshToken is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        payload: {
          tenantSlug: 'test-tenant',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 VALIDATION_ERROR when tenantSlug has invalid format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        payload: {
          tenantSlug: 'INVALID_SLUG!',
          refreshToken: 'refresh-token',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 AUTH_REQUIRED when authMiddleware blocks (not authenticated)', async () => {
      // Override authMiddleware to block request
      vi.mocked(authMiddleware).mockImplementationOnce(async (_request, reply) => {
        return reply.code(401).send({
          error: {
            code: 'AUTH_REQUIRED',
            message: 'Authentication is required to access this resource.',
          },
        });
      });

      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        payload: {
          tenantSlug: 'test-tenant',
          refreshToken: 'refresh-token',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('AUTH_REQUIRED');
    });
  });

  // ========================================
  // GET /auth/me Tests
  // ========================================
  describe('GET /auth/me', () => {
    it('should return user info from request.user', async () => {
      // authMiddleware mock already sets request.user
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe('user-123');
      expect(body.username).toBe('testuser');
      expect(body.email).toBe('test@example.com');
      expect(body.tenantSlug).toBe('test-tenant');
      expect(body.roles).toEqual(['user']);
    });

    it('should return 401 AUTH_REQUIRED when authMiddleware blocks', async () => {
      vi.mocked(authMiddleware).mockImplementationOnce(async (_request, reply) => {
        return reply.code(401).send({
          error: {
            code: 'AUTH_REQUIRED',
            message: 'Authentication is required to access this resource.',
          },
        });
      });

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('AUTH_REQUIRED');
    });

    it('should return 401 AUTH_REQUIRED when request.user is undefined (edge case)', async () => {
      vi.mocked(authMiddleware).mockImplementationOnce(async (request) => {
        // authMiddleware passes but doesn't set user (edge case)
        (request as any).user = undefined;
      });

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.code).toBe('AUTH_REQUIRED');
      expect(body.error.message).toBe('User information not available');
    });
  });

  // ========================================
  // GET /auth/jwks/:tenantSlug Tests
  // ========================================
  describe('GET /auth/jwks/:tenantSlug', () => {
    const mockJwks = {
      keys: [
        {
          kid: 'key-1',
          kty: 'RSA',
          alg: 'RS256',
          use: 'sig',
          n: 'mock-modulus',
          e: 'AQAB',
        },
      ],
    };

    it('should return JWKS from Keycloak on cache miss', async () => {
      const redisSpy = vi.mocked(redis.setex);
      redisSpy.mockClear();

      vi.mocked(redis.get).mockResolvedValue(null); // Cache miss

      // Use mockImplementation instead of mockResolvedValue
      vi.mocked(axios.get).mockImplementation(async () => {
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config: {} as any,
          data: mockJwks,
        };
      });

      const response = await app.inject({
        method: 'GET',
        url: '/auth/jwks/test-tenant',
      });

      console.log('response.statusCode:', response.statusCode);
      console.log('response.json():', JSON.stringify(response.json(), null, 2));
      console.log('redis.setex called with:', redisSpy.mock.calls[0]);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(mockJwks);
      expect(axios.get).toHaveBeenCalledWith(
        'https://keycloak.example.com/realms/test-tenant/protocol/openid-connect/certs',
        expect.objectContaining({
          timeout: 5000,
          validateStatus: expect.any(Function),
        })
      );
      expect(redis.setex).toHaveBeenCalledWith(
        'auth:jwks:test-tenant',
        600, // 10 minutes
        JSON.stringify(mockJwks)
      );
    });

    it('should return JWKS from Redis cache on cache hit', async () => {
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(mockJwks)); // Cache hit

      const response = await app.inject({
        method: 'GET',
        url: '/auth/jwks/test-tenant',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(mockJwks);
      expect(redis.get).toHaveBeenCalledWith('auth:jwks:test-tenant');
      expect(axios.get).not.toHaveBeenCalled(); // No Keycloak call
    });

    it('should cache JWKS in Redis with 10min TTL after fetching from Keycloak', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(axios.get).mockResolvedValue({
        status: 200,
        data: mockJwks,
      });

      await app.inject({
        method: 'GET',
        url: '/auth/jwks/test-tenant',
      });

      expect(redis.setex).toHaveBeenCalledWith(
        'auth:jwks:test-tenant',
        600,
        JSON.stringify(mockJwks)
      );
    });

    it('should return 400 VALIDATION_ERROR when tenantSlug has invalid format (SSRF prevention)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/jwks/INVALID_SLUG!',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toBe('Invalid tenant slug');
    });

    it('should return 404 TENANT_NOT_FOUND when Keycloak returns 404', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      (axios.get as any).mockResolvedValue({
        status: 404,
        data: {},
      });

      const response = await app.inject({
        method: 'GET',
        url: '/auth/jwks/nonexistent-tenant',
      });

      // Debug output
      if (response.statusCode !== 404) {
        console.log('Response body:', response.json());
        console.log('axios.get mock:', axios.get);
        console.log('axios.get type:', typeof axios.get);
      }

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error.code).toBe('TENANT_NOT_FOUND');
      expect(body.error.message).toBe('Tenant not found in Keycloak');
    });

    it('should return 500 JWKS_FETCH_FAILED when Keycloak returns 500', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(axios.get).mockResolvedValue({
        status: 500,
        data: {},
      });

      const response = await app.inject({
        method: 'GET',
        url: '/auth/jwks/test-tenant',
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.error.code).toBe('JWKS_FETCH_FAILED');
      expect(body.error.message).toBe('Failed to fetch JWKS from Keycloak');
    });

    it('should return 500 JWKS_FETCH_FAILED on network error (ECONNREFUSED)', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      const networkError = new Error('connect ECONNREFUSED 127.0.0.1:8080');
      (networkError as any).code = 'ECONNREFUSED';
      vi.mocked(axios.get).mockRejectedValue(networkError);

      const response = await app.inject({
        method: 'GET',
        url: '/auth/jwks/test-tenant',
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.error.code).toBe('JWKS_FETCH_FAILED');
    });

    it('should return 500 JWKS_FETCH_FAILED on timeout (ETIMEDOUT)', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      const timeoutError = new Error('timeout of 5000ms exceeded');
      (timeoutError as any).code = 'ETIMEDOUT';
      vi.mocked(axios.get).mockRejectedValue(timeoutError);

      const response = await app.inject({
        method: 'GET',
        url: '/auth/jwks/test-tenant',
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.error.code).toBe('JWKS_FETCH_FAILED');
    });

    it('should return 500 INTERNAL_ERROR on unexpected error', async () => {
      vi.mocked(redis.get).mockRejectedValue(new Error('Redis connection failed'));

      const response = await app.inject({
        method: 'GET',
        url: '/auth/jwks/test-tenant',
      });

      expect(response.statusCode).toBe(500);
      const body = response.json();
      expect(body.error.code).toBe('INTERNAL_ERROR');
      expect(body.error.message).toBe('Failed to retrieve JWKS');
    });
  });
});
