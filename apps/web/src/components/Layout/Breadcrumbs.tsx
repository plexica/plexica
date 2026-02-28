// apps/web/src/components/Layout/Breadcrumbs.tsx
//
// T005-02: Auto-generated breadcrumb trail from the current URL path.
// Resolves plugin route segments to their display names via PluginContext.
// FR-006, NFR-004

import React from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { usePlugins } from '../../contexts/PluginContext';

// ---------------------------------------------------------------------------
// Static label map for known core routes
// ---------------------------------------------------------------------------
const STATIC_LABELS: Record<string, string> = {
  '': 'Home',
  settings: 'Settings',
  admin: 'Admin',
  profile: 'Profile',
  team: 'Team',
  plugins: 'Plugins',
  help: 'Help',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface BreadcrumbsProps {
  /**
   * Optional label overrides keyed by URL segment (e.g. `{ 'contacts': 'All Contacts' }`).
   * When a segment matches a key, the override label is used instead of auto-generated one.
   */
  overrides?: Record<string, string>;
}

interface BreadcrumbItem {
  label: string;
  href: string;
}

// ---------------------------------------------------------------------------
// Breadcrumbs
// ---------------------------------------------------------------------------
export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ overrides = {} }) => {
  const location = useLocation();
  const { plugins } = usePlugins();

  // Build segment → display label map from loaded plugins
  const pluginLabelMap: Record<string, string> = {};
  plugins.forEach((p) => {
    // Plugin route prefix is typically `/${manifest.id}` or from manifest routes
    const id = p.manifest.id;
    const displayName = p.manifest.name ?? id;
    pluginLabelMap[id] = displayName;
  });

  // Split path into segments (filter empty strings)
  const segments = location.pathname.split('/').filter(Boolean);

  // Build breadcrumb items: always start with Home
  const items: BreadcrumbItem[] = [{ label: 'Home', href: '/' }];

  let cumulativePath = '';
  for (const segment of segments) {
    cumulativePath += `/${segment}`;

    // Resolve label: overrides → plugin map → static labels → capitalised segment
    let label: string;
    if (overrides[segment]) {
      label = overrides[segment];
    } else if (pluginLabelMap[segment]) {
      label = pluginLabelMap[segment];
    } else if (STATIC_LABELS[segment]) {
      label = STATIC_LABELS[segment];
    } else {
      // Capitalise first letter and replace hyphens with spaces
      label = segment.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
    }

    items.push({ label, href: cumulativePath });
  }

  // Only render if there is more than just "Home"
  if (items.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="px-6 py-2">
      <ol className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={item.href} className="flex items-center gap-1">
              {isLast ? (
                <span aria-current="page" className="text-foreground font-medium">
                  {item.label}
                </span>
              ) : (
                <>
                  <Link to={item.href} className="hover:text-foreground transition-colors">
                    {item.label}
                  </Link>
                  <span aria-hidden="true" className="text-muted-foreground/50">
                    /
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
