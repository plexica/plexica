// router-shell-routes.tsx
// All authenticated shell child routes.
// Imported by router.tsx and added to shellRoute.addChildren([...]).

import { createRoute } from '@tanstack/react-router';

import { shellRoute } from './router-shell.js';
import { DashboardPage } from './pages/dashboard-page.js';
import { WorkspaceListPage } from './pages/workspace-list-page.js';
import { WorkspaceDetailPage } from './pages/workspace-detail-page.js';
import { WorkspaceSettingsPage } from './pages/workspace-settings-page.js';
import { WorkspaceMembersPage } from './pages/workspace-members-page.js';
import { WorkspaceTemplatesPage } from './pages/workspace-templates-page.js';
import { UserListPage } from './pages/user-list-page.js';
import { RoleManagementPage } from './pages/role-management-page.js';
import { PermissionAssociationPage } from './pages/permission-association-page.js';
import { TenantSettingsPage } from './pages/tenant-settings-page.js';
import { TenantBrandingPage } from './pages/tenant-branding-page.js';
import { TenantAuthConfigPage } from './pages/tenant-auth-config-page.js';
import { ProfilePage } from './pages/profile-page.js';
import { AuditLogPage } from './pages/audit-log-page.js';

export const dashboardRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/dashboard',
  component: DashboardPage,
});

export const workspaceListRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/workspaces',
  component: WorkspaceListPage,
});

export const workspaceDetailRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/workspaces/$workspaceId',
  component: WorkspaceDetailPage,
});

export const workspaceSettingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/workspaces/$workspaceId/settings',
  component: WorkspaceSettingsPage,
});

export const workspaceMembersRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/workspaces/$workspaceId/members',
  component: WorkspaceMembersPage,
});

export const workspaceTemplatesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/workspaces/templates',
  component: WorkspaceTemplatesPage,
});

export const userListRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/users',
  component: UserListPage,
});

export const roleManagementRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/roles',
  component: RoleManagementPage,
});

export const permissionAssociationRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/roles/$roleId/permissions',
  component: PermissionAssociationPage,
});

export const tenantSettingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings',
  component: TenantSettingsPage,
});

export const tenantBrandingRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/branding',
  component: TenantBrandingPage,
});

export const tenantAuthConfigRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings/auth',
  component: TenantAuthConfigPage,
});

export const profileRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/profile',
  component: ProfilePage,
});

export const auditLogRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/audit-log',
  component: AuditLogPage,
});

export const shellChildRoutes = [
  dashboardRoute,
  workspaceListRoute,
  workspaceDetailRoute,
  workspaceSettingsRoute,
  workspaceMembersRoute,
  workspaceTemplatesRoute,
  userListRoute,
  roleManagementRoute,
  permissionAssociationRoute,
  tenantSettingsRoute,
  tenantBrandingRoute,
  tenantAuthConfigRoute,
  profileRoute,
  auditLogRoute,
];
