// apps/core-api/src/services/auth.service.ts

import type { Tenant } from '@plexica/database';
import {
  keycloakService,
  type KeycloakTokenResponse,
  type KeycloakService,
} from './keycloak.service.js';
import { tenantService, type TenantService } from './tenant.service.js';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

/**
 * AuthService
 *
 * Orchestrates OAuth 2.0 Authorization Code flow for tenant authentication.
 * Delegates token operations to KeycloakService and validates tenants via TenantService.
 *
 * Constitution Compliance:
 * - Article 3.2: Service layer encapsulation
 * - Article 5.1: Tenant validation before authentication
 * - Article 6.2: Constitution-compliant error format
 * - Article 6.3: Structured Pino logging
 */
export class AuthService {
  private readonly keycloakService: KeycloakService;
  private readonly tenantService: TenantService;

  constructor(keycloakServiceInstance?: KeycloakService, tenantServiceInstance?: TenantService) {
    this.keycloakService = keycloakServiceInstance || keycloakService;
    this.tenantService = tenantServiceInstance || tenantService;
  }

  /**
   * Build OAuth 2.0 authorization URL for login
   *
   * @param tenantSlug - Tenant identifier
   * @param redirectUri - Callback URL after authentication
   * @param state - Optional state parameter for CSRF protection
   * @returns Authorization URL to redirect user to
   * @throws Error if tenant is invalid or suspended
   *
   * SECURITY: redirectUri is validated against config.oauthCallbackUrl origin
   * to prevent open redirect / authorization code interception attacks.
   * An attacker could set redirectUri=https://evil.com/steal to receive the
   * authorization code after the victim authenticates. The origin allowlist
   * ensures only trusted callback URLs are accepted.
   */
  async buildLoginUrl(tenantSlug: string, redirectUri: string, state?: string): Promise<string> {
    // SECURITY: Validate redirectUri origin against allowlist to prevent open redirect attacks
    // Only allow redirect URIs whose origin matches the configured OAuth callback URL
    try {
      const allowedOrigin = new URL(config.oauthCallbackUrl).origin;
      const requestedOrigin = new URL(redirectUri).origin;

      if (requestedOrigin !== allowedOrigin) {
        logger.warn(
          {
            tenantSlug,
            redirectUri,
            requestedOrigin,
            allowedOrigin,
          },
          '[SECURITY] Open redirect attempt blocked - redirectUri origin does not match allowlist'
        );

        throw {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid redirect URI: origin is not allowed',
            details: {
              allowedOrigin,
            },
          },
        };
      }
    } catch (error: any) {
      // Re-throw Constitution-compliant errors from the block above
      if (error?.error?.code === 'VALIDATION_ERROR') {
        throw error;
      }
      // URL parsing failed — reject malformed URIs
      logger.warn(
        {
          tenantSlug,
          redirectUri,
          error: error instanceof Error ? error.message : String(error),
        },
        '[SECURITY] Malformed redirectUri rejected'
      );

      throw {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid redirect URI format',
        },
      };
    }

    // Validate tenant exists and is not suspended
    await this.validateTenantForAuth(tenantSlug);

    const params = new URLSearchParams({
      client_id: 'plexica-web',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
    });

    if (state) {
      params.append('state', state);
    }

    const authUrl = `${config.keycloakUrl}/realms/${tenantSlug}/protocol/openid-connect/auth?${params.toString()}`;

    logger.info(
      {
        tenantSlug,
        redirectUri,
        hasState: !!state,
      },
      'Authorization URL built for OAuth login'
    );

    return authUrl;
  }

  /**
   * Exchange authorization code for access and refresh tokens
   *
   * @param tenantSlug - Tenant identifier
   * @param code - Authorization code from callback
   * @param redirectUri - Same redirect URI used in authorization request
   * @param codeVerifier - PKCE code verifier (required when PKCE was used in auth request)
   * @returns Token response with access_token, refresh_token, etc.
   * @throws Error if code exchange fails or tenant is invalid
   */
  async exchangeCode(
    tenantSlug: string,
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<KeycloakTokenResponse> {
    // Validate tenant before token exchange
    await this.validateTenantForAuth(tenantSlug);

    try {
      const tokens = await this.keycloakService.exchangeAuthorizationCode(
        tenantSlug,
        code,
        redirectUri,
        'plexica-web',
        codeVerifier
      );

      logger.info(
        {
          tenantSlug,
          hasAccessToken: !!tokens.access_token,
          hasRefreshToken: !!tokens.refresh_token,
          expiresIn: tokens.expires_in,
        },
        'Authorization code exchanged successfully'
      );

      return tokens;
    } catch (error) {
      logger.error(
        {
          tenantSlug,
          error: error instanceof Error ? error.message : String(error),
        },
        'Authorization code exchange failed'
      );

      throw {
        error: {
          code: 'AUTH_CODE_EXCHANGE_FAILED',
          message: 'Failed to exchange authorization code. The code may be invalid or expired.',
          details: {
            tenantSlug,
          },
        },
      };
    }
  }

  /**
   * Refresh access token using refresh token
   *
   * @param tenantSlug - Tenant identifier
   * @param refreshToken - Valid refresh token
   * @returns New token response with rotated tokens
   * @throws Error if refresh fails or tenant is invalid
   */
  async refreshTokens(tenantSlug: string, refreshToken: string): Promise<KeycloakTokenResponse> {
    // Validate tenant before token refresh
    await this.validateTenantForAuth(tenantSlug);

    try {
      const tokens = await this.keycloakService.refreshToken(
        tenantSlug,
        refreshToken,
        'plexica-web'
      );

      logger.info(
        {
          tenantSlug,
          hasAccessToken: !!tokens.access_token,
          hasRefreshToken: !!tokens.refresh_token,
          expiresIn: tokens.expires_in,
        },
        'Access token refreshed successfully'
      );

      return tokens;
    } catch (error) {
      logger.error(
        {
          tenantSlug,
          error: error instanceof Error ? error.message : String(error),
        },
        'Token refresh failed'
      );

      throw {
        error: {
          code: 'AUTH_TOKEN_REFRESH_FAILED',
          message: 'Failed to refresh access token. The refresh token may be invalid or expired.',
          details: {
            tenantSlug,
          },
        },
      };
    }
  }

  /**
   * Revoke access or refresh token
   *
   * @param tenantSlug - Tenant identifier
   * @param token - Token to revoke
   * @param tokenType - Type of token ('access_token' or 'refresh_token')
   * @throws Error if revocation fails
   */
  async revokeTokens(
    tenantSlug: string,
    token: string,
    tokenType: 'access_token' | 'refresh_token' = 'refresh_token'
  ): Promise<void> {
    try {
      await this.keycloakService.revokeToken(tenantSlug, token, tokenType, 'plexica-web');

      logger.info(
        {
          tenantSlug,
          tokenType,
        },
        'Token revoked successfully'
      );
    } catch (error) {
      logger.error(
        {
          tenantSlug,
          tokenType,
          error: error instanceof Error ? error.message : String(error),
        },
        'Token revocation failed'
      );

      // Don't throw on revocation failure - it's a best-effort operation
      // Token will expire naturally even if revocation fails
    }
  }

  /**
   * Validate tenant exists and is not suspended
   *
   * @param tenantSlug - Tenant identifier
   * @returns Tenant object if valid
   * @throws Error with Constitution-compliant format if tenant is invalid or suspended
   */
  async validateTenantForAuth(tenantSlug: string): Promise<Tenant> {
    let tenant: Tenant;

    try {
      tenant = await this.tenantService.getTenantBySlug(tenantSlug);
    } catch (error) {
      logger.warn(
        {
          tenantSlug,
          error: error instanceof Error ? error.message : String(error),
        },
        'Tenant not found for authentication'
      );

      throw {
        error: {
          code: 'AUTH_TENANT_NOT_FOUND',
          message: 'The specified tenant does not exist.',
          details: {
            tenantSlug,
          },
        },
      };
    }

    // Edge Case #9: Reject authentication for suspended tenants (FR-012)
    if (tenant.status === 'SUSPENDED') {
      logger.warn(
        {
          tenantSlug,
          tenantId: tenant.id,
          status: tenant.status,
        },
        'Authentication denied for suspended tenant'
      );

      throw {
        error: {
          code: 'AUTH_TENANT_SUSPENDED',
          message: 'This tenant account is currently suspended. Please contact support.',
          details: {
            tenantSlug,
            status: tenant.status,
          },
        },
      };
    }

    return tenant;
  }
}

// Singleton instance
export const authService = new AuthService();
