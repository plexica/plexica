"use strict";
/**
 * Test Context Helper
 *
 * Unified helper that provides access to all test utilities.
 * This is the main entry point for test infrastructure.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.testRedpanda = exports.testMinio = exports.testAuth = exports.testKeycloak = exports.testDb = exports.testContext = exports.TestContext = void 0;
const test_database_helper_1 = require("./test-database.helper");
Object.defineProperty(exports, "testDb", { enumerable: true, get: function () { return test_database_helper_1.testDb; } });
const test_keycloak_helper_1 = require("./test-keycloak.helper");
Object.defineProperty(exports, "testKeycloak", { enumerable: true, get: function () { return test_keycloak_helper_1.testKeycloak; } });
const test_auth_helper_1 = require("./test-auth.helper");
Object.defineProperty(exports, "testAuth", { enumerable: true, get: function () { return test_auth_helper_1.testAuth; } });
const test_minio_helper_1 = require("./test-minio.helper");
Object.defineProperty(exports, "testMinio", { enumerable: true, get: function () { return test_minio_helper_1.testMinio; } });
const test_redpanda_helper_1 = require("./test-redpanda.helper");
Object.defineProperty(exports, "testRedpanda", { enumerable: true, get: function () { return test_redpanda_helper_1.testRedpanda; } });
class TestContext {
    static instance;
    /**
     * Database helper
     */
    db = test_database_helper_1.testDb;
    /**
     * Keycloak helper
     */
    keycloak = test_keycloak_helper_1.testKeycloak;
    /**
     * Auth helper (JWT tokens)
     */
    auth = test_auth_helper_1.testAuth;
    /**
     * MinIO helper
     */
    minio = test_minio_helper_1.testMinio;
    /**
     * Redpanda helper (Kafka)
     */
    redpanda = test_redpanda_helper_1.testRedpanda;
    constructor() { }
    /**
     * Get singleton instance
     */
    static getInstance() {
        if (!TestContext.instance) {
            TestContext.instance = new TestContext();
        }
        return TestContext.instance;
    }
    /**
     * Reset all test data (database, MinIO, Redpanda, Redis)
     * This is typically called in beforeEach or beforeAll hooks
     */
    async resetAll() {
        console.log('🔄 Resetting test environment...');
        // Reset database
        await this.db.reset();
        // Clean up MinIO buckets
        await this.minio.cleanupAllBuckets();
        // Clean up Redpanda topics and consumer groups
        await this.redpanda.cleanupAllTopics();
        await this.redpanda.cleanupAllConsumerGroups();
        console.log('✅ Test environment reset complete');
    }
    /**
     * Clean up and disconnect all services
     * This is typically called in afterAll hooks
     */
    async cleanup() {
        await this.db.disconnect();
        await this.redpanda.disconnect();
    }
}
exports.TestContext = TestContext;
// Export singleton instance
exports.testContext = TestContext.getInstance();
