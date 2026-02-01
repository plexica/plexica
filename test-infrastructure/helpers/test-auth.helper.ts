/**
 * Test Auth Helper
 *
 * Provides utilities for authentication in tests:
 * - Mock JWT tokens
 * - Real JWT tokens from Keycloak
 * - Authorization headers
 * - Token decoding/validation
 */

import jwt from 'jsonwebtoken';
import { testKeycloak, TokenResponse } from './test-keycloak.helper';

export interface MockTokenPayload {
  sub: string; // User ID (Keycloak ID)
  email: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  realm_access?: {
    roles: string[];
  };
  resource_access?: Record<string, { roles: string[] }>;
  tenant_id?: string;
  workspace_id?: string;
}

export class TestAuthHelper {
  private static instance: TestAuthHelper;
  private jwtSecret: string;

  private constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'test-jwt-secret-key-do-not-use-in-production';
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TestAuthHelper {
    if (!TestAuthHelper.instance) {
      TestAuthHelper.instance = new TestAuthHelper();
    }
    return TestAuthHelper.instance;
  }

  /**
   * Create a mock JWT token for testing (does not require Keycloak)
   * Useful for unit tests that don't need real Keycloak integration
   */
  createMockToken(payload: MockTokenPayload, expiresIn: string | number = '1h'): string {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: expiresIn,
      issuer: 'plexica-test',
      audience: 'plexica-test-api',
    } as jwt.SignOptions);
  }

  /**
   * Create a mock super admin token
   */
  createMockSuperAdminToken(overrides?: Partial<MockTokenPayload>): string {
    return this.createMockToken({
      sub: 'super-admin-keycloak-id',
      email: 'super-admin@test.plexica.local',
      preferred_username: 'test-super-admin',
      given_name: 'Test',
      family_name: 'SuperAdmin',
      realm_access: {
        roles: ['super-admin'],
      },
      ...overrides,
    });
  }

  /**
   * Create a mock tenant admin token
   */
  createMockTenantAdminToken(tenantId: string, overrides?: Partial<MockTokenPayload>): string {
    return this.createMockToken({
      sub: `tenant-admin-${tenantId}-keycloak-id`,
      email: `admin@${tenantId}.test`,
      preferred_username: `test-tenant-admin-${tenantId}`,
      given_name: 'Admin',
      family_name: tenantId,
      realm_access: {
        roles: ['tenant-admin'],
      },
      tenant_id: tenantId,
      ...overrides,
    });
  }

  /**
   * Create a mock tenant member token
   */
  createMockTenantMemberToken(tenantId: string, overrides?: Partial<MockTokenPayload>): string {
    return this.createMockToken({
      sub: `tenant-member-${tenantId}-keycloak-id`,
      email: `member@${tenantId}.test`,
      preferred_username: `test-tenant-member-${tenantId}`,
      given_name: 'Member',
      family_name: tenantId,
      realm_access: {
        roles: ['tenant-member'],
      },
      tenant_id: tenantId,
      ...overrides,
    });
  }

  /**
   * Create a mock workspace admin token
   */
  createMockWorkspaceAdminToken(
    tenantId: string,
    workspaceId: string,
    overrides?: Partial<MockTokenPayload>
  ): string {
    return this.createMockToken({
      sub: `workspace-admin-${workspaceId}-keycloak-id`,
      email: `ws-admin@${tenantId}.test`,
      preferred_username: `test-workspace-admin-${workspaceId}`,
      realm_access: {
        roles: ['workspace-admin'],
      },
      tenant_id: tenantId,
      workspace_id: workspaceId,
      ...overrides,
    });
  }

  /**
   * Get a real JWT token from Keycloak using username/password
   * Useful for integration and E2E tests
   */
  async getRealToken(username: string, password: string): Promise<TokenResponse> {
    return await testKeycloak.getUserToken(username, password);
  }

  /**
   * Get a real super admin token from Keycloak
   */
  async getRealSuperAdminToken(): Promise<TokenResponse> {
    return await this.getRealToken('test-super-admin', 'test123');
  }

  /**
   * Get a real tenant admin token from Keycloak
   */
  async getRealTenantAdminToken(tenantSlug: string): Promise<TokenResponse> {
    return await this.getRealToken(`test-tenant-admin-${tenantSlug}`, 'test123');
  }

  /**
   * Get a real tenant member token from Keycloak
   */
  async getRealTenantMemberToken(tenantSlug: string): Promise<TokenResponse> {
    return await this.getRealToken(`test-tenant-member-${tenantSlug}`, 'test123');
  }

  /**
   * Create authorization header with Bearer token
   */
  createAuthHeader(token: string): { authorization: string } {
    return {
      authorization: `Bearer ${token}`,
    };
  }

  /**
   * Create authorization header with mock token
   */
  createMockAuthHeader(payload: MockTokenPayload): { authorization: string } {
    const token = this.createMockToken(payload);
    return this.createAuthHeader(token);
  }

  /**
   * Decode a JWT token without verifying (for testing)
   */
  decodeToken(token: string): any {
    return jwt.decode(token);
  }

  /**
   * Verify a mock JWT token
   */
  verifyMockToken(token: string): MockTokenPayload {
    try {
      return jwt.verify(token, this.jwtSecret) as MockTokenPayload;
    } catch (error) {
      throw new Error(`Token verification failed: ${error}`);
    }
  }

  /**
   * Check if a token is expired
   */
  isTokenExpired(token: string): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) {
      return true;
    }
    return Date.now() >= decoded.exp * 1000;
  }

  /**
   * Extract tenant ID from token
   */
  extractTenantId(token: string): string | null {
    const decoded = this.decodeToken(token);
    return decoded?.tenant_id || decoded?.attributes?.tenant_id?.[0] || null;
  }

  /**
   * Extract user roles from token
   */
  extractRoles(token: string): string[] {
    const decoded = this.decodeToken(token);
    return decoded?.realm_access?.roles || [];
  }

  /**
   * Check if token has a specific role
   */
  hasRole(token: string, role: string): boolean {
    const roles = this.extractRoles(token);
    return roles.includes(role);
  }

  /**
   * Check if token is a super admin token
   */
  isSuperAdmin(token: string): boolean {
    return this.hasRole(token, 'super-admin');
  }

  /**
   * Check if token is a tenant admin token
   */
  isTenantAdmin(token: string): boolean {
    return this.hasRole(token, 'tenant-admin');
  }
}

// Export singleton instance
export const testAuth = TestAuthHelper.getInstance();
