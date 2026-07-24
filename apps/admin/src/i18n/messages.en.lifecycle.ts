// messages.en.lifecycle.ts — Tenant lifecycle dialog + deletion panel strings.
// Split from messages.en.ts to stay under 200 lines per file (Rule 4).

export const lifecycleMessages = {
  'tenants.suspend.title': 'Suspend tenant: {name}',
  'tenants.suspend.warning': 'All users of this tenant will be immediately blocked from signing in. Existing sessions are revoked.',
  'tenants.suspend.confirm': 'Suspend',
  'tenants.suspend.error.conflict': 'This tenant was modified by another administrator. Reload the tenant and retry.',
  'tenants.suspend.error.generic': 'Failed to suspend the tenant. Please retry.',

  'tenants.reactivate.title': 'Reactivate tenant: {name}',
  'tenants.reactivate.warning': 'Users will be able to access the tenant again.',
  'tenants.reactivate.confirm': 'Reactivate',
  'tenants.reactivate.error.conflict': 'This tenant was modified by another administrator. Reload the tenant and retry.',
  'tenants.reactivate.error.generic': 'Failed to reactivate the tenant. Please retry.',

  'tenants.delete.title': 'Delete tenant: {name}',
  'tenants.delete.warning': 'This will permanently DROP the PostgreSQL schema, DELETE the Keycloak realm, and DELETE the MinIO bucket. This action is irreversible and performed for GDPR compliance.',
  'tenants.delete.confirmPrompt': 'Type the tenant slug to confirm',
  'tenants.delete.confirmButton': 'Delete Permanently',
  'tenants.delete.typeSlug': "Type the tenant slug '{slug}' to confirm",
  'tenants.delete.error.conflict': 'This tenant was modified by another administrator. Reload the tenant and retry.',
  'tenants.delete.error.generic': 'Failed to start deletion. Please retry.',
  'tenants.delete.cancel': 'Cancel',

  'tenants.deletion.title': 'Deletion in progress — {name}',
  'tenants.deletion.subtitle': 'Deletion saga steps',
  'tenants.deletion.step.eventDataPurge': 'Erase event data and credentials',
  'tenants.deletion.step.schemaDrop': 'Drop PostgreSQL schema',
  'tenants.deletion.step.realmDelete': 'Delete Keycloak realm',
  'tenants.deletion.step.bucketDelete': 'Delete MinIO bucket',
  'tenants.deletion.status.pending': 'Pending',
  'tenants.deletion.status.inProgress': 'In progress',
  'tenants.deletion.status.done': 'Done',
  'tenants.deletion.status.failed': 'Failed',
  'tenants.deletion.retry': 'Retry step',
  'tenants.deletion.attempts': '{count, plural, one {# attempt} other {# attempts}}',
  'tenants.deletion.lastError': 'Last error: {error}',
  'tenants.deletion.loading': 'Loading deletion status…',
  'tenants.deletion.error': 'Failed to load deletion status.',
  'tenants.deletion.retryError': 'Failed to retry step. Please try again.',
  'tenants.deletion.refresh': 'Refresh status',
  'tenants.deletion.complete': 'Deletion complete — all resources erased.',

  'common.cancel': 'Cancel',
  'common.close': 'Close',
} as const;
