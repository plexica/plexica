// sidebar-nav-item.tsx
// Navigation item for the sidebar.
// Supports expanded (icon + label) and collapsed (icon only + tooltip) modes.

import { Link } from '@tanstack/react-router';

import type { LucideIcon } from 'lucide-react';

interface SidebarNavItemProps {
  icon: LucideIcon;
  label: string;
  to: string;
  isCollapsed?: boolean;
}

export function SidebarNavItem({
  icon: Icon,
  label,
  to,
  isCollapsed = false,
}: SidebarNavItemProps): JSX.Element {
  return (
    <li>
      <Link
        to={to}
        title={isCollapsed ? label : undefined}
        aria-label={isCollapsed ? label : undefined}
        activeProps={{ 'aria-current': 'page' }}
        className={[
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
          'text-neutral-600 transition-colors',
          'hover:bg-neutral-100 hover:text-neutral-900',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
          '[&[aria-current=page]]:bg-primary-50 [&[aria-current=page]]:text-primary-700',
          isCollapsed ? 'justify-center px-2' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        {!isCollapsed && <span>{label}</span>}
      </Link>
    </li>
  );
}
