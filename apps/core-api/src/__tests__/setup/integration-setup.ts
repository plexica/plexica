/**
 * Integration Tests Setup
 *
 * Setup for integration tests - requires database and Keycloak
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { beforeAll, afterAll } from 'vitest';
import { testContext } from '../../../../../test-infrastructure/helpers/test-context.helper.js';

// Load test environment variables (override any existing .env values)
config({ path: resolve(__dirname, '../../../.env.test'), override: true });

// Set test environment
process.env.NODE_ENV = 'test';

console.log('🔧 Integration test environment loaded');
console.log('📊 Services:');
console.log(`  - Database: ${process.env.DATABASE_URL?.split('@')[1]}`);
console.log(`  - Keycloak: ${process.env.KEYCLOAK_URL}`);
console.log(`  - Redis: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
console.log(`  - MinIO: ${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`);

// Global setup - runs once before all test files
beforeAll(async () => {
  console.log('\n🔄 Resetting test environment before integration tests...');
  // Use a full reset on integration test runs to ensure a clean DB state
  // (this is more expensive but safer for integration suites)
  if (typeof testContext.db.fullReset === 'function') {
    await testContext.db.fullReset();
  } else {
    await testContext.resetAll();
  }
  console.log('✅ Integration test setup ready\n');
}, 120000); // 2 minute timeout for reset

// Global cleanup - runs once after all test files
afterAll(async () => {
  console.log('\n🧹 Cleaning up test environment after integration tests...');
  await testContext.cleanup();
  console.log('✅ Cleanup complete\n');
});
