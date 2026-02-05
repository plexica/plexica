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

export class TestContext {
  private static instance: TestContext;

  /**
   * Database helper
   */
  public readonly db = testDb;

  /**
   * Keycloak helper
   */
  public readonly keycloak = testKeycloak;

  /**
   * Auth helper (JWT tokens)
   */
  public readonly auth = testAuth;

  /**
   * MinIO helper
   */
  public readonly minio = testMinio;

  /**
   * Redpanda helper (Kafka)
   */
  public readonly redpanda = testRedpanda;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): TestContext {
    if (!TestContext.instance) {
      TestContext.instance = new TestContext();
    }
    return TestContext.instance;
  }

  /**
   * Reset all test data (database, MinIO, Redpanda, Redis, Keycloak)
   * This is typically called in beforeEach or beforeAll hooks
   */
  async resetAll(): Promise<void> {
    console.log('🔄 Resetting test environment...');

    // NOTE: Skipping Keycloak realm deletion as it causes hangs.
    // Tests use pre-created realms (plexica-test, etc.) and don't create new ones
    // that need cleanup. If needed, delete via deleteAllTestRealms() explicitly.

    // Reset database
    console.log('  - Resetting database...');
    await this.db.reset();
    console.log('    ✓ Database reset');

    // Clean up MinIO buckets
    console.log('  - Cleaning MinIO buckets...');
    await this.minio.cleanupAllBuckets();
    console.log('    ✓ MinIO cleaned');

    // Clean up Redpanda topics and consumer groups
    console.log('  - Cleaning Redpanda topics...');
    await this.redpanda.cleanupAllTopics();
    await this.redpanda.cleanupAllConsumerGroups();
    console.log('    ✓ Redpanda cleaned');

    console.log('✅ Test environment reset complete');
  }

  /**
   * Clean up and disconnect all services
   * This is typically called in afterAll hooks
   */
  async cleanup(): Promise<void> {
    await this.db.disconnect();
    await this.redpanda.disconnect();
  }
}

// Export singleton instance
export const testContext = TestContext.getInstance();

// Export individual helpers for convenience
export { testDb, testKeycloak, testAuth, testMinio, testRedpanda };
