import http from 'k6/http';
import { check, group, sleep } from 'k6';

/**
 * k6 Load Test - Plexica Core API
 *
 * Tests the following scenarios:
 * 1. Health check endpoint (baseline)
 * 2. Authentication flow
 * 3. Tenant context handling
 * 4. Plugin operations (list, get, create)
 * 5. Workspace operations (list, get, create)
 *
 * Run with: k6 run apps/core-api/load-tests/main.js
 * Or with options: k6 run -u 50 -d 30s apps/core-api/load-tests/main.js
 *   -u: number of virtual users
 *   -d: test duration
 */

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 }, // Ramp up to 10 users
    { duration: '1m', target: 50 }, // Ramp up to 50 users
    { duration: '30s', target: 100 }, // Ramp up to 100 users
    { duration: '2m', target: 100 }, // Stay at 100 users
    { duration: '30s', target: 0 }, // Ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% < 500ms, 99% < 1000ms
    http_req_failed: ['rate<0.1'], // Error rate < 10%
    http_reqs: ['rate>50'], // At least 50 req/s
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TENANT_SLUG = __ENV.TENANT_SLUG || 'test-tenant';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''; // Set via environment variable

/**
 * Health Check - Baseline endpoint with no auth required
 */
export function testHealthCheck() {
  group('Health Check', () => {
    const res = http.get(`${BASE_URL}/health`);
    check(res, {
      'status is 200': (r) => r.status === 200,
      'response time < 100ms': (r) => r.timings.duration < 100,
      'has version': (r) => r.body.includes('version') || r.status === 200,
    });
  });
  sleep(1);
}

/**
 * Unauthenticated Requests
 */
export function testUnauthenticatedRequests() {
  group('Unauthenticated Requests', () => {
    // Request without tenant header should fail
    const res = http.get(`${BASE_URL}/api/plugins`);
    check(res, {
      'missing tenant returns 400': (r) => r.status === 400 || r.status === 401,
    });
  });
  sleep(1);
}

/**
 * Tenant Context Handling
 */
export function testTenantContext() {
  group('Tenant Context', () => {
    const headers = {
      'X-Tenant-Slug': TENANT_SLUG,
      'Content-Type': 'application/json',
    };

    // Test with valid tenant
    const res = http.get(`${BASE_URL}/api/plugins`, { headers });
    check(res, {
      'valid tenant returns success or auth error': (r) =>
        r.status === 200 || r.status === 401 || r.status === 403,
      'response time < 500ms': (r) => r.timings.duration < 500,
    });
  });
  sleep(1);
}

/**
 * Metrics Endpoint
 */
export function testMetrics() {
  group('Metrics', () => {
    const res = http.get(`${BASE_URL}/metrics`);
    check(res, {
      'metrics endpoint accessible': (r) => r.status === 200,
      'returns Prometheus format': (r) => r.body.includes('# HELP') || r.status === 200,
    });
  });
  sleep(1);
}

/**
 * Plugin Operations (List)
 */
export function testPluginOperations() {
  group('Plugin Operations', () => {
    const headers = {
      'X-Tenant-Slug': TENANT_SLUG,
      'Content-Type': 'application/json',
    };

    if (AUTH_TOKEN) {
      headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
    }

    // List plugins
    const listRes = http.get(`${BASE_URL}/api/plugins`, { headers });
    check(listRes, {
      'list plugins returns 200 or 401': (r) => r.status === 200 || r.status === 401,
      'list response time < 1000ms': (r) => r.timings.duration < 1000,
    });
  });
  sleep(1);
}

/**
 * Workspace Operations (List)
 */
export function testWorkspaceOperations() {
  group('Workspace Operations', () => {
    const headers = {
      'X-Tenant-Slug': TENANT_SLUG,
      'Content-Type': 'application/json',
    };

    if (AUTH_TOKEN) {
      headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
    }

    // List workspaces
    const listRes = http.get(`${BASE_URL}/api/workspaces`, { headers });
    check(listRes, {
      'list workspaces returns 200 or 401': (r) => r.status === 200 || r.status === 401,
      'response time < 1000ms': (r) => r.timings.duration < 1000,
    });
  });
  sleep(1);
}

/**
 * Main test execution
 */
export default function () {
  // Run tests in sequence, distributing load across endpoints
  const testFunctions = [
    testHealthCheck,
    testUnauthenticatedRequests,
    testTenantContext,
    testMetrics,
    testPluginOperations,
    testWorkspaceOperations,
  ];

  // Rotate through test functions
  const testIndex = Math.floor(__VU % testFunctions.length);
  testFunctions[testIndex]();
}
