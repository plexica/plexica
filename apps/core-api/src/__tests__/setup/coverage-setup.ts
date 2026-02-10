/**
 * Coverage Setup
 *
 * Unified setup file for `pnpm test:coverage` which runs ALL test types
 * (unit, integration, e2e) in a single pass.
 *
 * Combines the logic from unit-setup.ts, integration-setup.ts, and e2e-setup.ts
 * so that a single setupFile handles all test types without conflicts.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { testContext } from '../../../../../test-infrastructure/helpers/test-context.helper.js';
import { testKeycloak } from '../../../../../test-infrastructure/helpers/test-keycloak.helper.js';
import { testDb } from '../../../../../test-infrastructure/helpers/test-database.helper.js';

// Load test environment variables (override any existing .env values)
config({ path: resolve(__dirname, '../../../.env.test'), override: true });

// Set test environment
process.env.NODE_ENV = 'test';

// Mock console methods if needed (to reduce noise in tests)
if (process.env.LOG_LEVEL === 'silent') {
  global.console = {
    ...console,
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
}

console.log('Coverage test environment loaded');
console.log('Services:');
console.log(`  - Database: ${process.env.DATABASE_URL?.split('@')[1]}`);
console.log(`  - Keycloak: ${process.env.KEYCLOAK_URL}`);
console.log(`  - Redis: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
console.log(`  - MinIO: ${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`);

// Global setup - runs once before all test files
beforeAll(async () => {
  console.log('\nResetting test environment before coverage run...');

  // Clean up stale Keycloak realms from previous test runs
  try {
    console.log('  - Deleting stale Keycloak test realms...');
    await testKeycloak.deleteAllTestRealms();
    console.log('    Keycloak realms cleaned');
  } catch (error) {
    console.warn(
      '    Could not clean Keycloak realms:',
      error instanceof Error ? error.message : String(error)
    );
  }

  // Reset database
  if (typeof testContext.db.fullReset === 'function') {
    await testContext.db.fullReset();
  } else {
    await testContext.resetAll();
  }
  console.log('Coverage test setup ready\n');
}, 120000); // 2 minute timeout for reset

// Per-test hooks for unit tests using DB transactions
beforeEach(async () => {
  if (process.env.UNIT_TEST_USE_DB === 'true') {
    if (testDb && typeof testDb.beginTestTransaction === 'function') {
      await testDb.beginTestTransaction();
    }
  }
});

afterEach(async () => {
  if (process.env.UNIT_TEST_USE_DB === 'true') {
    if (testDb && typeof testDb.rollbackTestTransaction === 'function') {
      await testDb.rollbackTestTransaction();
    }
  }
});

// Global cleanup - runs once after all test files
afterAll(async () => {
  console.log('\nCleaning up test environment after coverage run...');
  await testContext.cleanup();
  console.log('Cleanup complete\n');
});
