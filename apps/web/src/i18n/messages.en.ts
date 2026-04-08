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

  // Navigation additions
  'nav.workspaces': 'Workspaces',
  'nav.users': 'Users',
  'nav.roles': 'Roles & Permissions',
  'nav.settings': 'Settings',
  'nav.auditLog': 'Audit Log',
  'nav.profile': 'Profile',
  'nav.settings.general': 'General',
  'nav.settings.branding': 'Branding',
  'nav.settings.auth': 'Authentication',

  // Workspace
  'workspace.list.title': 'Workspaces',
  'workspace.list.empty': 'No workspaces yet',
  'workspace.create.title': 'Create Workspace',
  'workspace.create.name.label': 'Name',
  'workspace.create.description.label': 'Description',
  'workspace.create.parent.label': 'Parent workspace',
  'workspace.create.template.label': 'Template',
  'workspace.create.submit': 'Create',
  'workspace.edit.title': 'Edit Workspace',
  'workspace.edit.submit': 'Save changes',
  'workspace.delete.confirm.title': 'Archive workspace',
  'workspace.delete.confirm.description':
    'This will archive the workspace and all its children. They can be restored within 30 days.',
  'workspace.restore.confirm.title': 'Restore workspace',
  'workspace.restore.confirm.description': 'This will restore the workspace and its children.',
  'workspace.status.active': 'Active',
  'workspace.status.archived': 'Archived',
  'workspace.detail.members': 'Members',
  'workspace.detail.children': 'Sub-workspaces',
  'workspace.reparent.label': 'Move to',

  // Members
  'members.title': 'Members',
  'members.add': 'Add member',
  'members.invite': 'Invite by email',
  'members.remove.confirm.title': 'Remove member',
  'members.remove.confirm.description': 'This member will lose access to this workspace.',
  'members.role.admin': 'Admin',
  'members.role.member': 'Member',
  'members.role.viewer': 'Viewer',
  'members.invitation.pending': 'Invitation pending',
  'members.invitation.resend': 'Resend',

  // Users
  'users.title': 'Users',
  'users.search.placeholder': 'Search users\u2026',
  'users.remove.title': 'Remove user',
  'users.remove.description': 'This user will be removed from the tenant.',
  'users.remove.reassign.label': 'Reassign content to',

  // Roles
  'roles.title': 'Roles & Permissions',
  'roles.matrix.title': 'Permission Matrix',
  'roles.export.csv': 'Export CSV',

  // Settings
  'settings.general.title': 'General Settings',
  'settings.general.displayName.label': 'Organization name',
  'settings.general.slug.label': 'Organization slug',
  'settings.general.slug.tooltip': 'The slug cannot be changed after creation.',
  'settings.general.save': 'Save',
  'settings.branding.title': 'Branding',
  'settings.branding.logo.label': 'Logo',
  'settings.branding.primaryColor.label': 'Primary color',
  'settings.branding.darkMode.label': 'Dark mode',
  'settings.branding.save': 'Save',
  'settings.auth.title': 'Authentication',
  'settings.auth.mfa.label': 'Require MFA',
  'settings.auth.sessionMaxSecs.label': 'Session duration (seconds)',
  'settings.auth.save': 'Save',

  // Profile
  'profile.title': 'Profile',
  'profile.displayName.label': 'Display name',
  'profile.timezone.label': 'Timezone',
  'profile.language.label': 'Language',
  'profile.avatar.label': 'Avatar',
  'profile.save': 'Save',

  // Audit log
  'auditLog.title': 'Audit Log',
  'auditLog.filter.actor': 'Actor',
  'auditLog.filter.action': 'Action type',
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
  'common.loading': 'Loading\u2026',
  'common.error': 'An error occurred.',
  'common.noData': 'No data.',
  'common.search': 'Search',
  'common.filter': 'Filter',
  'common.page': 'Page {page} of {total}',
  'common.prevPage': 'Previous page',
  'common.nextPage': 'Next page',
} as const;

export type MessageKey = keyof typeof messages;
