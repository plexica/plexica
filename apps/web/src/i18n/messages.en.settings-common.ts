// messages.en.settings-common.ts — Settings, profile, audit, common, and empty state strings.

export const messagesSettingsCommon = {
  // Settings — feedback
  'settings.unsavedChanges': 'Unsaved changes',
  'settings.saved': 'Saved',

  // Settings — pages
  'settings.general.title': 'General Settings',
  'settings.general.displayName.description': 'This name is shown in the header and emails.',
  'settings.general.displayName.label': 'Organization name',
  'settings.general.slug.label': 'Organization slug',
  'settings.general.slug.tooltip': 'The slug cannot be changed after creation.',
  'settings.general.save': 'Save',
  'settings.branding.title': 'Branding',
  'settings.branding.logo.label': 'Logo',
  // {maxMb} / {formats} are derived from LOGO_UPLOAD (services/settings-api.ts),
  // which mirrors the server contract. Never restate the numbers in the copy.
  'settings.branding.logo.description':
    'Shown in the header and login page. Max {maxMb} MB. {formats}.',
  'settings.branding.appearance.title': 'Appearance',
  'settings.branding.appearance.description': 'Customize your organization\'s color theme.',
  'settings.branding.primaryColor.label': 'Primary color',
  'settings.branding.darkMode.label': 'Dark mode',
  'settings.branding.save': 'Save',
  'settings.auth.title': 'Authentication',
  'settings.auth.description': 'Configure Keycloak realm security settings.',
  'settings.auth.bruteForce.label': 'Brute force protection',
  'settings.auth.sessionLifespan.label': 'Session lifespan (seconds)',
  'settings.auth.save': 'Save',

  // Profile
  'profile.title': 'Profile',
  // {maxMb} / {formats} are derived from AVATAR_UPLOAD (services/profile-api.ts),
  // which mirrors the server contract. Never restate the numbers in the copy.
  'profile.avatar.description': 'Upload a photo. Max {maxMb} MB. {formats}.',
  'profile.displayName.label': 'Display name',
  'profile.timezone.label': 'Timezone',
  'profile.language.label': 'Language',
  'profile.avatar.label': 'Avatar',
  'profile.save': 'Save',

  // Audit log
  'auditLog.title': 'Audit Log',
  'auditLog.filter.actor': 'Actor',
  'auditLog.filter.action': 'Action type',
  'auditLog.filter.allActions': 'All actions',
  'auditLog.filter.dateRange': 'Date range',
  'auditLog.filter.workspace': 'Workspace',
  'auditLog.filter.from': 'From',
  'auditLog.filter.to': 'To',
  'auditLog.table.actor': 'Actor',
  'auditLog.table.action': 'Action',
  'auditLog.table.target': 'Target',
  'auditLog.table.workspace': 'Workspace',
  'auditLog.table.time': 'Time',
  'auditLog.empty': 'No audit log entries found.',

  // Common
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.restore': 'Restore',
  'common.edit': 'Edit',
  'common.retry': 'Try again',
  'common.none': 'None',
  'common.select.placeholder': 'Select\u2026',
  'common.loading': 'Loading\u2026',
  'common.error': 'An error occurred.',
  'common.noData': 'No data.',
  'common.search': 'Search',
  'common.filter': 'Filter',
  'common.status': 'Status',
  'common.actions': 'Actions',
  'common.page': 'Page {page} of {total}',
  'common.prevPage': 'Previous page',
  'common.nextPage': 'Next page',

  // Page-level error state (PageError component)
  'error.page.heading': 'Failed to load',
  'error.page.description': 'Something went wrong while loading this page.',

  // Upload failures — rendered next to the FileUpload control.
  // Resolved from ApiError.code by i18n/upload-messages.ts.
  'upload.error.tooLarge': 'That file is too large. The maximum size is {maxMb} MB.',
  'upload.error.invalidType': 'That file type is not supported. Allowed formats: {formats}.',
  'upload.error.invalidFile': 'That file could not be accepted. Please choose another one.',
  'upload.error.rateLimited': 'Too many uploads in a short time. Please wait and try again.',
  'upload.error.forbidden': 'You do not have permission to upload this file.',
  'upload.error.server': 'The upload failed because of a server error. Please try again.',
  'upload.error.invalidResponse': 'The server returned an unexpected response. Please try again.',
  'upload.error.generic': 'The upload failed. Please try again.',

  // Empty states (per-page)
  'users.list.empty': 'No users yet',
  'users.list.empty.description': 'Users added to this organization will appear here.',
  'workspace.templates.empty': 'No templates',
  'workspace.templates.empty.description': 'Workspace templates have not been configured yet.',
  'workspace.members.empty': 'No members yet',
  'workspace.members.empty.description': 'Invite users to give them access to this workspace.',
  'workspace.children.empty': 'No sub-workspaces',
  'workspace.children.empty.description': 'Sub-workspaces created under this workspace will appear here.',
} as const;
