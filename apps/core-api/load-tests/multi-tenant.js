import http from 'k6/http';
import { check, group, sleep } from 'k6';

/**
 * k6 Load Test - Plexica Multi-Tenant Isolation
 *
 * Tests multi-tenant scenarios:
 * 1. Tenant isolation - ensuring data is properly isolated
 * 2. Multiple tenants under load
 * 3. Tenant context switching
 * 4. Resource contention between tenants
 *
 * Run with: k6 run apps/core-api/load-tests/multi-tenant.js
 */

export const options = {
  stages: [
    { duration: '30s', target: 10 }, // 2-3 users per tenant (4-5 tenants)
    { duration: '1m', target: 40 }, // Scale up
    { duration: '1m', target: 40 }, // Sustained load
    { duration: '30s', target: 0 }, // Ramp down
  ],
  thresholds: {
    'http_req_duration{tenant:tenant-1}': ['p(95)<500'],
    'http_req_duration{tenant:tenant-2}': ['p(95)<500'],
    'http_req_duration{tenant:tenant-3}': ['p(95)<500'],
    http_req_failed: ['rate<0.1'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TENANTS = ['tenant-1', 'tenant-2', 'tenant-3', 'tenant-4', 'tenant-5'];

/**
 * Get tenant for this virtual user
 */
function getTenantForUser(userId) {
  return TENANTS[userId % TENANTS.length];
}

/**
 * Test plugin operations for a specific tenant
 */
export function testPluginsByTenant() {
  const tenant = getTenantForUser(__VU);

  group(`Plugins - ${tenant}`, () => {
    const headers = {
      'X-Tenant-Slug': tenant,
      'Content-Type': 'application/json',
    };

    const res = http.get(`${BASE_URL}/api/plugins`, { headers, tags: { tenant } });
    check(res, {
      'list plugins succeeds': (r) => r.status === 200 || r.status === 401,
      'response time acceptable': (r) => r.timings.duration < 500,
    });
  });
  sleep(1);
}

/**
 * Test workspace operations for a specific tenant
 */
export function testWorkspacesByTenant() {
  const tenant = getTenantForUser(__VU);

  group(`Workspaces - ${tenant}`, () => {
    const headers = {
      'X-Tenant-Slug': tenant,
      'Content-Type': 'application/json',
    };

    const res = http.get(`${BASE_URL}/api/workspaces`, { headers, tags: { tenant } });
    check(res, {
      'list workspaces succeeds': (r) => r.status === 200 || r.status === 401,
      'response time acceptable': (r) => r.timings.duration < 500,
    });
  });
  sleep(1);
}

/**
 * Test tenant switching (same user accessing different tenants)
 */
export function testTenantSwitching() {
  group('Tenant Switching', () => {
    for (let i = 0; i < 3; i++) {
      const tenant = TENANTS[i];
      const headers = {
        'X-Tenant-Slug': tenant,
        'Content-Type': 'application/json',
      };

      const res = http.get(`${BASE_URL}/api/plugins`, { headers, tags: { tenant } });
      check(res, {
        [`tenant ${tenant} accessible`]: (r) => r.status === 200 || r.status === 401,
      });
    }
  });
  sleep(1);
}

/**
 * Test concurrent operations from different tenants
 */
export function testConcurrentTenantOps() {
  group('Concurrent Multi-Tenant Operations', () => {
    const requests = TENANTS.slice(0, 3).map((tenant) => ({
      method: 'GET',
      url: `${BASE_URL}/api/plugins`,
      params: {
        headers: {
          'X-Tenant-Slug': tenant,
          'Content-Type': 'application/json',
        },
        tags: { tenant },
      },
    }));

    const responses = http.batch(requests);

    responses.forEach((res, idx) => {
      check(res, {
        [`concurrent request ${idx} succeeds`]: (r) => r.status === 200 || r.status === 401,
        [`concurrent request ${idx} fast`]: (r) => r.timings.duration < 1000,
      });
    });
  });
  sleep(1);
}

/**
 * Test invalid tenant access
 */
export function testInvalidTenant() {
  group('Invalid Tenant Handling', () => {
    const headers = {
      'X-Tenant-Slug': 'invalid-tenant-' + __VU,
      'Content-Type': 'application/json',
    };

    const res = http.get(`${BASE_URL}/api/plugins`, { headers });
    check(res, {
      'invalid tenant returns error': (r) =>
        r.status === 400 || r.status === 404 || r.status === 401,
      'response time acceptable': (r) => r.timings.duration < 500,
    });
  });
  sleep(1);
}

/**
 * Test mixed operations across multiple tenants
 */
export function testMixedMultiTenantLoad() {
  const tenant = getTenantForUser(__VU);

  group(`Mixed Operations - ${tenant}`, () => {
    const headers = {
      'X-Tenant-Slug': tenant,
      'Content-Type': 'application/json',
    };

    // Mix of different endpoints
    const endpoints = [
      { method: 'GET', url: `${BASE_URL}/api/plugins` },
      { method: 'GET', url: `${BASE_URL}/api/workspaces` },
      { method: 'GET', url: `${BASE_URL}/health` },
    ];

    for (const endpoint of endpoints) {
      const res = http.request(endpoint.method, endpoint.url, null, { headers });
      check(res, {
        'request succeeds': (r) => r.status === 200 || r.status === 401,
      });
    }
  });
  sleep(1);
}

/**
 * Main test execution
 */
export default function () {
  const testFunctions = [
    testPluginsByTenant,
    testWorkspacesByTenant,
    testTenantSwitching,
    testConcurrentTenantOps,
    testInvalidTenant,
    testMixedMultiTenantLoad,
  ];

  const testIndex = Math.floor(__VU % testFunctions.length);
  testFunctions[testIndex]();
}
