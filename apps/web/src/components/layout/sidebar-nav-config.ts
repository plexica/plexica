// sidebar-nav-config.ts
// Centralized nav item definitions for the sidebar.
// Kept separate so sidebar.tsx stays under 200 lines.

import {
  LayoutDashboard,
  FolderTree,
  Users,
  Shield,
  Settings,
  ScrollText,
  User,
} from 'lucide-react';

import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  icon: LucideIcon;
  labelId: string;
  to: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { icon: LayoutDashboard, labelId: 'nav.dashboard', to: '/dashboard' },
  { icon: FolderTree, labelId: 'nav.workspaces', to: '/workspaces' },
  { icon: Users, labelId: 'nav.users', to: '/users' },
  { icon: Shield, labelId: 'nav.roles', to: '/roles' },
  { icon: Settings, labelId: 'nav.settings', to: '/settings' },
  { icon: ScrollText, labelId: 'nav.auditLog', to: '/audit-log' },
  { icon: User, labelId: 'nav.profile', to: '/profile' },
] as const;
