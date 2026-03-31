// messages.en.ts — English (default) translations for apps/web
// All UI strings must go through react-intl — no hardcoded text in components.

export const messages = {
  // Login page
  'login.title': 'Sign in to Plexica',
  'login.subtitle': 'Welcome back. Enter your credentials to continue.',
  'login.email.label': 'Email address',
  'login.email.placeholder': 'you@example.com',
  'login.password.label': 'Password',
  'login.password.placeholder': '••••••••',
  'login.submit': 'Sign in',
  'login.loading': 'Signing in…',

  // Generic
  'app.name': 'Plexica',
} as const;

export type MessageKey = keyof typeof messages;
