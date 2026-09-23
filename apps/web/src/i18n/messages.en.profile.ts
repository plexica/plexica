// messages.en.profile.ts — Profile domain strings (features 006-11…006-14).
// The pre-existing `profile.*` keys (title, avatar upload, display name,
// timezone, language, save) live in the settings-common domain — this file
// holds ONLY the new 006 Phase 5 keys (email, sessions, password, source).

export const messagesProfile = {
  // Email (006-11)
  'profile.email.label': 'Email',
  'profile.email.error': 'Enter a valid email address.',

  // Display name validation (006-11) — rendered instead of the raw Zod message.
  'profile.displayName.error': 'Enter a display name (1–120 characters).',

  // Save failure (006-11) — rendered from the update mutation's isError.
  'profile.save.error': 'Failed to save your profile. Please try again.',
  // Sessions (006-13)
  'profile.sessions.title': 'Active sessions',
  'profile.sessions.description': 'Devices and browsers currently signed in to your account.',
  'profile.sessions.empty': 'No active sessions.',
  'profile.sessions.error': 'Failed to load sessions.',
  'profile.sessions.revokeError': 'Failed to revoke the session. Please try again.',
  'profile.sessions.current': 'Current session',
  'profile.sessions.revoke': 'Revoke',
  'profile.sessions.lastSeen': 'Last seen {date}',

  // Password (006-14)
  'profile.password.title': 'Password',
  'profile.password.description': 'Passwords are managed in the Keycloak account console.',
  'profile.password.button': 'Change password',

  // Avatar source (006-12)
  'profile.avatar.source.keycloak': 'Avatar provided by your identity provider.',
  'profile.avatar.source.upload': 'Uploaded avatar.',
} as const;
