// messages.en.ts — English (default) translations for apps/web
// All UI strings must go through react-intl — no hardcoded text in components.

export const messages = {
  // Generic
  'app.name': 'Plexica',

  // Login page (legacy — kept for smoke test compatibility)
  'login.title': 'Sign in to Plexica',
  'login.subtitle': 'Welcome back. Enter your credentials to continue.',
  'login.email.label': 'Email address',
  'login.email.placeholder': 'you@example.com',
  'login.password.label': 'Password',
  'login.password.placeholder': '••••••••',
  'login.submit': 'Sign in',
  'login.loading': 'Signing in…',

  // Auth callback
  'auth.callback.loading': 'Signing you in…',
  'auth.callback.error': 'Authentication failed. Please try again.',
  'auth.callback.backToLogin': 'Back to sign in',

  // Session expiry
  'auth.session.expired': 'Your session has expired.',
  'auth.session.redirecting': 'Redirecting to sign in…',
  'auth.session.dismiss': 'Dismiss',

  // Organization error page
  'org.error.notFound.title': 'Organization not found',
  'org.error.notFound.description':
    "We couldn't find the organization you're looking for. Please check the URL and try again.",
  'org.error.noSubdomain.title': 'Which organization?',
  'org.error.noSubdomain.description':
    "Please navigate to your organization's address to continue.",
  'org.error.addressExample': 'Example: your-org.plexica.io',
  'org.error.contactAdmin': 'If you need help, contact your administrator.',
  'org.error.visitSite': 'Visit plexica.io',

  // Navigation
  'nav.dashboard': 'Dashboard',
  'nav.toggle': 'Toggle sidebar',
  'nav.search': 'Search',
  'nav.skipToContent': 'Skip to main content',
  'nav.primaryNavigation': 'Primary navigation',
  // P6-M-2: distinct label for the <aside> complementary landmark so it does not share
  // "Primary navigation" with the inner <nav>, preventing duplicate AT landmark labels.
  'nav.sidebar': 'Sidebar',
  // P8-I-3: accessible name for the mobile drawer dialog (design-spec: "Navigation").
  'nav.sidebarDrawer': 'Navigation',
  // P8-I-2: aria-label for the close button inside the mobile drawer.
  'nav.closeDrawer': 'Close navigation',
  'header.search.placeholder': 'Search…',

  // Brand
  'brand.name': 'Plexica',

  // Dashboard
  'dashboard.greeting': 'Welcome back, {firstName}',
  'dashboard.stats.users': 'Users',
  'dashboard.stats.workspaces': 'Workspaces',
  'dashboard.stats.plugins': 'Plugins',
  'dashboard.stats.storage': 'Storage',
  'dashboard.activity.title': 'Recent activity',
  'dashboard.activity.empty.heading': 'No activity yet',
  'dashboard.activity.empty.description': 'Actions taken in this workspace will appear here.',

  // Error boundary
  'error.boundary.heading': 'Something went wrong',
  'error.boundary.description': 'An unexpected error occurred. Please try refreshing the page.',
  'error.boundary.goToDashboard': 'Go to Dashboard',
  'error.boundary.refresh': 'Refresh page',

  // Skeleton
  'skeleton.loading': 'Loading…',

  // User menu
  'user.menu.signOut': 'Sign out',
} as const;

export type MessageKey = keyof typeof messages;
