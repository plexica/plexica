/**
 * Test Data Fixtures for Web App E2E Tests
 *
 * Mock data matching the real API shapes used by WebApiClient / TenantApiClient.
 */

// ---------------------------------------------------------------------------
// Tenant
// ---------------------------------------------------------------------------

export const mockTenant = {
  id: 'mock-tenant-id',
  name: 'Acme Corp',
  slug: 'acme-corp',
  status: 'ACTIVE',
  settings: {},
  theme: {},
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-02-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export const mockUser = {
  id: 'mock-tenant-user-id',
  email: 'user@acme-corp.plexica.local',
  name: 'Test User (E2E)',
  tenantId: 'mock-tenant-id',
  roles: ['admin', 'member'],
  permissions: ['workspace:manage', 'members:manage', 'plugins:manage'],
};

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export const mockWorkspaces = [
  {
    id: 'ws-1',
    name: 'Engineering',
    slug: 'engineering',
    description: 'Engineering team workspace',
    tenantId: 'mock-tenant-id',
    ownerId: 'mock-tenant-user-id',
    memberRole: 'ADMIN',
    createdAt: '2026-01-10T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 'ws-2',
    name: 'Marketing',
    slug: 'marketing',
    description: 'Marketing team workspace',
    tenantId: 'mock-tenant-id',
    ownerId: 'mock-tenant-user-id',
    memberRole: 'ADMIN',
    createdAt: '2026-01-12T00:00:00Z',
    updatedAt: '2026-01-18T00:00:00Z',
  },
];

export const mockWorkspaceDetail = {
  ...mockWorkspaces[0],
  memberCount: 5,
  teamCount: 2,
};

// ---------------------------------------------------------------------------
// Workspace Members
// ---------------------------------------------------------------------------

export const mockWorkspaceMembers = [
  {
    id: 'member-1',
    userId: 'mock-tenant-user-id',
    workspaceId: 'ws-1',
    role: 'OWNER',
    user: {
      id: 'mock-tenant-user-id',
      email: 'user@acme-corp.plexica.local',
      name: 'Test User (E2E)',
    },
    createdAt: '2026-01-10T00:00:00Z',
  },
  {
    id: 'member-2',
    userId: 'user-2',
    workspaceId: 'ws-1',
    role: 'ADMIN',
    user: { id: 'user-2', email: 'admin@acme-corp.plexica.local', name: 'Admin User' },
    createdAt: '2026-01-11T00:00:00Z',
  },
  {
    id: 'member-3',
    userId: 'user-3',
    workspaceId: 'ws-1',
    role: 'MEMBER',
    user: { id: 'user-3', email: 'member@acme-corp.plexica.local', name: 'Regular Member' },
    createdAt: '2026-01-12T00:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export const mockTeams = [
  {
    id: 'team-1',
    name: 'Frontend Team',
    description: 'Handles all frontend development',
    workspaceId: 'ws-1',
    memberCount: 3,
    createdAt: '2026-01-10T00:00:00Z',
  },
  {
    id: 'team-2',
    name: 'Backend Team',
    description: 'API and infrastructure',
    workspaceId: 'ws-1',
    memberCount: 4,
    createdAt: '2026-01-11T00:00:00Z',
  },
];

// ---------------------------------------------------------------------------
// Plugins (tenant-scoped)
// ---------------------------------------------------------------------------

export const mockTenantPlugins = [
  {
    id: 'tp-1',
    pluginId: 'plugin-crm',
    tenantId: 'mock-tenant-id',
    status: 'ACTIVE',
    plugin: {
      id: 'plugin-crm',
      name: 'CRM Pro',
      version: '2.0.0',
      description: 'Customer relationship management',
      category: 'productivity',
      author: 'Plexica Team',
    },
    installedAt: '2026-01-20T00:00:00Z',
    activatedAt: '2026-01-20T00:00:00Z',
  },
  {
    id: 'tp-2',
    pluginId: 'plugin-analytics',
    tenantId: 'mock-tenant-id',
    status: 'ACTIVE',
    plugin: {
      id: 'plugin-analytics',
      name: 'Analytics Dashboard',
      version: '1.5.0',
      description: 'Real-time analytics and reporting',
      category: 'analytics',
      author: 'Plexica Team',
    },
    installedAt: '2026-01-22T00:00:00Z',
    activatedAt: '2026-01-22T00:00:00Z',
  },
  {
    id: 'tp-3',
    pluginId: 'plugin-billing',
    tenantId: 'mock-tenant-id',
    status: 'INSTALLED',
    plugin: {
      id: 'plugin-billing',
      name: 'Billing Manager',
      version: '1.0.0',
      description: 'Subscription and invoice management',
      category: 'finance',
      author: 'Third Party Dev',
    },
    installedAt: '2026-01-25T00:00:00Z',
    activatedAt: null,
  },
];

// ---------------------------------------------------------------------------
// Marketplace Plugins (available for install)
// ---------------------------------------------------------------------------

export const mockMarketplacePlugins = [
  {
    id: 'plugin-crm',
    name: 'CRM Pro',
    version: '2.0.0',
    description: 'Customer relationship management',
    category: 'productivity',
    author: 'Plexica Team',
    status: 'PUBLISHED',
    averageRating: 4.5,
    installCount: 120,
  },
  {
    id: 'plugin-analytics',
    name: 'Analytics Dashboard',
    version: '1.5.0',
    description: 'Real-time analytics and reporting',
    category: 'analytics',
    author: 'Plexica Team',
    status: 'PUBLISHED',
    averageRating: 4.8,
    installCount: 250,
  },
  {
    id: 'plugin-hr',
    name: 'HR Suite',
    version: '1.0.0',
    description: 'Human resources and employee management',
    category: 'hr',
    author: 'Third Party Dev',
    status: 'PUBLISHED',
    averageRating: 4.0,
    installCount: 45,
  },
];

// ---------------------------------------------------------------------------
// API Endpoints used by WebApiClient
// ---------------------------------------------------------------------------

export const apiEndpoints = {
  tenant: {
    bySlug: (slug: string) => `/api/tenants/slug/${slug}`,
    current: '/api/tenants/current',
  },
  workspaces: {
    list: '/api/workspaces',
    detail: (id: string) => `/api/workspaces/${id}`,
    create: '/api/workspaces',
    members: (id: string) => `/api/workspaces/${id}/members`,
    memberDetail: (id: string, userId: string) => `/api/workspaces/${id}/members/${userId}`,
    teams: (id: string) => `/api/workspaces/${id}/teams`,
  },
  plugins: {
    tenantPlugins: (tenantId: string) => `/api/tenants/${tenantId}/plugins`,
    install: (tenantId: string, pluginId: string) =>
      `/api/tenants/${tenantId}/plugins/${pluginId}/install`,
    uninstall: (tenantId: string, pluginId: string) =>
      `/api/tenants/${tenantId}/plugins/${pluginId}`,
    activate: (tenantId: string, pluginId: string) =>
      `/api/tenants/${tenantId}/plugins/${pluginId}/activate`,
    deactivate: (tenantId: string, pluginId: string) =>
      `/api/tenants/${tenantId}/plugins/${pluginId}/deactivate`,
  },
  marketplace: {
    list: '/api/plugins',
    detail: (id: string) => `/api/plugins/${id}`,
  },
};
