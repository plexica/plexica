// messages.en.auth-nav.ts — Auth, navigation, dashboard, and layout strings.

export const messagesAuthNav = {
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
  'nav.sidebar': 'Sidebar',
  'nav.sidebarDrawer': 'Navigation',
  'nav.closeDrawer': 'Close navigation',
  'header.search.placeholder': 'Search…',
  'nav.workspaces': 'Workspaces',
  'nav.users': 'Users',
  'nav.roles': 'Roles & Permissions',
  'nav.settings': 'Settings',
  'nav.auditLog': 'Audit Log',
  'nav.profile': 'Profile',
  'nav.settings.general': 'General',
  'nav.settings.branding': 'Branding',
  'nav.settings.auth': 'Authentication',

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
