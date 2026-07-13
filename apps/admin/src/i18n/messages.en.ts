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
} as const;

export type MessageKey = keyof typeof messages;
