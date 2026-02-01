// Test setup file
import { beforeAll, afterAll, afterEach } from 'vitest';

beforeAll(async () => {
  // Setup test environment
  process.env.NODE_ENV = 'test';

  // Use TEST_DATABASE_URL if set, otherwise use the test database config from .env.test
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgresql://plexica_test:plexica_test_password@localhost:5433/plexica_test?schema=core';

  process.env.JWT_SECRET = 'test-secret-key-do-not-use-in-production';
  process.env.KEYCLOAK_URL = 'http://localhost:8080';
  process.env.KEYCLOAK_ADMIN_USERNAME = 'admin';
  process.env.KEYCLOAK_ADMIN_PASSWORD = 'admin';

  // Redpanda/Kafka config
  process.env.REDPANDA_BROKERS = process.env.REDPANDA_BROKERS || 'localhost:9095';
  process.env.KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || 'plexica-test-client';
});

afterAll(async () => {
  // Cleanup
});

afterEach(() => {
  // Reset mocks after each test
});
