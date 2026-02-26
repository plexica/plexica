// apps/web/src/components/plugins/PluginDetailModal.tsx
//
// Large modal (max-width 800px) showing comprehensive plugin detail for super admins.
// Displays:
//   - Header: plugin name, icon, lifecycle status badge
//   - Lifecycle timeline (vertical, most recent first)
//   - 4 tabs (Overview, Health, Permissions, Events) — full ARIA tablist pattern
//   - Tenant adoption list
//
// T004-31 — design-spec.md Screen 4

import { useState, useId } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@plexica/ui';
import { Badge } from '@plexica/ui';
import { Button } from '@plexica/ui';
import { X } from 'lucide-react';
import type { PluginDetail, PluginLifecycleStatus } from '@plexica/types';
import { PluginTimeline, type TimelineEntry } from './PluginTimeline';
import { PluginHealthTab } from './PluginHealthTab';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TenantAdoptionEntry {
  tenantId: string;
  tenantName: string;
  enabledAt: string;
  isConfigured: boolean;
}

export interface PluginPermission {
  key: string;
  name: string;
  description: string;
}

export interface PluginEvent {
  topic: string;
  direction: 'publishes' | 'subscribes';
  lastActivity?: string;
}

export interface PluginDetailModalProps {
  /** The plugin to display. Pass null / undefined to keep closed. */
  plugin: PluginDetail | null;
  /** Lifecycle timeline entries (from lifecycle_events table) */
  timelineEntries?: TimelineEntry[];
  /** Tenant adoption list */
  tenantAdoptions?: TenantAdoptionEntry[];
  /** Permissions declared in the plugin manifest */
  permissions?: PluginPermission[];
  /** Events published/subscribed by the plugin */
  events?: PluginEvent[];
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Status → badge variant mapping
// ---------------------------------------------------------------------------

type BadgeVariant = 'default' | 'secondary' | 'danger' | 'outline';

const LIFECYCLE_BADGE: Record<PluginLifecycleStatus, BadgeVariant> = {
  REGISTERED: 'secondary',
  INSTALLING: 'secondary',
  INSTALLED: 'outline',
  ACTIVE: 'default',
  DISABLED: 'secondary',
  UNINSTALLING: 'secondary',
  UNINSTALLED: 'danger',
};

const LIFECYCLE_LABEL: Record<PluginLifecycleStatus, string> = {
  REGISTERED: 'Registered',
  INSTALLING: 'Installing',
  INSTALLED: 'Installed',
  ACTIVE: 'Active',
  DISABLED: 'Disabled',
  UNINSTALLING: 'Uninstalling',
  UNINSTALLED: 'Uninstalled',
};

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type TabId = 'overview' | 'health' | 'permissions' | 'events';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'health', label: 'Health' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'events', label: 'Events' },
];

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({ plugin }: { plugin: PluginDetail }) {
  const manifest = plugin.manifest ?? {};
  const deps = (manifest.dependencies as Record<string, string> | undefined) ?? {};
  const runtime = manifest.runtime as Record<string, unknown> | undefined;

  return (
    <div className="space-y-6">
      {/* Manifest fields */}
      <section>
        <h4 className="text-sm font-semibold text-foreground mb-3">Plugin Details</h4>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Name</dt>
          <dd className="font-medium">{plugin.name}</dd>
          <dt className="text-muted-foreground">Version</dt>
          <dd className="font-mono">{plugin.version}</dd>
          <dt className="text-muted-foreground">Author</dt>
          <dd>{plugin.author}</dd>
          <dt className="text-muted-foreground">Category</dt>
          <dd>
            <Badge variant="secondary" className="text-xs">
              {plugin.category}
            </Badge>
          </dd>
          {plugin.homepage && (
            <>
              <dt className="text-muted-foreground">Homepage</dt>
              <dd>
                <a
                  href={plugin.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:no-underline"
                >
                  {plugin.homepage}
                </a>
              </dd>
            </>
          )}
        </dl>
        {plugin.description && (
          <p className="mt-3 text-sm text-muted-foreground">{plugin.description}</p>
        )}
      </section>

      {/* Dependencies */}
      {Object.keys(deps).length > 0 && (
        <section>
          <h4 className="text-sm font-semibold text-foreground mb-3">Dependencies</h4>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Package</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Version</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(deps).map(([pkg, ver]) => (
                  <tr key={pkg} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">{pkg}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{ver}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Runtime config */}
      {runtime && (
        <section>
          <h4 className="text-sm font-semibold text-foreground mb-3">Runtime Configuration</h4>
          <div className="bg-muted/50 rounded-lg p-4">
            <pre className="text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(runtime, null, 2)}
            </pre>
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Permissions tab
// ---------------------------------------------------------------------------

function PermissionsTab({ permissions }: { permissions: PluginPermission[] }) {
  if (permissions.length === 0) {
    return <p className="text-sm text-muted-foreground">No permissions declared.</p>;
  }
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Key</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Name</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Description</th>
          </tr>
        </thead>
        <tbody>
          {permissions.map((p) => (
            <tr key={p.key} className="border-t border-border">
              <td className="px-3 py-2 font-mono text-xs">{p.key}</td>
              <td className="px-3 py-2 font-medium">{p.name}</td>
              <td className="px-3 py-2 text-muted-foreground">{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Events tab
// ---------------------------------------------------------------------------

function EventList({ list }: { list: PluginEvent[] }) {
  if (list.length === 0) return <p className="text-xs text-muted-foreground">None</p>;
  return (
    <ul className="space-y-2">
      {list.map((e) => (
        <li
          key={e.topic}
          className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-2"
        >
          <code className="font-mono text-xs">{e.topic}</code>
          {e.lastActivity && (
            <span className="text-xs text-muted-foreground">
              Last: {new Date(e.lastActivity).toLocaleString()}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function EventsTab({ events }: { events: PluginEvent[] }) {
  const publishes = events.filter((e) => e.direction === 'publishes');
  const subscribes = events.filter((e) => e.direction === 'subscribes');

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No events declared.</p>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-sm font-semibold mb-2">Publishes</h4>
        <EventList list={publishes} />
      </div>
      <div>
        <h4 className="text-sm font-semibold mb-2">Subscribes</h4>
        <EventList list={subscribes} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tenant adoption table
// ---------------------------------------------------------------------------

function TenantAdoptionTable({ entries }: { entries: TenantAdoptionEntry[] }) {
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sorted = [...entries].sort((a, b) => {
    const cmp = a.tenantName.localeCompare(b.tenantName);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No tenants have enabled this plugin.</p>;
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">
              <button
                className="flex items-center gap-1 hover:text-foreground transition-colors"
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                aria-label={`Sort by tenant name ${sortDir === 'asc' ? 'descending' : 'ascending'}`}
              >
                Tenant {sortDir === 'asc' ? '↑' : '↓'}
              </button>
            </th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Enabled At</th>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground">Configured</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => (
            <tr key={e.tenantId} className="border-t border-border">
              <td className="px-3 py-2 font-medium">{e.tenantName}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {new Date(e.enabledAt).toLocaleDateString()}
              </td>
              <td className="px-3 py-2">
                <Badge variant={e.isConfigured ? 'default' : 'secondary'} className="text-xs">
                  {e.isConfigured ? 'Yes' : 'No'}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export function PluginDetailModal({
  plugin,
  timelineEntries = [],
  tenantAdoptions = [],
  permissions = [],
  events = [],
  onClose,
}: PluginDetailModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const uid = useId();

  const tabId = (tab: TabId) => `${uid}-tab-${tab}`;
  const panelId = (tab: TabId) => `${uid}-panel-${tab}`;

  if (!plugin) return null;

  function handleKeyDown(e: React.KeyboardEvent, currentIndex: number) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = (currentIndex + 1) % TABS.length;
      setActiveTab(TABS[next].id);
      document.getElementById(tabId(TABS[next].id))?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = (currentIndex - 1 + TABS.length) % TABS.length;
      setActiveTab(TABS[prev].id);
      document.getElementById(tabId(TABS[prev].id))?.focus();
    }
  }

  return (
    <Dialog
      open={!!plugin}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-w-[800px] w-full max-h-[90vh] overflow-y-auto p-0"
        aria-label={`Plugin details: ${plugin.name}`}
      >
        {/* ------------------------------------------------------------------ */}
        {/* Header                                                              */}
        {/* ------------------------------------------------------------------ */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-2xl" aria-hidden="true">
                  {plugin.icon ?? '🧩'}
                </span>
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-foreground leading-tight">
                  {plugin.name}
                </DialogTitle>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-muted-foreground">v{plugin.version}</span>
                  <Badge variant={LIFECYCLE_BADGE[plugin.lifecycleStatus]}>
                    {LIFECYCLE_LABEL[plugin.lifecycleStatus]}
                  </Badge>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              aria-label="Close plugin details"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        {/* ------------------------------------------------------------------ */}
        {/* Body                                                                */}
        {/* ------------------------------------------------------------------ */}
        <div className="grid grid-cols-[200px_1fr] min-h-0">
          {/* Sidebar: Lifecycle Timeline */}
          <aside className="border-r border-border px-4 py-6 bg-muted/20">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Timeline
            </h3>
            <PluginTimeline entries={timelineEntries} currentStatus={plugin.lifecycleStatus} />
          </aside>

          {/* Main content area */}
          <div className="flex flex-col">
            {/* Tab bar */}
            <div
              role="tablist"
              aria-label="Plugin detail tabs"
              className="flex border-b border-border px-4"
            >
              {TABS.map((tab, idx) => (
                <button
                  key={tab.id}
                  id={tabId(tab.id)}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={panelId(tab.id)}
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(e) => handleKeyDown(e, idx)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${
                    activeTab === tab.id
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab panels */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
              {TABS.map((tab) => (
                <div
                  key={tab.id}
                  id={panelId(tab.id)}
                  role="tabpanel"
                  aria-labelledby={tabId(tab.id)}
                  hidden={activeTab !== tab.id}
                  tabIndex={0}
                  className="outline-none"
                >
                  {activeTab === tab.id && (
                    <>
                      {tab.id === 'overview' && <OverviewTab plugin={plugin} />}
                      {tab.id === 'health' && <PluginHealthTab pluginId={plugin.id} />}
                      {tab.id === 'permissions' && <PermissionsTab permissions={permissions} />}
                      {tab.id === 'events' && <EventsTab events={events} />}
                    </>
                  )}
                </div>
              ))}

              {/* Tenant adoption (below tabs, always visible) */}
              {activeTab === 'overview' && (
                <div className="mt-8 pt-6 border-t border-border">
                  <h3 className="text-sm font-semibold mb-4">
                    Tenant Adoption
                    {tenantAdoptions.length > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground font-normal">
                        ({tenantAdoptions.length} tenants)
                      </span>
                    )}
                  </h3>
                  <TenantAdoptionTable entries={tenantAdoptions} />
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
