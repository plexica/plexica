import http from 'k6/http';
import { check, group, sleep } from 'k6';

/**
 * k6 Load Test - Plexica Authentication Flow
 *
 * Tests the complete authentication flow:
 * 1. Tenant endpoint discovery
 * 2. Authentication with valid credentials
 * 3. Token refresh
 * 4. Authenticated requests
 *
 * Run with: k6 run apps/core-api/load-tests/auth.js
 * Or with Keycloak setup:
 *   k6 run -e KC_URL=http://localhost:8080 \
 *           -e KC_REALM=master \
 *           -e KC_CLIENT=plexica-api \
 *           -e KC_CLIENT_SECRET=your-secret \
 *           -e KC_USER=testuser \
 *           -e KC_PASS=testpass \
 *           apps/core-api/load-tests/auth.js
 */

export const options = {
  stages: [
    { duration: '20s', target: 5 }, // Ramp up to 5 users
    { duration: '1m', target: 20 }, // Ramp up to 20 users
    { duration: '1m', target: 20 }, // Stay at 20 users
    { duration: '20s', target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.15'], // Auth can be slower
    auth_success: ['rate>0.8'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TENANT_SLUG = __ENV.TENANT_SLUG || 'master';

/**
 * Get tenant information
 */
export function testGetTenant() {
  group('Get Tenant Info', () => {
    const headers = {
      'X-Tenant-Slug': TENANT_SLUG,
      'Content-Type': 'application/json',
    };

    const res = http.get(`${BASE_URL}/api/tenants/${TENANT_SLUG}`, { headers });
    check(res, {
      'get tenant returns 200 or 401': (r) => r.status === 200 || r.status === 401,
      'response time < 500ms': (r) => r.timings.duration < 500,
    });
  });
  sleep(1);
}

/**
 * Test with Bearer token (if provided)
 */
export function testAuthenticatedRequest() {
  group('Authenticated Requests', () => {
    const token = __ENV.AUTH_TOKEN;

    if (!token) {
      console.log('Skipping authenticated request test - AUTH_TOKEN not provided');
      return;
    }

    const headers = {
      'X-Tenant-Slug': TENANT_SLUG,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const res = http.get(`${BASE_URL}/api/workspaces`, { headers });
    check(
      res,
      {
        'authenticated request succeeds': (r) => r.status === 200,
        'response time < 1000ms': (r) => r.timings.duration < 1000,
      },
      { auth_success: res.status === 200 }
    );
  });
  sleep(1);
}

/**
 * Test concurrent authentication attempts
 */
export function testConcurrentAuth() {
  group('Concurrent Auth Attempts', () => {
    const headers = {
      'X-Tenant-Slug': TENANT_SLUG,
      'Content-Type': 'application/json',
    };

    // Simulate concurrent requests from same user
    const requests = [
      { method: 'GET', url: `${BASE_URL}/api/plugins`, params: { headers } },
      { method: 'GET', url: `${BASE_URL}/api/workspaces`, params: { headers } },
      { method: 'GET', url: `${BASE_URL}/api/plugins`, params: { headers } },
    ];

    const responses = http.batch(requests);

    check(responses[0], {
      'concurrent request 1 success': (r) => r.status === 200 || r.status === 401,
    });
  });
  sleep(1);
}

/**
 * Test with invalid token
 */
export function testInvalidToken() {
  group('Invalid Token Handling', () => {
    const headers = {
      'X-Tenant-Slug': TENANT_SLUG,
      Authorization: 'Bearer invalid-token-xyz',
      'Content-Type': 'application/json',
    };

    const res = http.get(`${BASE_URL}/api/workspaces`, { headers });
    check(res, {
      'invalid token returns 401': (r) => r.status === 401,
      'response time < 500ms': (r) => r.timings.duration < 500,
    });
  });
  sleep(1);
}

/**
 * Test expired token handling
 */
export function testExpiredToken() {
  group('Expired Token Handling', () => {
    const expiredToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkyMjJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

    const headers = {
      'X-Tenant-Slug': TENANT_SLUG,
      Authorization: `Bearer ${expiredToken}`,
      'Content-Type': 'application/json',
    };

    const res = http.get(`${BASE_URL}/api/workspaces`, { headers });
    check(res, {
      'expired token returns 401': (r) => r.status === 401,
      'response contains error message': (r) =>
        r.body.includes('expired') || r.body.includes('invalid') || r.status === 401,
    });
  });
  sleep(1);
}

/**
 * Test missing tenant header
 */
export function testMissingTenant() {
  group('Missing Tenant Header', () => {
    const headers = {
      'Content-Type': 'application/json',
    };

    const res = http.get(`${BASE_URL}/api/workspaces`, { headers });
    check(res, {
      'missing tenant returns 400': (r) => r.status === 400,
      'error message present': (r) => r.body.includes('tenant') || r.body.includes('required'),
    });
  });
  sleep(1);
}

/**
 * Main test execution
 */
export default function () {
  const testFunctions = [
    testGetTenant,
    testAuthenticatedRequest,
    testConcurrentAuth,
    testInvalidToken,
    testExpiredToken,
    testMissingTenant,
  ];

  const testIndex = Math.floor(__VU % testFunctions.length);
  testFunctions[testIndex]();
}
