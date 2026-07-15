// messages.en.logs.ts — English translations for the system logs domain (S5-A04).
// Split from messages.en.ts to stay under 200 lines per file (Constitution
// Rule 4). Merged into the default messages object in messages.en.ts.

export const logsMessages = {
  'admin.logs.title': 'System Logs',
  'admin.logs.loading': 'Loading logs…',
  'admin.logs.empty': 'No logs match the current filters.',
  'admin.logs.search': 'Search',
  'admin.logs.clear': 'Clear filters',
  'admin.logs.resultCount': 'Showing {count, plural, =0 {no entries} one {# entry} other {# entries}}',
  'admin.logs.truncated': 'Showing the first {limit} results. Narrow the filters for fewer entries.',

  'admin.logs.filter.tenant': 'Tenant',
  'admin.logs.filter.tenantPlaceholder': 'All tenants',
  'admin.logs.filter.level': 'Level',
  'admin.logs.filter.levelAll': 'All levels',
  'admin.logs.filter.limit': 'Limit',

  'admin.logs.level.debug': 'Debug',
  'admin.logs.level.info': 'Info',
  'admin.logs.level.warn': 'Warn',
  'admin.logs.level.error': 'Error',

  'admin.logs.columns.timestamp': 'Timestamp',
  'admin.logs.columns.level': 'Level',
  'admin.logs.columns.tenant': 'Tenant',
  'admin.logs.columns.message': 'Message',
  'admin.logs.columns.metadata': 'Metadata',
  'admin.logs.expand': 'Expand row',
  'admin.logs.collapse': 'Collapse row',
  'admin.logs.noTenant': '—',

  'admin.logs.error.title': 'Failed to load logs.',
  'admin.logs.error.serviceUnavailable': 'Log service (Loki) is not available. Check infrastructure.',
  'admin.logs.error.queryTimeout': 'Log query timed out. Try narrowing the time range or reducing the limit.',
  'admin.logs.error.generic': 'The log service is unavailable.',
  'admin.logs.retry': 'Retry',
} as const;
