/**
 * Test Context Helper
 *
 * Unified helper that provides access to all test utilities.
 * This is the main entry point for test infrastructure.
 */
import { testDb } from './test-database.helper';
import { testKeycloak } from './test-keycloak.helper';
import { testAuth } from './test-auth.helper';
import { testMinio } from './test-minio.helper';
import { testRedpanda } from './test-redpanda.helper';
export declare class TestContext {
    private static instance;
    /**
     * Database helper
     */
    readonly db: import("./test-database.helper").TestDatabaseHelper;
    /**
     * Keycloak helper
     */
    readonly keycloak: import("./test-keycloak.helper").TestKeycloakHelper;
    /**
     * Auth helper (JWT tokens)
     */
    readonly auth: import("./test-auth.helper").TestAuthHelper;
    /**
     * MinIO helper
     */
    readonly minio: import("./test-minio.helper").TestMinioHelper;
    /**
     * Redpanda helper (Kafka)
     */
    readonly redpanda: import("./test-redpanda.helper").TestRedpandaHelper;
    private constructor();
    /**
     * Get singleton instance
     */
    static getInstance(): TestContext;
    /**
     * Reset all test data (database, MinIO, Redpanda, Redis)
     * This is typically called in beforeEach or beforeAll hooks
     */
    resetAll(): Promise<void>;
    /**
     * Clean up and disconnect all services
     * This is typically called in afterAll hooks
     */
    cleanup(): Promise<void>;
}
export declare const testContext: TestContext;
export { testDb, testKeycloak, testAuth, testMinio, testRedpanda };
