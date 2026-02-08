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

// Global setup - runs before each test file (setupFiles run per-file in vitest)
// Note: resetAll() is NOT called here because each test file handles its own
// reset in its own beforeAll. Calling it here would cause double-resets and
// race conditions when running the full suite sequentially.
beforeAll(async () => {
  console.log('\n✅ Integration test setup ready\n');
}, 30000);

// Global cleanup - runs once after all test files
afterAll(async () => {
  console.log('\n🧹 Cleaning up test environment after integration tests...');
  await testContext.cleanup();
  console.log('✅ Cleanup complete\n');
});
