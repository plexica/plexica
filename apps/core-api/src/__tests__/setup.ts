// Test setup file
import { beforeAll, afterAll, afterEach } from 'vitest';

beforeAll(async () => {
  // Setup test environment
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL || 'postgresql://plexica:plexica@localhost:5432/plexica_test';
  process.env.JWT_SECRET = 'test-secret-key-do-not-use-in-production';
  process.env.KEYCLOAK_URL = 'http://localhost:8080';
  process.env.KEYCLOAK_ADMIN_USERNAME = 'admin';
  process.env.KEYCLOAK_ADMIN_PASSWORD = 'admin';
});

afterAll(async () => {
  // Cleanup
});

afterEach(() => {
  // Reset mocks after each test
});
