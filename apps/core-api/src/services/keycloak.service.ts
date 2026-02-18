import KcAdminClient from '@keycloak/keycloak-admin-client';
import type RealmRepresentation from '@keycloak/keycloak-admin-client/lib/defs/realmRepresentation';
import type UserRepresentation from '@keycloak/keycloak-admin-client/lib/defs/userRepresentation';
import type ClientRepresentation from '@keycloak/keycloak-admin-client/lib/defs/clientRepresentation';
import type RoleRepresentation from '@keycloak/keycloak-admin-client/lib/defs/roleRepresentation';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

/**
 * Custom error class for sanitized Keycloak errors.
 * Prevents re-sanitization in catch blocks.
 */
export class KeycloakSanitizedError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'KeycloakSanitizedError';
  }
}

/**
 * OAuth 2.0 token response from Keycloak
 */
export interface KeycloakTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_expires_in: number;
  refresh_token: string;
  token_type: string;
  id_token?: string;
  'not-before-policy'?: number;
  session_state?: string;
  scope?: string;
}

export class KeycloakService {
  // @internal - Protected for testing access only. Do not access directly in production code.
  protected client: KcAdminClient;
  private initialized = false;
  /**
   * Timestamp of the last successful authentication.
   * Used to proactively re-authenticate before the admin token expires.
   * The Keycloak admin-cli access token has a default 60-second lifespan,
   * so we re-authenticate after 50 seconds to avoid 401 errors.
   */
  private lastAuthTime = 0;
  /**
   * Maximum age (in ms) before we proactively re-authenticate.
   * Set to 50 seconds — well within the Keycloak admin-cli default
   * access token lifespan of 60 seconds.
   */
  private static readonly TOKEN_REFRESH_INTERVAL_MS = 50_000;
  /**
   * Mutex to serialize realm-scoped operations.
   * The Keycloak admin client shares a single realm config via setConfig(),
   * so concurrent operations targeting different tenants would clobber each other.
   * This promise chain ensures only one realm-scoped operation runs at a time.
   */
  private realmMutex: Promise<void> = Promise.resolve();

  constructor() {
    this.client = new KcAdminClient({
      baseUrl: config.keycloakUrl,
      realmName: 'master',
    });
  }

  /**
   * Validate realm name format to prevent injection attacks.
   * Realm names must be lowercase alphanumeric with hyphens, 1-50 chars.
   *
   * @param realmName - Realm name to validate
   * @throws Error if realm name format is invalid
   */
  private validateRealmName(realmName: string): void {
    const slugPattern = /^[a-z0-9-]{1,50}$/;
    if (!slugPattern.test(realmName)) {
      throw new Error(
        'Invalid realm name format: must be 1-50 chars, lowercase alphanumeric with hyphens only'
      );
    }
  }

  /**
   * Sanitize Keycloak error response for safe exposure to API consumers.
   * Logs full error internally, returns user-friendly message.
   *
   * @param context - Error context (e.g., 'token exchange', 'client provisioning')
   * @param status - HTTP status code
   * @param errorText - Raw Keycloak error response
   * @param realmName - Realm name (for logging)
   * @param additionalContext - Additional logging context
   * @returns Sanitized user-friendly error message
   * @throws KeycloakSanitizedError with sanitized message
   */
  private sanitizeKeycloakError(
    context: string,
    status: number,
    errorText: string,
    realmName: string,
    additionalContext?: Record<string, unknown>
  ): never {
    // Log full error for debugging (structured logging)
    logger.error(
      {
        event: `keycloak_${context.replace(/\s+/g, '_')}_failed`,
        realmName,
        statusCode: status,
        error: errorText,
        ...additionalContext,
      },
      `Keycloak ${context} failed`
    );

    // Return sanitized error based on status code
    let sanitizedMessage: string;
    if (status === 400) {
      sanitizedMessage = `Invalid request for ${context}`;
    } else if (status === 401) {
      sanitizedMessage = `Authentication failed for ${context}`;
    } else if (status === 403) {
      sanitizedMessage = `Permission denied for ${context}`;
    } else if (status === 404) {
      sanitizedMessage = `Resource not found for ${context}`;
    } else if (status >= 500) {
      sanitizedMessage = `Service unavailable for ${context}`;
    } else {
      sanitizedMessage = `Failed to complete ${context}`;
    }

    throw new KeycloakSanitizedError(sanitizedMessage, status);
  }

