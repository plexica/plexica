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
// Tenant Admin (Spec 008)
// ---------------------------------------------------------------------------

export const mockTenantDashboard = {
  totalUsers: 12,
  activeUsers: 9,
  pendingInvitations: 3,
  totalTeams: 4,
  activePlugins: 2,
  storageUsedBytes: 512 * 1024 * 1024, // 512 MB
  apiCalls24h: 8450,
};

export const mockTenantUsers = {
  data: [
    {
      id: 'u-1',
      email: 'alice@acme-corp.plexica.local',
      name: 'Alice Admin',
      status: 'active',
      roles: ['admin'],
      lastLoginAt: '2026-03-01T10:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'u-2',
      email: 'bob@acme-corp.plexica.local',
      name: 'Bob Member',
      status: 'active',
      roles: ['member'],
      lastLoginAt: '2026-03-02T08:30:00Z',
      createdAt: '2026-01-15T00:00:00Z',
    },
    {
      id: 'u-3',
      email: 'charlie@acme-corp.plexica.local',
      name: 'Charlie Invited',
      status: 'invited',
      roles: [],
      lastLoginAt: null,
      createdAt: '2026-02-20T00:00:00Z',
    },
  ],
  pagination: { page: 1, limit: 20, total: 3, totalPages: 1 },
};

export const mockTenantTeams = {
  data: [
    {
      id: 'team-a',
      name: 'Engineering',
      description: 'Core engineering team',
      memberCount: 5,
      createdAt: '2026-01-05T00:00:00Z',
      updatedAt: '2026-02-01T00:00:00Z',
    },
    {
      id: 'team-b',
      name: 'Design',
      description: 'Product design team',
      memberCount: 3,
      createdAt: '2026-01-06T00:00:00Z',
      updatedAt: '2026-02-02T00:00:00Z',
    },
  ],
  pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
};

export const mockTenantTeamDetail = {
  id: 'team-a',
  name: 'Engineering',
  description: 'Core engineering team',
  memberCount: 2,
  createdAt: '2026-01-05T00:00:00Z',
  updatedAt: '2026-02-01T00:00:00Z',
  members: [
    {
      userId: 'u-1',
      email: 'alice@acme-corp.plexica.local',
      name: 'Alice Admin',
      role: 'OWNER',
      joinedAt: '2026-01-05T00:00:00Z',
    },
    {
      userId: 'u-2',
      email: 'bob@acme-corp.plexica.local',
      name: 'Bob Member',
      role: 'MEMBER',
      joinedAt: '2026-01-10T00:00:00Z',
    },
  ],
};

export const mockTenantRoles = [
  {
    id: 'role-admin',
    name: 'Admin',
    description: 'Full administrative access',
    isSystem: true,
    permissions: ['workspace:read', 'workspace:write', 'members:manage'],
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'role-member',
    name: 'Member',
    description: 'Standard member access',
    isSystem: true,
    permissions: ['workspace:read'],
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'role-custom-1',
    name: 'Read-Only Reporter',
    description: 'Can view dashboards and export reports',
    isSystem: false,
    permissions: ['workspace:read'],
    createdAt: '2026-02-10T00:00:00Z',
  },
];

export const mockPermissions = [
  { id: 'workspace:read', name: 'workspace:read', description: 'Read workspace data' },
  { id: 'workspace:write', name: 'workspace:write', description: 'Write workspace data' },
  { id: 'members:manage', name: 'members:manage', description: 'Manage workspace members' },
  { id: 'plugins:manage', name: 'plugins:manage', description: 'Manage plugins' },
];

export const mockTenantSettings = {
  theme: {
    primaryColor: '#6366f1',
    accentColor: '#8b5cf6',
    logoUrl: '',
    fontHeading: 'Inter',
    fontBody: 'Inter',
  },
  preferences: {
    locale: 'en-US',
    timezone: 'UTC',
    dateFormat: 'MM/DD/YYYY',
  },
};

export const mockAuditLogs = {
  data: [
    {
      id: 'al-1',
      userId: 'u-1',
      userEmail: 'alice@acme-corp.plexica.local',
      action: 'USER_INVITED',
      resourceType: 'User',
      resourceId: 'u-3',
      details: { email: 'charlie@acme-corp.plexica.local' },
      createdAt: '2026-03-01T10:00:00Z',
    },
    {
      id: 'al-2',
      userId: 'u-1',
      userEmail: 'alice@acme-corp.plexica.local',
      action: 'TEAM_CREATED',
      resourceType: 'Team',
      resourceId: 'team-a',
      details: { name: 'Engineering' },
      createdAt: '2026-01-05T09:00:00Z',
    },
  ],
  pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
};

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
