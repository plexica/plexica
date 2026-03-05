// File: apps/super-admin/src/routes/_layout/plugins/index.tsx
//
// T008-46 — Super Admin Plugin List screen.
//
// Parent _layout.tsx handles auth/sidebar/header — no ProtectedRoute
// or AppLayout wrapper needed here.
//
// Features:
//  - Grid of plugin cards with name, version, status badge, description
//  - Status badge colors: ACTIVE → green, INSTALLED → blue,
//                          DISABLED → zinc, UNINSTALLED → red
//  - Each card: "Configure" button + Enable / Disable toggle
//  - Client-side search by plugin name
//  - Loading skeletons (6 cards)
//  - Error banner with retry

import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Search, Settings, Power, AlertCircle, RefreshCw } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from '@plexica/ui';
import { toast } from 'sonner';
import { useAdminPlugins, type AdminPlugin } from '@/hooks/useAdminPlugins';

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------
export const Route = createFileRoute('/_layout/plugins/' as never)({
  component: PluginsPage,
});

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------
function statusBadgeClass(status: AdminPlugin['status']): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'INSTALLED':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'DISABLED':
      return 'bg-zinc-100 text-zinc-700 border-zinc-200';
    case 'UNINSTALLED':
      return 'bg-red-100 text-red-800 border-red-200';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function PluginCardSkeleton() {
  return (
    <Card aria-hidden="true">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <Skeleton width="60%" height={20} shape="line" />
          <Skeleton width={72} height={22} shape="rect" />
        </div>
        <Skeleton width="30%" height={14} shape="line" className="mt-1" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton width="100%" height={14} shape="line" />
        <Skeleton width="80%" height={14} shape="line" />
        <div className="flex gap-2 pt-1">
          <Skeleton width="50%" height={32} shape="rect" />
          <Skeleton width="50%" height={32} shape="rect" />
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Plugin card
// ---------------------------------------------------------------------------
interface PluginCardProps {
  plugin: AdminPlugin;
  onConfigure: (id: string) => void;
  onToggle: (plugin: AdminPlugin) => void;
  isToggling: boolean;
}

function PluginCard({ plugin, onConfigure, onToggle, isToggling }: PluginCardProps) {
  const canToggle =
    plugin.status === 'INSTALLED' || plugin.status === 'ACTIVE' || plugin.status === 'DISABLED';
  const isActive = plugin.status === 'ACTIVE';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{plugin.name}</CardTitle>
          <span
            className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${statusBadgeClass(plugin.status)}`}
          >
            {plugin.status}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">v{plugin.version}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {plugin.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{plugin.description}</p>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onConfigure(plugin.id)}
          >
            <Settings className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
            Configure
          </Button>
          {canToggle && (
            <Button
              variant={isActive ? 'danger' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => onToggle(plugin)}
              disabled={isToggling}
              aria-label={isActive ? `Disable ${plugin.name}` : `Enable ${plugin.name}`}
            >
              <Power className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              {isToggling ? '…' : isActive ? 'Disable' : 'Enable'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
function PluginsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { plugins, isLoading, isError, error, refetch, enablePlugin, disablePlugin } =
    useAdminPlugins();

  // Client-side filter by name
  const filtered = plugins.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  const handleConfigure = (id: string) => {
    // params cast needed until routeTree.gen.ts is regenerated
    void (navigate as (opts: unknown) => void)({
      to: '/_layout/plugins/$pluginId/config',
      params: { pluginId: id },
    });
  };

  const handleToggle = (plugin: AdminPlugin) => {
    setTogglingId(plugin.id);
    const isActive = plugin.status === 'ACTIVE';

    if (isActive) {
      disablePlugin(plugin.id, {
        onSuccess: () => {
          toast.success(`${plugin.name} disabled`);
          setTogglingId(null);
        },
        onError: (err: Error) => {
          toast.error(`Failed to disable ${plugin.name}: ${err.message}`);
          setTogglingId(null);
        },
      });
    } else {
      enablePlugin(plugin.id, {
        onSuccess: () => {
          toast.success(`${plugin.name} enabled`);
          setTogglingId(null);
        },
        onError: (err: Error) => {
          toast.error(`Failed to enable ${plugin.name}: ${err.message}`);
          setTogglingId(null);
        },
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Plugins</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage installed plugins across the platform
        </p>
      </div>

      {/* Error banner */}
      {isError && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <span className="flex-1 text-sm">
            {error instanceof Error ? error.message : 'Failed to load plugins.'}
          </span>
          <button
            type="button"
            onClick={() => void refetch()}
            className="flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium hover:bg-red-100 transition-colors"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {/* Search */}
      {!isError && (
        <div className="relative max-w-sm">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search plugins…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            aria-label="Search plugins by name"
          />
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {isLoading ? (
          <>
            {Array.from({ length: 6 }).map((_, i) => (
              <PluginCardSkeleton key={i} />
            ))}
          </>
        ) : (
          <>
            {filtered.map((plugin) => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                onConfigure={handleConfigure}
                onToggle={handleToggle}
                isToggling={togglingId === plugin.id}
              />
            ))}
            {!isError && filtered.length === 0 && (
              <div className="col-span-full py-16 text-center text-muted-foreground">
                {search ? `No plugins matching "${search}"` : 'No plugins installed.'}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
