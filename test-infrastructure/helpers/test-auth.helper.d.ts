/**
 * Test Auth Helper
 *
 * Provides utilities for authentication in tests:
 * - Mock JWT tokens
 * - Real JWT tokens from Keycloak
 * - Authorization headers
 * - Token decoding/validation
 */
import { TokenResponse } from './test-keycloak.helper';
export interface MockTokenPayload {
    sub: string;
    email: string;
    preferred_username?: string;
    given_name?: string;
    family_name?: string;
    realm_access?: {
        roles: string[];
    };
    resource_access?: Record<string, {
        roles: string[];
    }>;
    tenant_id?: string;
    workspace_id?: string;
}
export declare class TestAuthHelper {
    private static instance;
    private jwtSecret;
    private constructor();
    /**
     * Get singleton instance
     */
    static getInstance(): TestAuthHelper;
    /**
     * Create a mock JWT token for testing (does not require Keycloak)
     * Useful for unit tests that don't need real Keycloak integration
     */
    createMockToken(payload: MockTokenPayload, expiresIn?: string | number): string;
    /**
     * Create a mock super admin token
     */
    createMockSuperAdminToken(overrides?: Partial<MockTokenPayload>): string;
    /**
     * Create a mock tenant admin token
     */
    createMockTenantAdminToken(tenantId: string, overrides?: Partial<MockTokenPayload>): string;
    /**
     * Create a mock tenant member token
     */
    createMockTenantMemberToken(tenantId: string, overrides?: Partial<MockTokenPayload>): string;
    /**
     * Create a mock workspace admin token
     */
    createMockWorkspaceAdminToken(tenantId: string, workspaceId: string, overrides?: Partial<MockTokenPayload>): string;
    /**
     * Get a real JWT token from Keycloak using username/password
     * Useful for integration and E2E tests
     */
    getRealToken(username: string, password: string): Promise<TokenResponse>;
    /**
     * Get a real super admin token from Keycloak
     */
    getRealSuperAdminToken(): Promise<TokenResponse>;
    /**
     * Get a real tenant admin token from Keycloak
     */
    getRealTenantAdminToken(tenantSlug: string): Promise<TokenResponse>;
    /**
     * Get a real tenant member token from Keycloak
     */
    getRealTenantMemberToken(tenantSlug: string): Promise<TokenResponse>;
    /**
     * Create authorization header with Bearer token
     */
    createAuthHeader(token: string): {
        authorization: string;
    };
    /**
     * Create authorization header with mock token
     */
    createMockAuthHeader(payload: MockTokenPayload): {
        authorization: string;
    };
    /**
     * Decode a JWT token without verifying (for testing)
     */
    decodeToken(token: string): any;
    /**
     * Verify a mock JWT token
     */
    verifyMockToken(token: string): MockTokenPayload;
    /**
     * Check if a token is expired
     */
    isTokenExpired(token: string): boolean;
    /**
     * Extract tenant ID from token
     */
    extractTenantId(token: string): string | null;
    /**
     * Extract user roles from token
     */
    extractRoles(token: string): string[];
    /**
     * Check if token has a specific role
     */
    hasRole(token: string, role: string): boolean;
    /**
     * Check if token is a super admin token
     */
    isSuperAdmin(token: string): boolean;
    /**
     * Check if token is a tenant admin token
     */
    isTenantAdmin(token: string): boolean;
}
export declare const testAuth: TestAuthHelper;
