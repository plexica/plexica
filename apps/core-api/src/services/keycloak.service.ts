import KcAdminClient from '@keycloak/keycloak-admin-client';
import type RealmRepresentation from '@keycloak/keycloak-admin-client/lib/defs/realmRepresentation';
import type UserRepresentation from '@keycloak/keycloak-admin-client/lib/defs/userRepresentation';
import { config } from '../config/index.js';

export class KeycloakService {
  private client: KcAdminClient;
  private initialized = false;

  constructor() {
    this.client = new KcAdminClient({
      baseUrl: config.keycloakUrl,
      realmName: 'master',
    });
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
  }

  /**
   * Re-authenticate (force token refresh)
   */
  private async reAuthenticate(): Promise<void> {
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Ensure the client is authenticated (refresh token if needed)
   */
  private async ensureAuth(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    // Keycloak admin client handles token refresh automatically,
    // but we provide a mechanism to re-auth if needed
  }

  /**
   * Execute a Keycloak operation with automatic retry on auth failure
   */
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      // If we get a 401, try to re-authenticate and retry once
      if (error.response?.status === 401 || error.message?.includes('401')) {
        await this.reAuthenticate();
        return await operation();
      }
      throw error;
    }
  }

  /**
   * Create a new realm for a tenant
   */
  async createRealm(tenantSlug: string, tenantName: string): Promise<void> {
    await this.ensureAuth();

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
   * Get realm information
   */
  async getRealm(tenantSlug: string): Promise<RealmRepresentation | undefined> {
    await this.ensureAuth();

    try {
      return await this.client.realms.findOne({ realm: tenantSlug });
    } catch (error: any) {
      if (error.response?.status === 404) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Update realm settings
   */
  async updateRealm(tenantSlug: string, updates: Partial<RealmRepresentation>): Promise<void> {
    await this.ensureAuth();

    await this.client.realms.update({ realm: tenantSlug }, updates);
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

    this.client.setConfig({ realmName: tenantSlug });

    const userRepresentation: UserRepresentation = {
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      enabled: user.enabled ?? true,
      emailVerified: user.emailVerified ?? false,
    };

    const result = await this.client.users.create(userRepresentation);

    // Reset to master realm
    this.client.setConfig({ realmName: 'master' });

    return { id: result.id! };
  }

  /**
   * Get user by ID in a tenant's realm
   */
  async getUser(tenantSlug: string, userId: string): Promise<UserRepresentation | undefined> {
    await this.ensureAuth();

    this.client.setConfig({ realmName: tenantSlug });

    try {
      const user = await this.client.users.findOne({ id: userId });
      return user;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return undefined;
      }
      throw error;
    } finally {
      // Reset to master realm
      this.client.setConfig({ realmName: 'master' });
    }
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

    this.client.setConfig({ realmName: tenantSlug });

    try {
      const users = await this.client.users.find({
        first: options?.first,
        max: options?.max,
        search: options?.search,
      });
      return users;
    } finally {
      // Reset to master realm
      this.client.setConfig({ realmName: 'master' });
    }
  }

  /**
   * Delete user from a tenant's realm
   */
  async deleteUser(tenantSlug: string, userId: string): Promise<void> {
    await this.ensureAuth();

    this.client.setConfig({ realmName: tenantSlug });

    try {
      await this.client.users.del({ id: userId });
    } finally {
      // Reset to master realm
      this.client.setConfig({ realmName: 'master' });
    }
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

    this.client.setConfig({ realmName: tenantSlug });

    try {
      await this.client.users.resetPassword({
        id: userId,
        credential: {
          temporary,
          type: 'password',
          value: password,
        },
      });
    } finally {
      // Reset to master realm
      this.client.setConfig({ realmName: 'master' });
    }
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
