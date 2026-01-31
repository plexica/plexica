/**
 * Test Fixtures for Marketplace E2E Tests
 *
 * These fixtures provide test data for plugin marketplace testing.
 */

export const testPlugins = {
  // Plugin ready for review (PENDING_REVIEW status)
  pendingPlugin: {
    id: 'test-pending-plugin',
    name: 'Test Pending Plugin',
    version: '1.0.0',
    description: 'A test plugin pending review',
    longDescription:
      'This is a longer description for testing purposes. It contains enough text to meet validation requirements.',
    category: 'productivity',
    author: 'Test Author',
    authorEmail: 'test@example.com',
    license: 'MIT',
    homepage: 'https://example.com',
    repository: 'https://github.com/test/plugin',
    tags: ['test', 'automation'],
    icon: '🧪',
    manifest: {
      version: '1.0.0',
      permissions: ['read:users', 'write:data'],
      endpoints: ['/api/test'],
    },
  },

  // New plugin to publish
  newPlugin: {
    id: 'test-new-plugin',
    name: 'Test New Plugin',
    version: '1.0.0',
    description: 'A brand new test plugin for publishing',
    longDescription:
      'This is a comprehensive description for our new plugin. It demonstrates all the features and capabilities of the plugin system, including dynamic loading, isolation, and permission management.',
    category: 'integration',
    author: 'Test Developer',
    authorEmail: 'developer@example.com',
    license: 'Apache-2.0',
    homepage: 'https://test-plugin.example.com',
    repository: 'https://github.com/testorg/test-plugin',
    tags: ['integration', 'api', 'testing'],
    screenshots: [
      'https://picsum.photos/800/600?random=1',
      'https://picsum.photos/800/600?random=2',
    ],
    demoUrl: 'https://demo.test-plugin.example.com',
    icon: '🚀',
  },

  // Published plugin with versions
  publishedPlugin: {
    id: 'test-published-plugin',
    name: 'Test Published Plugin',
    version: '2.1.0',
    description: 'A published plugin with multiple versions',
    longDescription: 'This plugin has been published and has multiple versions available.',
    category: 'analytics',
    author: 'Test Publisher',
    authorEmail: 'publisher@example.com',
    license: 'MIT',
    status: 'PUBLISHED',
    versions: [
      {
        version: '2.1.0',
        changelog: 'Bug fixes and performance improvements',
        isLatest: true,
      },
      {
        version: '2.0.0',
        changelog: 'Major update with breaking changes',
        isLatest: false,
      },
      {
        version: '1.0.0',
        changelog: 'Initial release',
        isLatest: false,
      },
    ],
  },

  // New version data
  newVersion: {
    version: '2.2.0',
    changelog: `## What's New
- Added new feature X
- Improved performance by 50%
- Fixed critical security issue

## Breaking Changes
- Updated API endpoint structure
- Removed deprecated methods

## Bug Fixes
- Fixed memory leak in data processing
- Corrected timezone handling`,
    setAsLatest: true,
  },
};

export const testUsers = {
  superAdmin: {
    username: 'superadmin@plexica.io',
    password: 'SuperAdmin123!',
    role: 'super-admin',
  },
};

export const mockAnalyticsData = {
  totalDownloads: 15234,
  totalInstalls: 487,
  activeInstalls: 423,
  growthRate: 23.5,
  downloadsByDay: [
    { date: '2026-01-21', count: 145 },
    { date: '2026-01-22', count: 167 },
    { date: '2026-01-23', count: 189 },
    { date: '2026-01-24', count: 203 },
    { date: '2026-01-25', count: 178 },
    { date: '2026-01-26', count: 221 },
    { date: '2026-01-27', count: 245 },
    { date: '2026-01-28', count: 267 },
  ],
  installsByDay: [
    { date: '2026-01-21', count: 12 },
    { date: '2026-01-22', count: 15 },
    { date: '2026-01-23', count: 18 },
    { date: '2026-01-24', count: 22 },
    { date: '2026-01-25', count: 19 },
    { date: '2026-01-26', count: 25 },
    { date: '2026-01-27', count: 28 },
    { date: '2026-01-28', count: 31 },
  ],
  topTenants: [
    { tenantName: 'Acme Corporation', installDate: '2026-01-15' },
    { tenantName: 'TechStart Inc', installDate: '2026-01-18' },
    { tenantName: 'Global Enterprises', installDate: '2026-01-20' },
    { tenantName: 'Innovation Labs', installDate: '2026-01-22' },
    { tenantName: 'Digital Solutions', installDate: '2026-01-25' },
  ],
  ratingDistribution: {
    5: 312,
    4: 98,
    3: 45,
    2: 18,
    1: 14,
  },
};

export const apiEndpoints = {
  marketplace: {
    search: '/api/marketplace/plugins',
    getPlugin: (id: string) => `/api/marketplace/plugins/${id}`,
    stats: '/api/marketplace/stats',
    review: (id: string) => `/api/marketplace/plugins/${id}/review`,
    reviewPlugin: (id: string) => `/api/v1/marketplace/admin/review/${id}`,
    publish: '/api/marketplace/publish',
    publishVersion: (id: string) => `/api/marketplace/plugins/${id}/versions`,
    analytics: (id: string) => `/api/marketplace/plugins/${id}/analytics`,
  },
  auth: {
    login: '/auth/login',
    logout: '/auth/logout',
  },
};
