/**
 * Test Keycloak Helper
 *
 * Provides utilities for interacting with the test Keycloak instance:
 * - User management
 * - Token generation
 * - Realm management
 * - Client management
 */

import KcAdminClient from '@keycloak/keycloak-admin-client';
import axios from 'axios';

export interface TestUser {
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  password?: string;
  roles?: string[];
  attributes?: Record<string, string[]>;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
}

export class TestKeycloakHelper {
  private static instance: TestKeycloakHelper;
  private adminClient: KcAdminClient;
  private baseUrl: string;
  private realm: string;
  private clientId: string;
  private clientSecret: string;

  private constructor() {
    this.baseUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';
    this.realm = process.env.KEYCLOAK_REALM || 'plexica-test';
    this.clientId = process.env.KEYCLOAK_CLIENT_ID || 'plexica-test-api';
    this.clientSecret = process.env.KEYCLOAK_CLIENT_SECRET || 'test-client-secret';

    this.adminClient = new KcAdminClient({
      baseUrl: this.baseUrl,
      realmName: 'master',
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TestKeycloakHelper {
    if (!TestKeycloakHelper.instance) {
      TestKeycloakHelper.instance = new TestKeycloakHelper();
    }
    return TestKeycloakHelper.instance;
  }

  /**
   * Authenticate as admin
   */
  async authenticateAdmin(): Promise<void> {
    await this.adminClient.auth({
      username: process.env.KEYCLOAK_ADMIN_USERNAME || 'admin',
      password: process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin',
      grantType: 'password',
      clientId: 'admin-cli',
    });
  }

  /**
   * Get access token for a user using password grant
   */
  async getUserToken(username: string, password: string): Promise<TokenResponse> {
    const tokenUrl = `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`;

    const response = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: 'password',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        username,
        password,
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return response.data;
  }

  /**
   * Get access token using client credentials
   */
  async getClientToken(): Promise<TokenResponse> {
    const tokenUrl = `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`;

    const response = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return response.data;
  }

  /**
   * Create a test user in Keycloak
   */
  async createUser(userData: TestUser): Promise<string> {
    await this.authenticateAdmin();

    // Set realm to test realm
    this.adminClient.setConfig({
      realmName: this.realm,
    });

    // Create user
    const userId = await this.adminClient.users.create({
      username: userData.username,
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName,
      enabled: true,
      emailVerified: true,
      attributes: userData.attributes,
    });

    // Set password if provided
    if (userData.password) {
      await this.adminClient.users.resetPassword({
        id: userId.id,
        credential: {
          temporary: false,
          type: 'password',
          value: userData.password,
        },
      });
    }

    // Assign roles if provided
    if (userData.roles && userData.roles.length > 0) {
      const availableRoles = await this.adminClient.roles.find();
      const rolesToAssign = availableRoles.filter((r) => userData.roles!.includes(r.name!));

      if (rolesToAssign.length > 0) {
        await this.adminClient.users.addRealmRoleMappings({
          id: userId.id,
          roles: rolesToAssign.map((r) => ({
            id: r.id!,
            name: r.name!,
          })),
        });
      }
    }

    return userId.id;
  }

  /**
   * Delete a user from Keycloak
   */
  async deleteUser(userId: string): Promise<void> {
    await this.authenticateAdmin();

    this.adminClient.setConfig({
      realmName: this.realm,
    });

    await this.adminClient.users.del({ id: userId });
  }

  /**
   * Find user by username
   */
  async findUserByUsername(username: string) {
    await this.authenticateAdmin();

    this.adminClient.setConfig({
      realmName: this.realm,
    });

    const users = await this.adminClient.users.find({ username });
    return users.length > 0 ? users[0] : null;
  }

  /**
   * Find user by email
   */
  async findUserByEmail(email: string) {
    await this.authenticateAdmin();

    this.adminClient.setConfig({
      realmName: this.realm,
    });

    const users = await this.adminClient.users.find({ email });
    return users.length > 0 ? users[0] : null;
  }

  /**
   * Update user attributes
   */
  async updateUserAttributes(userId: string, attributes: Record<string, string[]>): Promise<void> {
    await this.authenticateAdmin();

    this.adminClient.setConfig({
      realmName: this.realm,
    });

    await this.adminClient.users.update({ id: userId }, { attributes });
  }

  /**
   * Get user by ID
   */
  async getUser(userId: string) {
    await this.authenticateAdmin();

    this.adminClient.setConfig({
      realmName: this.realm,
    });

    return await this.adminClient.users.findOne({ id: userId });
  }

  /**
   * Delete all users (except admin users)
   */
  async deleteAllTestUsers(): Promise<void> {
    await this.authenticateAdmin();

    this.adminClient.setConfig({
      realmName: this.realm,
    });

    const users = await this.adminClient.users.find();
    const testUsers = users.filter(
      (u) => u.username?.startsWith('test-') && u.username !== 'test-super-admin'
    );

    for (const user of testUsers) {
      await this.adminClient.users.del({ id: user.id! });
    }
  }

  /**
   * Verify token is valid
   */
  async verifyToken(token: string): Promise<boolean> {
    try {
      const userInfoUrl = `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/userinfo`;
      await axios.get(userInfoUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Introspect token (get token details)
   */
  async introspectToken(token: string): Promise<any> {
    const introspectUrl = `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token/introspect`;

    const response = await axios.post(
      introspectUrl,
      new URLSearchParams({
        token,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return response.data;
  }

  /**
   * Get JWKS (JSON Web Key Set) for token verification
   */
  async getJWKS(): Promise<any> {
    const jwksUrl = `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/certs`;
    const response = await axios.get(jwksUrl);
    return response.data;
  }
}

// Export singleton instance
export const testKeycloak = TestKeycloakHelper.getInstance();
