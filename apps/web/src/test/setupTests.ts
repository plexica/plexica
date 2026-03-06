// apps/web/src/test/setupTests.ts
//
// Extended test setup for Sprint 5 (T010-30) — adds MSW server lifecycle
// management on top of the base setup.ts.
//
// This file is registered alongside setup.ts in vitest.config.ts when
// integration/E2E-style tests need network mocking.
//
// MSW v2 note: setupServer() works in jsdom via @mswjs/interceptors. There
// is no need for a ServiceWorker in the test environment.

import { afterAll, afterEach, beforeAll } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers.js';

// ---------------------------------------------------------------------------
// MSW server singleton — shared across all test files that import this module
// ---------------------------------------------------------------------------

/**
 * Pre-configured MSW server with all default API handlers.
 *
 * In test files, import this server to add per-test overrides:
 *
 * @example
 * import { server } from '@/test/setupTests';
 * import { http, HttpResponse } from 'msw';
 *
 * test('handles 404', () => {
 *   server.use(
 *     http.get('/api/v1/tenant/settings', () => HttpResponse.json({}, { status: 404 }))
 *   );
 *   // ... test body
 * });
 */
export const server = setupServer(...handlers);

// ---------------------------------------------------------------------------
// Lifecycle hooks
// ---------------------------------------------------------------------------

// Start the server before any test in a file that imports this module.
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' });
});

// Reset handlers after each test to remove per-test overrides.
afterEach(() => {
  server.resetHandlers();
});

// Clean up after all tests in the file.
afterAll(() => {
  server.close();
});
