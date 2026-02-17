// apps/core-api/src/__tests__/auth/unit/auth.service.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from '../../../services/auth.service.js';
import type { KeycloakService, KeycloakTokenResponse } from '../../../services/keycloak.service.js';
import type { TenantService } from '../../../services/tenant.service.js';
import type { Tenant } from '@plexica/database';

// Mock logger
vi.mock('../../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock config
vi.mock('../../../config/index.js', () => ({
  config: {
    keycloakUrl: 'http://localhost:8080',
    oauthCallbackUrl: 'http://localhost:3001/auth/callback', // CRITICAL #2 fix: redirect URI origin allowlist
  },
}));

describe('AuthService', () => {
  let authService: AuthService;
  let mockKeycloakService: Partial<KeycloakService>;
  let mockTenantService: Partial<TenantService>;

  // Helper to create mock tenant with all required fields
  const createMockTenant = (overrides: Partial<Tenant> = {}): Tenant => ({
    id: 'tenant-1',
    slug: 'test-corp',
    name: 'Test Corp',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    settings: {},
    theme: {},
    translationOverrides: {},
    defaultLocale: 'en',
    ...overrides,
  });

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mock services
    mockKeycloakService = {
      exchangeAuthorizationCode: vi.fn(),
      refreshToken: vi.fn(),
      revokeToken: vi.fn(),
    };

    mockTenantService = {
      getTenantBySlug: vi.fn(),
    };

    // Create AuthService instance with mocked dependencies
    authService = new AuthService(
      mockKeycloakService as KeycloakService,
      mockTenantService as TenantService
    );
  });

  describe('buildLoginUrl()', () => {
    it('should generate correct authorization URL with all parameters', async () => {
      const mockTenant = createMockTenant({
        slug: 'acme-corp',
        name: 'Acme Corp',
      });

      vi.mocked(mockTenantService.getTenantBySlug!).mockResolvedValue(mockTenant);

      const url = await authService.buildLoginUrl(
        'acme-corp',
        'http://localhost:3001/auth/callback',
        'random-state-123'
      );

      expect(url).toContain('http://localhost:8080/realms/acme-corp/protocol/openid-connect/auth');
      expect(url).toContain('client_id=plexica-web');
      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fauth%2Fcallback');
      expect(url).toContain('response_type=code');
      expect(url).toContain('scope=openid+profile+email');
      expect(url).toContain('state=random-state-123');
      expect(mockTenantService.getTenantBySlug).toHaveBeenCalledWith('acme-corp');
    });

    it('should generate URL without state parameter when not provided', async () => {
      const mockTenant = createMockTenant({
        slug: 'test-corp',
        name: 'Test Corp',
      });

      vi.mocked(mockTenantService.getTenantBySlug!).mockResolvedValue(mockTenant);

      const url = await authService.buildLoginUrl(
        'test-corp',
        'http://localhost:3001/auth/callback'
      );

      expect(url).not.toContain('state=');
      expect(url).toContain('client_id=plexica-web');
    });

    it('should throw error for suspended tenant (Edge Case #9)', async () => {
      const suspendedTenant = createMockTenant({
        id: 'tenant-2',
        slug: 'suspended-corp',
        name: 'Suspended Corp',
        status: 'SUSPENDED',
      });

      vi.mocked(mockTenantService.getTenantBySlug!).mockResolvedValue(suspendedTenant);

      await expect(
        authService.buildLoginUrl('suspended-corp', 'http://localhost:3001/auth/callback')
      ).rejects.toMatchObject({
        error: {
          code: 'AUTH_TENANT_SUSPENDED',
          message: 'This tenant account is currently suspended. Please contact support.',
          details: {
            tenantSlug: 'suspended-corp',
            status: 'SUSPENDED',
          },
        },
      });
    });

    it('should throw error for non-existent tenant', async () => {
      vi.mocked(mockTenantService.getTenantBySlug!).mockRejectedValue(
        new Error('Tenant not found')
      );

      await expect(
        authService.buildLoginUrl('nonexistent', 'http://localhost:3001/auth/callback')
      ).rejects.toMatchObject({
        error: {
          code: 'AUTH_TENANT_NOT_FOUND',
          message: 'The specified tenant does not exist.',
          details: {
            tenantSlug: 'nonexistent',
          },
        },
      });
    });
  });

  describe('exchangeCode()', () => {
    it('should successfully exchange authorization code for tokens', async () => {
      const mockTenant = createMockTenant({
        slug: 'acme-corp',
        name: 'Acme Corp',
      });

      const mockTokenResponse: KeycloakTokenResponse = {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-456',
        expires_in: 300,
        refresh_expires_in: 1800,
        token_type: 'Bearer',
      };

      vi.mocked(mockTenantService.getTenantBySlug!).mockResolvedValue(mockTenant);
      vi.mocked(mockKeycloakService.exchangeAuthorizationCode!).mockResolvedValue(
        mockTokenResponse
      );

      const tokens = await authService.exchangeCode(
        'acme-corp',
        'auth-code-789',
        'http://localhost:3001/auth/callback'
      );

      expect(tokens).toEqual(mockTokenResponse);
      expect(mockTenantService.getTenantBySlug).toHaveBeenCalledWith('acme-corp');
      expect(mockKeycloakService.exchangeAuthorizationCode).toHaveBeenCalledWith(
        'acme-corp',
        'auth-code-789',
        'http://localhost:3001/auth/callback',
        'plexica-web'
      );
    });

    it('should throw Constitution-compliant error when code exchange fails', async () => {
      const mockTenant = createMockTenant({
        slug: 'acme-corp',
        name: 'Acme Corp',
      });

      vi.mocked(mockTenantService.getTenantBySlug!).mockResolvedValue(mockTenant);
      vi.mocked(mockKeycloakService.exchangeAuthorizationCode!).mockRejectedValue(
        new Error('Invalid authorization code')
      );

      await expect(
        authService.exchangeCode('acme-corp', 'invalid-code', 'http://localhost:3001/auth/callback')
      ).rejects.toMatchObject({
        error: {
          code: 'AUTH_CODE_EXCHANGE_FAILED',
          message: 'Failed to exchange authorization code. The code may be invalid or expired.',
          details: {
            tenantSlug: 'acme-corp',
          },
        },
      });
    });

    it('should validate tenant before code exchange', async () => {
      const suspendedTenant = createMockTenant({
        id: 'tenant-2',
        slug: 'suspended-corp',
        name: 'Suspended Corp',
        status: 'SUSPENDED',
      });

      vi.mocked(mockTenantService.getTenantBySlug!).mockResolvedValue(suspendedTenant);

      await expect(
        authService.exchangeCode(
          'suspended-corp',
          'auth-code-789',
          'http://localhost:3001/auth/callback'
        )
      ).rejects.toMatchObject({
        error: {
          code: 'AUTH_TENANT_SUSPENDED',
        },
      });

      // Should not call Keycloak if tenant is suspended
      expect(mockKeycloakService.exchangeAuthorizationCode).not.toHaveBeenCalled();
    });
  });

  describe('refreshTokens()', () => {
    it('should successfully refresh tokens', async () => {
      const mockTenant = createMockTenant({
        slug: 'acme-corp',
        name: 'Acme Corp',
      });

      const mockTokenResponse: KeycloakTokenResponse = {
        access_token: 'new-access-token-123',
        refresh_token: 'new-refresh-token-456',
        expires_in: 300,
        refresh_expires_in: 1800,
        token_type: 'Bearer',
      };

      vi.mocked(mockTenantService.getTenantBySlug!).mockResolvedValue(mockTenant);
      vi.mocked(mockKeycloakService.refreshToken!).mockResolvedValue(mockTokenResponse);

      const tokens = await authService.refreshTokens('acme-corp', 'old-refresh-token');

      expect(tokens).toEqual(mockTokenResponse);
      expect(mockTenantService.getTenantBySlug).toHaveBeenCalledWith('acme-corp');
      expect(mockKeycloakService.refreshToken).toHaveBeenCalledWith(
        'acme-corp',
        'old-refresh-token',
        'plexica-web'
      );
    });

    it('should throw Constitution-compliant error when refresh fails', async () => {
      const mockTenant = createMockTenant({
        slug: 'acme-corp',
        name: 'Acme Corp',
      });

      vi.mocked(mockTenantService.getTenantBySlug!).mockResolvedValue(mockTenant);
      vi.mocked(mockKeycloakService.refreshToken!).mockRejectedValue(
        new Error('Invalid refresh token')
      );

      await expect(authService.refreshTokens('acme-corp', 'invalid-token')).rejects.toMatchObject({
        error: {
          code: 'AUTH_TOKEN_REFRESH_FAILED',
          message: 'Failed to refresh access token. The refresh token may be invalid or expired.',
          details: {
            tenantSlug: 'acme-corp',
          },
        },
      });
    });

    it('should validate tenant before token refresh', async () => {
      const suspendedTenant = createMockTenant({
        id: 'tenant-2',
        slug: 'suspended-corp',
        name: 'Suspended Corp',
        status: 'SUSPENDED',
      });

      vi.mocked(mockTenantService.getTenantBySlug!).mockResolvedValue(suspendedTenant);

      await expect(
        authService.refreshTokens('suspended-corp', 'refresh-token')
      ).rejects.toMatchObject({
        error: {
          code: 'AUTH_TENANT_SUSPENDED',
        },
      });

      // Should not call Keycloak if tenant is suspended
      expect(mockKeycloakService.refreshToken).not.toHaveBeenCalled();
    });

    it('should handle token rotation correctly', async () => {
      const mockTenant = createMockTenant({
        slug: 'acme-corp',
        name: 'Acme Corp',
      });

      const rotatedTokens: KeycloakTokenResponse = {
        access_token: 'rotated-access-token',
        refresh_token: 'rotated-refresh-token',
        expires_in: 300,
        refresh_expires_in: 1800,
        token_type: 'Bearer',
      };

      vi.mocked(mockTenantService.getTenantBySlug!).mockResolvedValue(mockTenant);
      vi.mocked(mockKeycloakService.refreshToken!).mockResolvedValue(rotatedTokens);

      const tokens = await authService.refreshTokens('acme-corp', 'old-refresh-token');

      // Verify new tokens are returned
      expect(tokens.refresh_token).toBe('rotated-refresh-token');
      expect(tokens.refresh_token).not.toBe('old-refresh-token');
    });
  });

  describe('revokeTokens()', () => {
    it('should successfully revoke refresh token', async () => {
      vi.mocked(mockKeycloakService.revokeToken!).mockResolvedValue(undefined);

      await authService.revokeTokens('acme-corp', 'refresh-token-123', 'refresh_token');

      expect(mockKeycloakService.revokeToken).toHaveBeenCalledWith(
        'acme-corp',
        'refresh-token-123',
        'refresh_token',
        'plexica-web'
      );
    });

    it('should successfully revoke access token', async () => {
      vi.mocked(mockKeycloakService.revokeToken!).mockResolvedValue(undefined);

      await authService.revokeTokens('acme-corp', 'access-token-123', 'access_token');

      expect(mockKeycloakService.revokeToken).toHaveBeenCalledWith(
        'acme-corp',
        'access-token-123',
        'access_token',
        'plexica-web'
      );
    });

    it('should default to refresh_token type when not specified', async () => {
      vi.mocked(mockKeycloakService.revokeToken!).mockResolvedValue(undefined);

      await authService.revokeTokens('acme-corp', 'token-123');

      expect(mockKeycloakService.revokeToken).toHaveBeenCalledWith(
        'acme-corp',
        'token-123',
        'refresh_token',
        'plexica-web'
      );
    });

    it('should not throw error when revocation fails (best effort)', async () => {
      vi.mocked(mockKeycloakService.revokeToken!).mockRejectedValue(
        new Error('Revocation endpoint unreachable')
      );

      // Should not throw - revocation is best effort
      await expect(authService.revokeTokens('acme-corp', 'token-123')).resolves.toBeUndefined();
    });

    it('should log error when revocation fails but continue', async () => {
      const { logger } = await import('../../../lib/logger.js');

      vi.mocked(mockKeycloakService.revokeToken!).mockRejectedValue(new Error('Network failure'));

      await authService.revokeTokens('acme-corp', 'token-123', 'refresh_token');

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantSlug: 'acme-corp',
          tokenType: 'refresh_token',
          error: 'Network failure',
        }),
        'Token revocation failed'
      );
    });
  });

  describe('validateTenantForAuth()', () => {
    it('should return tenant when valid and active', async () => {
      const mockTenant = createMockTenant({
        slug: 'acme-corp',
        name: 'Acme Corp',
      });

      vi.mocked(mockTenantService.getTenantBySlug!).mockResolvedValue(mockTenant);

      const tenant = await authService.validateTenantForAuth('acme-corp');

      expect(tenant).toEqual(mockTenant);
      expect(mockTenantService.getTenantBySlug).toHaveBeenCalledWith('acme-corp');
    });

    it('should reject suspended tenant with Constitution-compliant error (Edge Case #9, FR-012)', async () => {
      const suspendedTenant = createMockTenant({
        id: 'tenant-2',
        slug: 'suspended-corp',
        name: 'Suspended Corp',
        status: 'SUSPENDED',
      });

      vi.mocked(mockTenantService.getTenantBySlug!).mockResolvedValue(suspendedTenant);

      await expect(authService.validateTenantForAuth('suspended-corp')).rejects.toMatchObject({
        error: {
          code: 'AUTH_TENANT_SUSPENDED',
          message: 'This tenant account is currently suspended. Please contact support.',
          details: {
            tenantSlug: 'suspended-corp',
            status: 'SUSPENDED',
          },
        },
      });
    });

    it('should reject non-existent tenant with Constitution-compliant error', async () => {
      vi.mocked(mockTenantService.getTenantBySlug!).mockRejectedValue(
        new Error('Tenant not found')
      );

      await expect(authService.validateTenantForAuth('nonexistent')).rejects.toMatchObject({
        error: {
          code: 'AUTH_TENANT_NOT_FOUND',
          message: 'The specified tenant does not exist.',
          details: {
            tenantSlug: 'nonexistent',
          },
        },
      });
    });

    it('should allow PROVISIONING status (tenant being set up)', async () => {
      const provisioningTenant = createMockTenant({
        id: 'tenant-3',
        slug: 'new-corp',
        name: 'New Corp',
        status: 'PROVISIONING',
      });

      vi.mocked(mockTenantService.getTenantBySlug!).mockResolvedValue(provisioningTenant);

      const tenant = await authService.validateTenantForAuth('new-corp');

      expect(tenant).toEqual(provisioningTenant);
    });

    it('should log warning when tenant not found', async () => {
      const { logger } = await import('../../../lib/logger.js');

      vi.mocked(mockTenantService.getTenantBySlug!).mockRejectedValue(new Error('Database error'));

      await expect(authService.validateTenantForAuth('error-corp')).rejects.toMatchObject({
        error: {
          code: 'AUTH_TENANT_NOT_FOUND',
        },
      });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantSlug: 'error-corp',
          error: 'Database error',
        }),
        'Tenant not found for authentication'
      );
    });

    it('should log warning when tenant is suspended', async () => {
      const { logger } = await import('../../../lib/logger.js');

      const suspendedTenant = createMockTenant({
        id: 'tenant-4',
        slug: 'banned-corp',
        name: 'Banned Corp',
        status: 'SUSPENDED',
      });

      vi.mocked(mockTenantService.getTenantBySlug!).mockResolvedValue(suspendedTenant);

      await expect(authService.validateTenantForAuth('banned-corp')).rejects.toMatchObject({
        error: {
          code: 'AUTH_TENANT_SUSPENDED',
        },
      });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantSlug: 'banned-corp',
          tenantId: 'tenant-4',
          status: 'SUSPENDED',
        }),
        'Authentication denied for suspended tenant'
      );
    });
  });

  describe('Error Format Compliance', () => {
    it('should use Constitution-compliant nested error structure', async () => {
      vi.mocked(mockTenantService.getTenantBySlug!).mockRejectedValue(
        new Error('Tenant not found')
      );

      try {
        await authService.validateTenantForAuth('test');
        expect.fail('Should have thrown error');
      } catch (error: any) {
        // Verify nested structure
        expect(error).toHaveProperty('error');
        expect(error.error).toHaveProperty('code');
        expect(error.error).toHaveProperty('message');
        expect(error.error).toHaveProperty('details');

        // Verify no flat structure
        expect(error).not.toHaveProperty('code');
        expect(error).not.toHaveProperty('message');
      }
    });

    it('should include relevant details in error objects', async () => {
      const suspendedTenant = createMockTenant({
        id: 'tenant-5',
        slug: 'detail-corp',
        name: 'Detail Corp',
        status: 'SUSPENDED',
      });

      vi.mocked(mockTenantService.getTenantBySlug!).mockResolvedValue(suspendedTenant);

      try {
        await authService.validateTenantForAuth('detail-corp');
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.error.details).toMatchObject({
          tenantSlug: 'detail-corp',
          status: 'SUSPENDED',
        });
      }
    });
  });

  describe('Logging', () => {
    it('should log successful operations with structured context', async () => {
      const { logger } = await import('../../../lib/logger.js');

      const mockTenant = createMockTenant({
        slug: 'acme-corp',
        name: 'Acme Corp',
      });

      vi.mocked(mockTenantService.getTenantBySlug!).mockResolvedValue(mockTenant);

      await authService.buildLoginUrl('acme-corp', 'http://localhost:3001/auth/callback', 'state');

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantSlug: 'acme-corp',
          redirectUri: 'http://localhost:3001/auth/callback',
          hasState: true,
        }),
        'Authorization URL built for OAuth login'
      );
    });

    it('should log errors with full context', async () => {
      const { logger } = await import('../../../lib/logger.js');

      const mockTenant = createMockTenant({
        slug: 'acme-corp',
        name: 'Acme Corp',
      });

      vi.mocked(mockTenantService.getTenantBySlug!).mockResolvedValue(mockTenant);
      vi.mocked(mockKeycloakService.exchangeAuthorizationCode!).mockRejectedValue(
        new Error('Keycloak error')
      );

      try {
        await authService.exchangeCode('acme-corp', 'code', 'http://localhost:3001/auth/callback');
      } catch (error) {
        // Expected error
      }

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantSlug: 'acme-corp',
          error: 'Keycloak error',
        }),
        'Authorization code exchange failed'
      );
    });
  });
});
