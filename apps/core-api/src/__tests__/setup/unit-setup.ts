/**
 * Unit Tests Setup
 *
 * Setup for unit tests - minimal dependencies, no real services
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { vi, beforeEach, afterEach } from 'vitest';
import { testDb } from '../../../../../test-infrastructure/helpers/test-database.helper.js';

// Load test environment variables
config({ path: resolve(__dirname, '../../../.env.test') });

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

// Set test environment
process.env.NODE_ENV = 'test';

console.log('🧪 Unit test environment loaded');

// Begin transaction before each unit test file to speed up cleanup when possible
// Tests that rely on separate connections should not use these helpers.
beforeEach(async () => {
  // Only use DB transactions for unit tests when explicitly enabled.
  // This avoids making unit tests depend on a live DB by default.
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
