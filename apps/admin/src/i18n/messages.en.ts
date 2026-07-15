// messages.en.ts — English (default) translations for apps/admin.
// All UI strings must go through react-intl — no hardcoded text in components.
// Domain-split to stay under 200 lines per file (Constitution Rule 4).

export const messages = {
  'admin.app.name': 'Plexica Admin',
  'admin.app.tagline': 'Platform control plane',

  'admin.nav.dashboard': 'Dashboard',
  'admin.nav.tenants': 'Tenants',
  'admin.nav.provision': 'Provision Tenant',
  'admin.nav.plugins': 'Plugins',
  'admin.nav.health': 'System Health',
  'admin.nav.logs': 'Logs',
  'admin.nav.kafka': 'Kafka',

  'admin.login.title': 'Plexica Admin',
  'admin.login.subtitle': 'Sign in with your platform administrator credentials',
  'admin.login.username': 'Username',
  'admin.login.password': 'Password',
  'admin.login.submit': 'Sign in',
  'admin.login.error': 'Invalid credentials',
  'admin.login.signingIn': 'Signing in…',
  'admin.logout': 'Sign out',

  'admin.session.expired': 'Your session has expired. Redirecting to login…',

  'admin.page.placeholder': 'This section is under construction',

  'admin.health.title': 'System Health',
  'admin.health.loading': 'Loading service status…',
  'admin.health.error': 'Failed to load service health.',
  'admin.health.retry': 'Retry',
  'admin.health.status.healthy': 'Healthy',
  'admin.health.status.degraded': 'Degraded',
  'admin.health.status.down': 'Down',
  'admin.health.latency': '{ms} ms',

  'admin.kafka.title': 'Kafka Status',
  'admin.kafka.consumerLag': 'Consumer Lag',
  'admin.kafka.dlqDepth': 'Dead Letter Queue',
  'admin.kafka.totalLag': 'Total consumer lag: {count, number} messages',
  'admin.kafka.totalDlq': 'Total DLQ depth: {count, number} messages',
  'admin.kafka.warnings.highLag': '{count, number} consumer(s) above lag threshold of 1000',
  'admin.kafka.warnings.highDlq': 'DLQ depth above threshold of 100',
  'admin.kafka.columns.plugin': 'Plugin',
  'admin.kafka.columns.tenant': 'Tenant',
  'admin.kafka.columns.lag': 'Lag',
  'admin.kafka.columns.topic': 'Topic',
  'admin.kafka.columns.consumerGroup': 'Consumer Group',
  'admin.kafka.columns.status': 'Status',
  'admin.kafka.columns.dlqCount': 'DLQ Count',
  'admin.kafka.status.ok': 'OK',
  'admin.kafka.status.warning': 'Warning',
  'admin.kafka.empty': 'No active Kafka consumers.',
  'admin.kafka.loading': 'Loading Kafka status…',
  'admin.kafka.error': 'Failed to load Kafka status.',
  'admin.kafka.retry': 'Retry',
  'admin.kafka.unit.messages': 'messages',

  'tenants.title': 'Tenants',
  'tenants.search.placeholder': 'Search by name or slug',
  'tenants.filter.status': 'Filter by status',
  'tenants.filter.all': 'All statuses',
  'tenants.filter.clear': 'Clear all',
  'tenants.empty': 'No tenants found. Try a different search term or clear your filters.',
  'tenants.loading': 'Loading tenants…',
  'tenants.error': 'Failed to load tenants. The tenant list service is unavailable.',
  'tenants.resultCount': 'Showing {from}–{to} of {total} tenants',

  'tenants.status.active': 'Active',
  'tenants.status.suspended': 'Suspended',
  'tenants.status.pending_deletion': 'Pending deletion',
  'tenants.status.deleted': 'Deleted',

  'tenants.columns.name': 'Name',
  'tenants.columns.slug': 'Slug',
  'tenants.columns.status': 'Status',
  'tenants.columns.created': 'Created',
  'tenants.actions.view': 'View',

  'common.prev': 'Previous',
  'common.next': 'Next',
  'common.page': 'Page',
} as const;

export type MessageKey = keyof typeof messages;
