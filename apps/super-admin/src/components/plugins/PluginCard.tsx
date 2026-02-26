// apps/super-admin/src/components/plugins/PluginCard.tsx
//
// Registry plugin card for the super-admin "Registry" tab.
// Shows lifecycle status badge, tenant count, health indicator (ACTIVE only),
// and contextual action buttons per ADR-018:
//   REGISTERED  → [Install] [View]
//   INSTALLED   → [Enable]  [View]
//   ACTIVE      → [View]    [⋮ Disable / Update / Uninstall]
//   DISABLED    → [View]    [⋮ Enable  / Uninstall]
//   other       → [View]
//
// Review fixes applied:
//   HIGH #2 / LOW #13: Radix DropdownMenu replaces custom mousedown handler
//   MEDIUM #7: focus:outline-none → focus-visible:ring-2 on plugin name button
//   MEDIUM #9 / LOW #14: ActionMenu component extracts DRY dropdown rendering
//   MEDIUM #12: stub handlers show toast instead of silent console.log
//              (toast is triggered from PluginsView; PluginCard receives callbacks)

import React from 'react';
import { Building2, Heart, MoreHorizontal } from 'lucide-react';
import { Card, Button } from '@plexica/ui';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@plexica/ui';
import { PluginStatusBadge } from './PluginStatusBadge';
import type { Plugin } from '@/types';

export interface PluginCardProps {
  plugin: Plugin;
  onView: (plugin: Plugin) => void;
  onInstall: (plugin: Plugin) => void;
  onEnable: (plugin: Plugin) => void;
  onDisable: (plugin: Plugin) => void;
  onUpdate: (plugin: Plugin) => void;
  onUninstall: (plugin: Plugin) => void;
}

// ---------------------------------------------------------------------------
// ActionMenu — Radix-powered keyboard-navigable dropdown (HIGH #2 / LOW #13)
// Handles: focus on open, Arrow keys, Enter/Space activation, Escape to close
// ---------------------------------------------------------------------------

interface ActionItem {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'destructive';
  separator?: boolean; // true = show separator BEFORE this item
}

interface ActionMenuProps {
  items: ActionItem[];
}

function ActionMenu({ items }: ActionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="More actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {items.map((item, idx) => (
          <React.Fragment key={idx}>
            {item.separator && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onClick={item.onClick}
              className={
                item.variant === 'destructive' ? 'text-destructive focus:text-destructive' : ''
              }
            >
              {item.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// PluginCard
// ---------------------------------------------------------------------------

export function PluginCard({
  plugin,
  onView,
  onInstall,
  onEnable,
  onDisable,
  onUpdate,
  onUninstall,
}: PluginCardProps) {
  const ls = plugin.lifecycleStatus ?? 'REGISTERED';

  // Primary action button — varies by lifecycle status
  const renderPrimaryButton = () => {
    if (ls === 'REGISTERED') {
      return (
        <Button size="sm" className="flex-1" onClick={() => onInstall(plugin)}>
          Install
        </Button>
      );
    }
    if (ls === 'INSTALLED') {
      return (
        <Button size="sm" className="flex-1" onClick={() => onEnable(plugin)}>
          Enable
        </Button>
      );
    }
    // ACTIVE, DISABLED, INSTALLING, UNINSTALLING, UNINSTALLED → View
    return (
      <Button variant="outline" size="sm" className="flex-1" onClick={() => onView(plugin)}>
        View
      </Button>
    );
  };

  // Secondary action — View button (REGISTERED/INSTALLED both need it — DRY fix MEDIUM #9)
  // or ActionMenu (ACTIVE/DISABLED).
  const renderSecondaryAction = () => {
    if (ls === 'REGISTERED' || ls === 'INSTALLED') {
      return (
        <Button variant="outline" size="sm" className="flex-1" onClick={() => onView(plugin)}>
          View
        </Button>
      );
    }
    if (ls === 'ACTIVE') {
      return (
        <ActionMenu
          items={[
            { label: 'Disable', onClick: () => onDisable(plugin) },
            { label: 'Update', onClick: () => onUpdate(plugin) },
            {
              label: 'Uninstall',
              onClick: () => onUninstall(plugin),
              variant: 'destructive',
              separator: true,
            },
          ]}
        />
      );
    }
    if (ls === 'DISABLED') {
      return (
        <ActionMenu
          items={[
            { label: 'Enable', onClick: () => onEnable(plugin) },
            {
              label: 'Uninstall',
              onClick: () => onUninstall(plugin),
              variant: 'destructive',
              separator: true,
            },
          ]}
        />
      );
    }
    // INSTALLING, UNINSTALLING, UNINSTALLED — no secondary action
    return null;
  };

  return (
    <Card
      className="p-5 flex flex-col"
      role="article"
      aria-label={`${plugin.name}, version ${plugin.version}, status ${ls}`}
    >
      {/* Header: icon + status badge */}
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-xl shrink-0">
          {plugin.icon || '🧩'}
        </div>
        <PluginStatusBadge status={ls} />
      </div>

      {/* Name — MEDIUM #7: use focus-visible ring instead of bare focus:outline-none */}
      <button
        className="text-left text-base font-semibold text-foreground hover:text-primary transition-colors mb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
        onClick={() => onView(plugin)}
      >
        {plugin.name}
      </button>

      {/* Version + category */}
      <p className="text-xs text-muted-foreground mb-1">
        v{plugin.version} · {plugin.category}
      </p>

      {/* Description */}
      <p className="text-sm text-muted-foreground line-clamp-2 mb-3 flex-grow">
        {plugin.description}
      </p>

      {/* Tenant count + health (ACTIVE only) */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
        {plugin.tenantCount !== undefined && (
          <span className="flex items-center gap-1">
            <Building2 className="h-3 w-3" />
            {plugin.tenantCount} {plugin.tenantCount === 1 ? 'tenant' : 'tenants'}
          </span>
        )}
        {ls === 'ACTIVE' && (
          <span className="flex items-center gap-1 text-green-600">
            <Heart className="h-3 w-3 fill-current" />
            Healthy
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {renderPrimaryButton()}
        {renderSecondaryAction()}
      </div>
    </Card>
  );
}
