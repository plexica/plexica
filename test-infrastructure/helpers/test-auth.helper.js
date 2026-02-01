"use strict";
/**
 * Test Auth Helper
 *
 * Provides utilities for authentication in tests:
 * - Mock JWT tokens
 * - Real JWT tokens from Keycloak
 * - Authorization headers
 * - Token decoding/validation
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testAuth = exports.TestAuthHelper = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const test_keycloak_helper_1 = require("./test-keycloak.helper");
class TestAuthHelper {
    static instance;
    jwtSecret;
    constructor() {
        this.jwtSecret = process.env.JWT_SECRET || 'test-jwt-secret-key-do-not-use-in-production';
    }
    /**
     * Get singleton instance
     */
    static getInstance() {
        if (!TestAuthHelper.instance) {
            TestAuthHelper.instance = new TestAuthHelper();
        }
        return TestAuthHelper.instance;
    }
    /**
     * Create a mock JWT token for testing (does not require Keycloak)
     * Useful for unit tests that don't need real Keycloak integration
     */
    createMockToken(payload, expiresIn = '1h') {
        return jsonwebtoken_1.default.sign(payload, this.jwtSecret, {
            expiresIn: expiresIn,
            issuer: 'plexica-test',
            audience: 'plexica-test-api',
        });
    }
    /**
     * Create a mock super admin token
     */
    createMockSuperAdminToken(overrides) {
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
    createMockTenantAdminToken(tenantId, overrides) {
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
    createMockTenantMemberToken(tenantId, overrides) {
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
    createMockWorkspaceAdminToken(tenantId, workspaceId, overrides) {
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
    async getRealToken(username, password) {
        return await test_keycloak_helper_1.testKeycloak.getUserToken(username, password);
    }
    /**
     * Get a real super admin token from Keycloak
     */
    async getRealSuperAdminToken() {
        return await this.getRealToken('test-super-admin', 'test123');
    }
    /**
     * Get a real tenant admin token from Keycloak
     */
    async getRealTenantAdminToken(tenantSlug) {
        return await this.getRealToken(`test-tenant-admin-${tenantSlug}`, 'test123');
    }
    /**
     * Get a real tenant member token from Keycloak
     */
    async getRealTenantMemberToken(tenantSlug) {
        return await this.getRealToken(`test-tenant-member-${tenantSlug}`, 'test123');
    }
    /**
     * Create authorization header with Bearer token
     */
    createAuthHeader(token) {
        return {
            authorization: `Bearer ${token}`,
        };
    }
    /**
     * Create authorization header with mock token
     */
    createMockAuthHeader(payload) {
        const token = this.createMockToken(payload);
        return this.createAuthHeader(token);
    }
    /**
     * Decode a JWT token without verifying (for testing)
     */
    decodeToken(token) {
        return jsonwebtoken_1.default.decode(token);
    }
    /**
     * Verify a mock JWT token
     */
    verifyMockToken(token) {
        try {
            return jsonwebtoken_1.default.verify(token, this.jwtSecret);
        }
        catch (error) {
            throw new Error(`Token verification failed: ${error}`);
        }
    }
    /**
     * Check if a token is expired
     */
    isTokenExpired(token) {
        const decoded = this.decodeToken(token);
        if (!decoded || !decoded.exp) {
            return true;
        }
        return Date.now() >= decoded.exp * 1000;
    }
    /**
     * Extract tenant ID from token
     */
    extractTenantId(token) {
        const decoded = this.decodeToken(token);
        return decoded?.tenant_id || decoded?.attributes?.tenant_id?.[0] || null;
    }
    /**
     * Extract user roles from token
     */
    extractRoles(token) {
        const decoded = this.decodeToken(token);
        return decoded?.realm_access?.roles || [];
    }
    /**
     * Check if token has a specific role
     */
    hasRole(token, role) {
        const roles = this.extractRoles(token);
        return roles.includes(role);
    }
    /**
     * Check if token is a super admin token
     */
    isSuperAdmin(token) {
        return this.hasRole(token, 'super-admin');
    }
    /**
     * Check if token is a tenant admin token
     */
    isTenantAdmin(token) {
        return this.hasRole(token, 'tenant-admin');
    }
}
exports.TestAuthHelper = TestAuthHelper;
// Export singleton instance
exports.testAuth = TestAuthHelper.getInstance();
