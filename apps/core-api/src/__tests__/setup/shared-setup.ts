/**
 * Shared Test Setup Factory
 *
 * Common setup logic for integration and E2E test suites.
 * Both suites share the same pattern: load env, reset DB, cleanup.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { beforeAll, afterAll } from 'vitest';
import { testContext } from '../../../../../test-infrastructure/helpers/test-context.helper.js';
import { testKeycloak } from '../../../../../test-infrastructure/helpers/test-keycloak.helper.js';

export interface TestSetupOptions {
  /** Label for log output (e.g. "Integration", "E2E") */
  label: string;
  /** Extra log lines to print after services list */
  extraLogs?: () => void;
}

/**
 * Initializes a test setup with shared beforeAll/afterAll hooks.
 * Call this at the top level of integration-setup.ts or e2e-setup.ts.
 */
export function createTestSetup(options: TestSetupOptions): void {
  const { label, extraLogs } = options;

  // Load test environment variables (override any existing .env values)
  config({ path: resolve(__dirname, '../../../.env.test'), override: true });

  // Set test environment
  process.env.NODE_ENV = 'test';

  console.log(`${label} test environment loaded`);
  console.log('Services:');
  console.log(`  - Database: ${process.env.DATABASE_URL?.split('@')[1]}`);
  console.log(`  - Keycloak: ${process.env.KEYCLOAK_URL}`);
  console.log(`  - Redis: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
  console.log(`  - MinIO: ${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`);
  extraLogs?.();

  // Global setup - runs once before all test files
  beforeAll(async () => {
    console.log(`\nResetting test environment before ${label} tests...`);

    // Clean up stale Keycloak realms from previous test runs.
    // This prevents "invalid_request" errors when createRealm() tries to
    // create a realm that already exists (e.g. 'acme', 'demo', or timestamped slugs).
    try {
      console.log('  - Deleting stale Keycloak test realms...');
      await testKeycloak.deleteAllTestRealms();
      console.log('    ✓ Keycloak realms cleaned');
    } catch (error) {
      console.warn(
        '    ⚠ Could not clean Keycloak realms:',
        error instanceof Error ? error.message : String(error)
      );
    }

    if (typeof testContext.db.fullReset === 'function') {
      await testContext.db.fullReset();
    } else {
      await testContext.resetAll();
    }
    console.log(`${label} test setup ready\n`);
  }, 120000); // 2 minute timeout for reset

  // Global cleanup - runs once after all test files
  afterAll(async () => {
    console.log(`\nCleaning up test environment after ${label} tests...`);
    await testContext.cleanup();
    console.log('Cleanup complete\n');
  });
}
