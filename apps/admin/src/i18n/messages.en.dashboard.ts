// messages.en.dashboard.ts — English translations for the dashboard domain.
// Split from messages.en.ts to stay under 200 lines per file (Constitution
// Rule 4). Merged into the default messages object in messages.en.ts.

export const dashboardMessages = {
  'dashboard.title': 'Dashboard',
  'dashboard.loading': 'Loading dashboard metrics…',
  'dashboard.error': 'Failed to load platform metrics.',
  'dashboard.retry': 'Retry',
  'dashboard.metrics.tenants': 'Tenants',
  'dashboard.metrics.activeTenants': 'Active tenants',
  'dashboard.metrics.activePlugins': '{count, number} active',
  'dashboard.metrics.plugins': 'Plugins',
  'dashboard.metrics.dlqDepth': 'DLQ depth',
  'dashboard.metrics.totalUsers': 'Total users',
  'dashboard.metrics.workspaceCount': 'Workspaces',
  'dashboard.metrics.unavailable': 'Unavailable',
  'dashboard.health.status': 'Health status',
  'dashboard.tenantStatus.title': 'Tenants by status',
  'dashboard.tenantStatus.active': 'Active',
  'dashboard.tenantStatus.suspended': 'Suspended',
  'dashboard.tenantStatus.pendingDeletion': 'Pending deletion',
  'dashboard.tenantStatus.deleted': 'Deleted',
  'dashboard.quickActions.title': 'Quick actions',
  'dashboard.quickActions.provision': 'Provision tenant',
  'dashboard.quickActions.health': 'View health',
  'dashboard.quickActions.logs': 'View logs',
} as const;
