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
    status: 'PENDING_REVIEW',
    createdAt: '2026-01-15T10:00:00Z',
    submittedAt: '2026-01-15T10:00:00Z',
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
    createdAt: '2026-01-01T10:00:00Z',
    versions: [
      {
        id: 'ver-210',
        version: '2.1.0',
        changelog: 'Bug fixes and performance improvements',
        isLatest: true,
        publishedAt: '2026-01-28T10:00:00Z',
        downloadCount: 1234,
      },
      {
        id: 'ver-200',
        version: '2.0.0',
        changelog: 'Major update with breaking changes',
        isLatest: false,
        publishedAt: '2026-01-15T10:00:00Z',
        downloadCount: 5678,
      },
      {
        id: 'ver-100',
        version: '1.0.0',
        changelog: 'Initial release',
        isLatest: false,
        publishedAt: '2026-01-01T10:00:00Z',
        downloadCount: 2345,
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

/**
 * Mock analytics data matching the REAL API shape returned by
 * AdminApiClient.getPluginAnalytics(): { downloads, installs, ratings, averageRating }
 */
export const mockAnalyticsData = {
  downloads: 15234,
  installs: 487,
  ratings: 43,
  averageRating: 4.2,
};

/**
 * Mock installs data from AdminApiClient.getPluginInstalls()
 * Returns an array of { tenantId, installedAt, ... }
 */
export const mockInstallsData = [
  { tenantId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', installedAt: '2026-01-25T10:00:00Z' },
  { tenantId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901', installedAt: '2026-01-22T10:00:00Z' },
  { tenantId: 'c3d4e5f6-a7b8-9012-cdef-123456789012', installedAt: '2026-01-20T10:00:00Z' },
  { tenantId: 'd4e5f6a7-b8c9-0123-defa-234567890123', installedAt: '2026-01-18T10:00:00Z' },
  { tenantId: 'e5f6a7b8-c9d0-1234-efab-345678901234', installedAt: '2026-01-15T10:00:00Z' },
];

/**
 * Mock ratings data from AdminApiClient.getPluginRatings()
 * Returns { data: [...], pagination: {...} }
 */
export const mockRatingsData = {
  data: [
    {
      rating: 5,
      userId: 'user-1',
      comment: 'Excellent plugin!',
      createdAt: '2026-01-25T10:00:00Z',
    },
    { rating: 5, userId: 'user-2', comment: 'Great work', createdAt: '2026-01-24T10:00:00Z' },
    { rating: 4, userId: 'user-3', comment: 'Very good', createdAt: '2026-01-23T10:00:00Z' },
    { rating: 5, userId: 'user-4', comment: 'Love it', createdAt: '2026-01-22T10:00:00Z' },
    { rating: 3, userId: 'user-5', comment: 'Decent', createdAt: '2026-01-21T10:00:00Z' },
    { rating: 4, userId: 'user-6', comment: 'Good plugin', createdAt: '2026-01-20T10:00:00Z' },
    { rating: 5, userId: 'user-7', comment: 'Best in class', createdAt: '2026-01-19T10:00:00Z' },
    {
      rating: 2,
      userId: 'user-8',
      comment: 'Needs improvement',
      createdAt: '2026-01-18T10:00:00Z',
    },
    { rating: 5, userId: 'user-9', comment: 'Perfect', createdAt: '2026-01-17T10:00:00Z' },
    {
      rating: 1,
      userId: 'user-10',
      comment: 'Did not work for me',
      createdAt: '2026-01-16T10:00:00Z',
    },
  ],
  pagination: {
    page: 1,
    limit: 100,
    total: 10,
    totalPages: 1,
  },
};

export const apiEndpoints = {
  marketplace: {
    search: '/api/marketplace/plugins',
    getPlugin: (id: string) => `/api/marketplace/plugins/${id}`,
    stats: '/api/marketplace/stats',
    review: (id: string) => `/api/marketplace/plugins/${id}/review`,
    publish: '/api/marketplace/publish',
    publishVersion: (id: string) => `/api/marketplace/plugins/${id}/versions`,
    analytics: (id: string) => `/api/marketplace/plugins/${id}/analytics`,
    ratings: (id: string) => `/api/marketplace/plugins/${id}/ratings`,
  },
  admin: {
    plugins: '/api/admin/plugins',
    pluginDetail: (id: string) => `/api/admin/plugins/${id}`,
    pluginInstalls: (id: string) => `/api/admin/plugins/${id}/installs`,
  },
  auth: {
    login: '/auth/login',
    logout: '/auth/logout',
  },
};
