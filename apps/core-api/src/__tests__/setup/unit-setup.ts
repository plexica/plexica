/**
 * Unit Tests Setup
 *
 * Setup for unit tests - minimal dependencies, no real services
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { vi } from 'vitest';

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