  /**
   * Initialize and authenticate the Keycloak admin client
   */
  async initialize(): Promise<void> {
    await this.client.auth({
      username: config.keycloakAdminUsername,
      password: config.keycloakAdminPassword,
      grantType: 'password',
      clientId: 'admin-cli',
    });

    this.initialized = true;
    this.lastAuthTime = Date.now();
  }

  /**
   * Re-authenticate (force token refresh)
   */
  private async reAuthenticate(): Promise<void> {
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Ensure the client is authenticated, proactively re-authenticating
   * before the admin token expires (default 60s lifespan).
   *
   * NOTE: The @keycloak/keycloak-admin-client does NOT auto-refresh
   * admin-cli tokens. We must handle re-authentication ourselves.
   */
  private async ensureAuth(): Promise<void> {
    const now = Date.now();
    if (!this.initialized || now - this.lastAuthTime > KeycloakService.TOKEN_REFRESH_INTERVAL_MS) {
      await this.initialize();
    }
  }

  /**
   * Execute a Keycloak operation with automatic retry on auth failure
   *
   * @internal - Protected for testing access only. Do not access directly in production code.
   */
  protected async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      // If we get a 401, try to re-authenticate and retry once.
      // Check both raw Keycloak errors (error.response.status) and
      // sanitized errors (KeycloakSanitizedError.statusCode) since
      // inner try/catch blocks in provisioning methods wrap raw 401s.
      const rawStatus = (error as { response?: { status?: number } })?.response?.status;
      const sanitizedStatus =
        error instanceof KeycloakSanitizedError ? error.statusCode : undefined;
      const message = error instanceof Error ? error.message : '';
      if (rawStatus === 401 || sanitizedStatus === 401 || message.includes('401')) {
        await this.reAuthenticate();
        return await operation();
      }
      throw error;
    }
  }

  /**
   * Execute an operation scoped to a specific tenant realm.
   * Acquires a mutex to prevent concurrent realm mutations, sets the realm,
   * runs the operation, and always resets to the master realm.
   *
   * @internal - Protected for testing access only. Do not access directly in production code.
   */
  protected async withRealmScope<T>(tenantSlug: string, operation: () => Promise<T>): Promise<T> {
    // Chain onto the mutex so only one realm-scoped operation runs at a time
    const result = new Promise<T>((resolve, reject) => {
      this.realmMutex = this.realmMutex.then(async () => {
        this.client.setConfig({ realmName: tenantSlug });
        try {
          const value = await operation();
          resolve(value);
        } catch (error) {
          reject(error);
        } finally {
          this.client.setConfig({ realmName: 'master' });
        }
      });
    });
    return result;
  }

  /**
   * Create a new realm for a tenant.
   * If the realm already exists the call is a no-op (idempotent).
   */
  async createRealm(tenantSlug: string, tenantName: string): Promise<void> {
    await this.ensureAuth();

    // Check if realm already exists to make the operation idempotent.
    // This prevents "409 Conflict / invalid_request" errors when a realm
    // was left over from a previous run (e.g. tests) or when createTenant
    // is retried after a partial failure.
    // Note: getRealm already uses withRetry internally
    const existing = await this.getRealm(tenantSlug);
    if (existing) {
      return; // Realm already exists — nothing to do
    }

    // Create the realm with retry on auth failure
    await this.withRetry(async () => {
      const realmRepresentation: RealmRepresentation = {
        realm: tenantSlug,
        displayName: tenantName,
        enabled: true,
        sslRequired: 'external',
        registrationAllowed: false,
        loginWithEmailAllowed: true,
        duplicateEmailsAllowed: false,
        resetPasswordAllowed: true,
        editUsernameAllowed: false,
        bruteForceProtected: true,
        // Token settings
        accessTokenLifespan: 900, // 15 minutes
        ssoSessionIdleTimeout: 1800, // 30 minutes
        ssoSessionMaxLifespan: 36000, // 10 hours
        // Additional security settings
        passwordPolicy:
          'length(8) and digits(1) and lowerCase(1) and upperCase(1) and specialChars(1)',
      };

      await this.client.realms.create(realmRepresentation);
    });
  }

  /**
   * Helper method to ensure a client exists in the current realm scope.
   * Creates the client if it doesn't exist (idempotent).
   *
   * @param clientId - Client ID to check/create
   * @param config - Client configuration
   */
  private async ensureClientExists(clientId: string, config: ClientRepresentation): Promise<void> {
    try {
      // Optimized: Check for specific client instead of fetching all
      const existing = await this.client.clients.find({ clientId });
      if (existing && existing.length > 0) {
        return; // Client already exists
      }
    } catch (error) {
      // If find fails, proceed with creation attempt
      logger.warn({ clientId, error }, 'Failed to check client existence, will attempt creation');
    }

    // Create client
    await this.client.clients.create({ clientId, ...config });
  }

  /**
   * Helper method to ensure a role exists in the current realm scope.
   * Creates the role if it doesn't exist (idempotent).
   *
   * @param roleName - Role name to check/create
   * @param config - Role configuration
   */
  private async ensureRoleExists(roleName: string, config: RoleRepresentation): Promise<void> {
    try {
      // Optimized: Check for specific role instead of fetching all
      const existing = await this.client.roles.findOneByName({ name: roleName });
      if (existing) {
        return; // Role already exists
      }
    } catch (error) {
      // If find fails, proceed with creation attempt
      logger.warn({ roleName, error }, 'Failed to check role existence, will attempt creation');
    }

    // Create role
    await this.client.roles.create({ name: roleName, ...config });
  }

  /**
   * Provision standard Keycloak clients for a tenant realm.
   * Creates:
   * - plexica-web: Public client for frontend (Authorization Code flow)
   * - plexica-api: Confidential client for backend (service account)
   *
   * Idempotent: Skips creation if clients already exist.
   *
   * @param realmName - Tenant slug (realm name)
   * @param webRedirectUris - Optional custom redirect URIs for web client (defaults to localhost)
   * @param webOrigins - Optional custom web origins for CORS (defaults to localhost)
   * @throws Error if client provisioning fails
   */
  async provisionRealmClients(
    realmName: string,
    webRedirectUris?: string[],
    webOrigins?: string[]
  ): Promise<void> {
    this.validateRealmName(realmName);
    await this.ensureAuth();

    // Default redirect URIs for development
    // TODO: Add environment variable support (WEB_REDIRECT_URIS, WEB_ORIGINS) in Phase 4
    const defaultRedirectUris = [
      'http://localhost:3000/*', // Development frontend
      'http://localhost:5173/*', // Vite dev server
    ];

    const defaultOrigins = ['http://localhost:3000', 'http://localhost:5173'];

    await this.withRetry(() =>
      this.withRealmScope(realmName, async () => {
        try {
          // Provision plexica-web (public client)
          await this.ensureClientExists('plexica-web', {
            name: 'Plexica Web Application',
            description: 'Public client for Plexica frontend application',
            enabled: true,
            publicClient: true,
            protocol: 'openid-connect',
            standardFlowEnabled: true, // Authorization Code flow
            directAccessGrantsEnabled: false, // Disable ROPC (Resource Owner Password Credentials)
            implicitFlowEnabled: false, // Disable implicit flow (security best practice)
            serviceAccountsEnabled: false,
            fullScopeAllowed: true, // Access to all realm roles
            redirectUris: webRedirectUris || defaultRedirectUris,
            webOrigins: webOrigins || defaultOrigins,
            attributes: {
              'pkce.code.challenge.method': 'S256', // Require PKCE for public clients
            },
          });

          // Provision plexica-api (confidential client)
          await this.ensureClientExists('plexica-api', {
            name: 'Plexica API Service',
            description: 'Confidential client for Plexica backend service',
            enabled: true,
            publicClient: false, // Confidential client
            protocol: 'openid-connect',
            serviceAccountsEnabled: true, // Enable service account for machine-to-machine auth
            directAccessGrantsEnabled: false,
            standardFlowEnabled: false, // Service accounts don't use Authorization Code flow
            implicitFlowEnabled: false,
            fullScopeAllowed: true,
            // Note: Client secret will be auto-generated by Keycloak
            // Retrieve it via this.client.clients.getClientSecret({ id: clientDbId })
          });
        } catch (error: unknown) {
          const keycloakError = error as { response?: { status?: number; data?: unknown } };
          const status = keycloakError.response?.status || 500;
          const errorData = JSON.stringify(keycloakError.response?.data || error);

          this.sanitizeKeycloakError('client provisioning', status, errorData, realmName);
        }
      })
    );
  }

  /**
   * Provision standard realm roles for a tenant.
   * Creates:
   * - tenant_admin: Full administrative access within the tenant
   * - user: Standard user access within the tenant
   *
   * Idempotent: Skips creation if roles already exist.
   *
   * @param realmName - Tenant slug (realm name)
   * @throws Error if role provisioning fails
   */
  async provisionRealmRoles(realmName: string): Promise<void> {
    this.validateRealmName(realmName);
    await this.ensureAuth();

    await this.withRetry(() =>
      this.withRealmScope(realmName, async () => {
        try {
          // Provision tenant_admin role
          await this.ensureRoleExists('tenant_admin', {
            description: 'Administrator role with full access within the tenant',
            composite: false,
            clientRole: false,
          });

          // Provision user role
          await this.ensureRoleExists('user', {
            description: 'Standard user role with basic access within the tenant',
            composite: false,
            clientRole: false,
          });
        } catch (error: unknown) {
          const keycloakError = error as { response?: { status?: number; data?: unknown } };
          const status = keycloakError.response?.status || 500;
          const errorData = JSON.stringify(keycloakError.response?.data || error);

          this.sanitizeKeycloakError('role provisioning', status, errorData, realmName);
        }
      })
    );
  }

  /**
   * Get realm information
   */
  async getRealm(tenantSlug: string): Promise<RealmRepresentation | undefined> {
    await this.ensureAuth();

    return this.withRetry(async () => {
      try {
        return await this.client.realms.findOne({ realm: tenantSlug });
      } catch (error: unknown) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          return undefined;
        }
        throw error;
      }
    });
  }

  /**
   * Check if a realm exists for a tenant
   */
  async realmExists(tenantSlug: string): Promise<boolean> {
    const realm = await this.getRealm(tenantSlug);
    return realm !== undefined;
  }

  /**
   * Update realm settings
   */
  async updateRealm(tenantSlug: string, updates: Partial<RealmRepresentation>): Promise<void> {
    await this.ensureAuth();

    await this.withRetry(async () => {
      await this.client.realms.update({ realm: tenantSlug }, updates);
    });
  }

  /**
   * Enable or disable a realm (used for tenant suspension).
   * When disabled, all users in the realm will be unable to authenticate.
   *
   * @param realmName - Tenant slug (realm name)
   * @param enabled - true to enable, false to disable/suspend
   * @throws Error if realm does not exist or update fails
   */
  async setRealmEnabled(realmName: string, enabled: boolean): Promise<void> {
    this.validateRealmName(realmName);
    await this.ensureAuth();

    try {
      // Verify realm exists first
      // Note: getRealm already uses withRetry internally, so we don't wrap this method
      const realm = await this.getRealm(realmName);
      if (!realm) {
        throw new Error(`Realm '${realmName}' not found`);
      }

      // Update the enabled flag (with retry on auth failure)
      await this.withRetry(async () => {
        await this.client.realms.update({ realm: realmName }, { enabled });
      });

      logger.info({ realmName, enabled }, `Realm ${enabled ? 'enabled' : 'disabled'} successfully`);
    } catch (error: unknown) {
      // Re-throw our custom "realm not found" error without sanitization
      if (error instanceof Error && error.message.includes('not found')) {
        throw error;
      }

      // Sanitize Keycloak API errors
      const keycloakError = error as { response?: { status?: number; data?: unknown } };
      const status = keycloakError.response?.status || 500;
      const errorData = JSON.stringify(keycloakError.response?.data || error);

      this.sanitizeKeycloakError('realm enable/disable', status, errorData, realmName, { enabled });
    }
  }

  /**
   * Delete a realm (tenant)
   */
  async deleteRealm(tenantSlug: string): Promise<void> {
    await this.ensureAuth();

    await this.withRetry(async () => {
      await this.client.realms.del({ realm: tenantSlug });
    });
  }

  /**
   * Create a user in a tenant's realm
   */
  async createUser(
    tenantSlug: string,
    user: {
      username: string;
      email: string;
      firstName?: string;
      lastName?: string;
      enabled?: boolean;
      emailVerified?: boolean;
    }
  ): Promise<{ id: string }> {
    await this.ensureAuth();

    return this.withRetry(() =>
      this.withRealmScope(tenantSlug, async () => {
        const userRepresentation: UserRepresentation = {
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          enabled: user.enabled ?? true,
          emailVerified: user.emailVerified ?? false,
        };

        const result = await this.client.users.create(userRepresentation);
        return { id: result.id! };
      })
    );
  }

  /**
   * Get user by ID in a tenant's realm
   */
  async getUser(tenantSlug: string, userId: string): Promise<UserRepresentation | undefined> {
    await this.ensureAuth();

    return this.withRetry(() =>
      this.withRealmScope(tenantSlug, async () => {
        try {
          const user = await this.client.users.findOne({ id: userId });
          return user;
        } catch (error: unknown) {
          const status = (error as { response?: { status?: number } })?.response?.status;
          if (status === 404) {
            return undefined;
          }
          throw error;
        }
      })
    );
  }

  /**
   * List users in a tenant's realm
   */
  async listUsers(
    tenantSlug: string,
    options?: {
      first?: number;
      max?: number;
      search?: string;
    }
  ): Promise<UserRepresentation[]> {
    await this.ensureAuth();

    return this.withRetry(() =>
      this.withRealmScope(tenantSlug, async () => {
        const users = await this.client.users.find({
          first: options?.first,
          max: options?.max,
          search: options?.search,
        });
        return users;
      })
    );
  }

  /**
   * Delete user from a tenant's realm
   */
  async deleteUser(tenantSlug: string, userId: string): Promise<void> {
    await this.ensureAuth();

    await this.withRetry(() =>
      this.withRealmScope(tenantSlug, async () => {
        await this.client.users.del({ id: userId });
      })
    );
  }

  /**
   * Set user password in a tenant's realm
   */
  async setUserPassword(
    tenantSlug: string,
    userId: string,
    password: string,
    temporary = false
  ): Promise<void> {
    await this.ensureAuth();

    await this.withRetry(() =>
      this.withRealmScope(tenantSlug, async () => {
        await this.client.users.resetPassword({
          id: userId,
          credential: {
            temporary,
            type: 'password',
            value: password,
          },
        });
      })
    );
  }

  /**
   * Exchange an authorization code for access and refresh tokens.
   * Used in the OAuth 2.0 Authorization Code flow after the user is redirected back.
   *
   * @param realmName - Tenant slug (realm name)
   * @param code - Authorization code from the callback
   * @param redirectUri - Same redirect URI used in the authorization request
   * @param clientId - Client ID (default: 'plexica-web')
   * @returns Token response with access_token, refresh_token, etc.
   * @throws Error if token exchange fails
   */
  async exchangeAuthorizationCode(
    realmName: string,
    code: string,
    redirectUri: string,
    clientId = 'plexica-web'
  ): Promise<KeycloakTokenResponse> {
    this.validateRealmName(realmName);

    const tokenEndpoint = `${config.keycloakUrl}/realms/${realmName}/protocol/openid-connect/token`;

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
    });

    try {
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.sanitizeKeycloakError(
          'authorization code exchange',
          response.status,
          errorText,
          realmName,
          { clientId }
        );
      }

      logger.info({ realmName, clientId }, 'Authorization code exchanged successfully');

      return (await response.json()) as KeycloakTokenResponse;
    } catch (error: unknown) {
      if (error instanceof KeycloakSanitizedError) {
        throw error; // Already sanitized
      }

      // Network or parsing error
      logger.error(
        { realmName, clientId, error },
        'Unexpected error during authorization code exchange'
      );
      throw new Error('Failed to exchange authorization code due to network or server error');
    }
  }

  /**
   * Refresh an access token using a refresh token.
   * With refresh token rotation enabled, this returns a new refresh token and invalidates the old one.
   *
   * @param realmName - Tenant slug (realm name)
   * @param refreshToken - The refresh token to exchange
   * @param clientId - Client ID (default: 'plexica-web')
   * @returns Token response with new access_token and refresh_token
   * @throws Error if token refresh fails
   */
  async refreshToken(
    realmName: string,
    refreshToken: string,
    clientId = 'plexica-web'
  ): Promise<KeycloakTokenResponse> {
    this.validateRealmName(realmName);

    const tokenEndpoint = `${config.keycloakUrl}/realms/${realmName}/protocol/openid-connect/token`;

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshToken,
    });

    try {
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.sanitizeKeycloakError('token refresh', response.status, errorText, realmName, {
          clientId,
        });
      }

      logger.info({ realmName, clientId }, 'Token refreshed successfully');

      return (await response.json()) as KeycloakTokenResponse;
    } catch (error: unknown) {
      if (error instanceof KeycloakSanitizedError) {
        throw error; // Already sanitized
      }

      // Network or parsing error
      logger.error({ realmName, clientId, error }, 'Unexpected error during token refresh');
      throw new Error('Failed to refresh token due to network or server error');
    }
  }

  /**
   * Revoke an access or refresh token.
   *
   * @param realmName - Tenant slug (realm name)
   * @param token - The token to revoke
   * @param tokenTypeHint - Type hint: 'access_token' or 'refresh_token' (optional but recommended)
   * @param clientId - Client ID (default: 'plexica-web')
   * @throws Error if token revocation fails
   */
  async revokeToken(
    realmName: string,
    token: string,
    tokenTypeHint?: 'access_token' | 'refresh_token',
    clientId = 'plexica-web'
  ): Promise<void> {
    this.validateRealmName(realmName);

    const revocationEndpoint = `${config.keycloakUrl}/realms/${realmName}/protocol/openid-connect/revoke`;

    const params = new URLSearchParams({
      client_id: clientId,
      token,
    });

    if (tokenTypeHint) {
      params.append('token_type_hint', tokenTypeHint);
    }

    try {
      const response = await fetch(revocationEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.sanitizeKeycloakError('token revocation', response.status, errorText, realmName, {
          clientId,
          tokenTypeHint,
        });
      }

      logger.info({ realmName, clientId, tokenTypeHint }, 'Token revoked successfully');
    } catch (error: unknown) {
      if (error instanceof KeycloakSanitizedError) {
        throw error; // Already sanitized
      }

      // Network or parsing error
      logger.error(
        { realmName, clientId, tokenTypeHint, error },
        'Unexpected error during token revocation'
      );
      throw new Error('Failed to revoke token due to network or server error');
    }
  }

  /**
   * Configure refresh token rotation for a realm.
   * When enabled, each token refresh returns a new refresh token and invalidates the old one.
   * This prevents refresh token replay attacks.
   *
   * @param realmName - Tenant slug (realm name)
   * @throws Error if configuration fails
   */
  async configureRefreshTokenRotation(realmName: string): Promise<void> {
    this.validateRealmName(realmName);
    await this.ensureAuth();

    await this.withRetry(async () => {
      try {
        await this.client.realms.update(
          { realm: realmName },
          {
            revokeRefreshToken: true, // Invalidate old refresh token on reuse
            refreshTokenMaxReuse: 0, // Don't allow reuse (rotation)
          }
        );

        logger.info({ realmName }, 'Refresh token rotation configured successfully');
      } catch (error: unknown) {
        const keycloakError = error as { response?: { status?: number; data?: unknown } };
        const status = keycloakError.response?.status || 500;
        const errorData = JSON.stringify(keycloakError.response?.data || error);

        this.sanitizeKeycloakError(
          'refresh token rotation configuration',
          status,
          errorData,
          realmName
        );
      }
    });
  }

  /**
   * Verify Keycloak is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.ensureAuth();
      // Try to fetch the master realm as a health check
      await this.client.realms.findOne({ realm: 'master' });
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const keycloakService = new KeycloakService();
