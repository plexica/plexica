/**
 * E2E Tests Setup
 *
 * Setup for E2E tests - full stack with all services
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { beforeAll, afterAll, beforeEach } from 'vitest';
import { testContext } from '../../../../../test-infrastructure/helpers/test-context.helper.js';

// Load test environment variables (override any existing .env values)
config({ path: resolve(__dirname, '../../../.env.test'), override: true });

// Set test environment
process.env.NODE_ENV = 'test';

console.log('🚀 E2E test environment loaded');
console.log('📊 Full stack services:');
console.log(`  - Database: ${process.env.DATABASE_URL?.split('@')[1]}`);
console.log(`  - Keycloak: ${process.env.KEYCLOAK_URL}`);
console.log(`  - Redis: ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
console.log(`  - MinIO: ${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`);
console.log(`  - API: ${process.env.API_HOST}:${process.env.API_PORT}`);

// Global setup - runs once before all test files
beforeAll(async () => {
  console.log('\n🔄 Resetting test environment before E2E tests...');
  await testContext.resetAll();
  console.log('✅ Test environment ready\n');
}, 120000); // 2 minute timeout

// Reset between each test file for isolation
beforeEach(async () => {
  console.log('🔄 Resetting data between tests...');
  await testContext.resetAll();
});

// Global cleanup - runs once after all test files
afterAll(async () => {
  console.log('\n🧹 Cleaning up test environment after E2E tests...');
  await testContext.cleanup();
  console.log('✅ Cleanup complete\n');
});
