/**
 * Test Keycloak Helper
 *
 * Provides utilities for interacting with the test Keycloak instance:
 * - User management
 * - Token generation
 * - Realm management
 * - Client management
 */
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
export declare class TestKeycloakHelper {
    private static instance;
    private adminClient;
    private baseUrl;
    private realm;
    private clientId;
    private clientSecret;
    private constructor();
    /**
     * Get singleton instance
     */
    static getInstance(): TestKeycloakHelper;
    /**
     * Authenticate as admin
     */
    authenticateAdmin(): Promise<void>;
    /**
     * Get access token for a user using password grant
     */
    getUserToken(username: string, password: string): Promise<TokenResponse>;
    /**
     * Get access token using client credentials
     */
    getClientToken(): Promise<TokenResponse>;
    /**
     * Create a test user in Keycloak
     */
    createUser(userData: TestUser): Promise<string>;
    /**
     * Delete a user from Keycloak
     */
    deleteUser(userId: string): Promise<void>;
    /**
     * Find user by username
     */
    findUserByUsername(username: string): Promise<import("@keycloak/keycloak-admin-client/lib/defs/userRepresentation").default>;
    /**
     * Find user by email
     */
    findUserByEmail(email: string): Promise<import("@keycloak/keycloak-admin-client/lib/defs/userRepresentation").default>;
    /**
     * Update user attributes
     */
    updateUserAttributes(userId: string, attributes: Record<string, string[]>): Promise<void>;
    /**
     * Get user by ID
     */
    getUser(userId: string): Promise<import("@keycloak/keycloak-admin-client/lib/defs/userRepresentation").default>;
    /**
     * Delete all users (except admin users)
     */
    deleteAllTestUsers(): Promise<void>;
    /**
     * Verify token is valid
     */
    verifyToken(token: string): Promise<boolean>;
    /**
     * Introspect token (get token details)
     */
    introspectToken(token: string): Promise<any>;
    /**
     * Get JWKS (JSON Web Key Set) for token verification
     */
    getJWKS(): Promise<any>;
}
export declare const testKeycloak: TestKeycloakHelper;
