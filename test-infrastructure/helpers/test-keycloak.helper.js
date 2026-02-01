"use strict";
/**
 * Test Keycloak Helper
 *
 * Provides utilities for interacting with the test Keycloak instance:
 * - User management
 * - Token generation
 * - Realm management
 * - Client management
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testKeycloak = exports.TestKeycloakHelper = void 0;
const keycloak_admin_client_1 = __importDefault(require("@keycloak/keycloak-admin-client"));
const axios_1 = __importDefault(require("axios"));
class TestKeycloakHelper {
    static instance;
    adminClient;
    baseUrl;
    realm;
    clientId;
    clientSecret;
    constructor() {
        this.baseUrl = process.env.KEYCLOAK_URL || 'http://localhost:8081';
        this.realm = process.env.KEYCLOAK_REALM || 'plexica-test';
        this.clientId = process.env.KEYCLOAK_CLIENT_ID || 'plexica-test-api';
        this.clientSecret = process.env.KEYCLOAK_CLIENT_SECRET || 'test-client-secret';
        this.adminClient = new keycloak_admin_client_1.default({
            baseUrl: this.baseUrl,
            realmName: 'master',
        });
    }
    /**
     * Get singleton instance
     */
    static getInstance() {
        if (!TestKeycloakHelper.instance) {
            TestKeycloakHelper.instance = new TestKeycloakHelper();
        }
        return TestKeycloakHelper.instance;
    }
    /**
     * Authenticate as admin
     */
    async authenticateAdmin() {
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
    async getUserToken(username, password) {
        const tokenUrl = `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`;
        const response = await axios_1.default.post(tokenUrl, new URLSearchParams({
            grant_type: 'password',
            client_id: this.clientId,
            client_secret: this.clientSecret,
            username,
            password,
        }).toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
        return response.data;
    }
    /**
     * Get access token using client credentials
     */
    async getClientToken() {
        const tokenUrl = `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token`;
        const response = await axios_1.default.post(tokenUrl, new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: this.clientId,
            client_secret: this.clientSecret,
        }).toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
        return response.data;
    }
    /**
     * Create a test user in Keycloak
     */
    async createUser(userData) {
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
            const rolesToAssign = availableRoles.filter((r) => userData.roles.includes(r.name));
            if (rolesToAssign.length > 0) {
                await this.adminClient.users.addRealmRoleMappings({
                    id: userId.id,
                    roles: rolesToAssign.map((r) => ({
                        id: r.id,
                        name: r.name,
                    })),
                });
            }
        }
        return userId.id;
    }
    /**
     * Delete a user from Keycloak
     */
    async deleteUser(userId) {
        await this.authenticateAdmin();
        this.adminClient.setConfig({
            realmName: this.realm,
        });
        await this.adminClient.users.del({ id: userId });
    }
    /**
     * Find user by username
     */
    async findUserByUsername(username) {
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
    async findUserByEmail(email) {
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
    async updateUserAttributes(userId, attributes) {
        await this.authenticateAdmin();
        this.adminClient.setConfig({
            realmName: this.realm,
        });
        await this.adminClient.users.update({ id: userId }, { attributes });
    }
    /**
     * Get user by ID
     */
    async getUser(userId) {
        await this.authenticateAdmin();
        this.adminClient.setConfig({
            realmName: this.realm,
        });
        return await this.adminClient.users.findOne({ id: userId });
    }
    /**
     * Delete all users (except admin users)
     */
    async deleteAllTestUsers() {
        await this.authenticateAdmin();
        this.adminClient.setConfig({
            realmName: this.realm,
        });
        const users = await this.adminClient.users.find();
        const testUsers = users.filter((u) => u.username?.startsWith('test-') && u.username !== 'test-super-admin');
        for (const user of testUsers) {
            await this.adminClient.users.del({ id: user.id });
        }
    }
    /**
     * Verify token is valid
     */
    async verifyToken(token) {
        try {
            const userInfoUrl = `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/userinfo`;
            await axios_1.default.get(userInfoUrl, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Introspect token (get token details)
     */
    async introspectToken(token) {
        const introspectUrl = `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/token/introspect`;
        const response = await axios_1.default.post(introspectUrl, new URLSearchParams({
            token,
            client_id: this.clientId,
            client_secret: this.clientSecret,
        }).toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
        return response.data;
    }
    /**
     * Get JWKS (JSON Web Key Set) for token verification
     */
    async getJWKS() {
        const jwksUrl = `${this.baseUrl}/realms/${this.realm}/protocol/openid-connect/certs`;
        const response = await axios_1.default.get(jwksUrl);
        return response.data;
    }
}
exports.TestKeycloakHelper = TestKeycloakHelper;
// Export singleton instance
exports.testKeycloak = TestKeycloakHelper.getInstance();
