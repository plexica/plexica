// messages.en.notifications.ts — Notification domain strings (features 006-01…006-05).
// Includes the PERSISTED title keys stored in notifications.title (resolved by
// the UI via react-intl — the row stores keys, not PII).

export const messagesNotifications = {
  // Bell (006-01/006-02)
  'notifications.bell.ariaLabel': 'Notifications',
  'notifications.bell.title': 'Notifications',
  'notifications.bell.empty': 'You are all caught up.',
  'notifications.bell.viewAll': 'View all',
  'notifications.markRead.ariaLabel': 'Mark as read',

  // Notification center (006-02)
  'notifications.center.title': 'Notifications',
  'notifications.center.markAllRead': 'Mark all as read',
  'notifications.center.empty': 'No notifications yet',
  'notifications.center.empty.description':
    'You will see workspace invites and plugin activity here as they happen.',
  'notifications.center.error': 'Failed to load notifications.',

  // Preferences (006-04)
  'notifications.prefs.title': 'Notification preferences',
  'notifications.prefs.loading': 'Loading preferences...',
  'notifications.prefs.error': 'Failed to load notification preferences.',
  'notifications.prefs.defaults.heading': 'Default channels',
  'notifications.prefs.types.heading': 'Per-type channels',
  'notifications.prefs.types.empty': 'No notification types are available yet.',
  'notifications.prefs.channel.inApp': 'In-app',
  'notifications.prefs.channel.email': 'Email',
  'notifications.prefs.save': 'Save preferences',
  'notifications.prefs.saved': 'Preferences saved',

  // Persisted title/body keys (stored in notifications.title/body)
  'notifications.workspace.invite.title': 'You have been invited to a workspace',
  'notifications.workspace.invite.body': 'Join the workspace to start collaborating.',
  'notifications.plugin.crm.contact_created.title': 'New contact: {name}',
} as const;