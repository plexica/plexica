// File: apps/web/src/routes/admin.plugins.tsx
//
// T008-55 — Tenant Admin Plugin Settings screen.
// Lists plugins installed in the tenant; shows status and config link.
// Spec 008 Admin Interfaces — Tenant Admin Phase 7

import { createFileRoute } from '@tanstack/react-router';
import { Puzzle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@plexica/ui';

export const Route = createFileRoute('/admin/plugins' as never)({
  component: TenantAdminPluginsPage,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InstalledPlugin {
  id: string;
  name: string;
  description?: string;
  version: string;
  status: 'active' | 'inactive' | 'error';
  installedAt: string;
}

interface InstalledPluginsResult {
  data: InstalledPlugin[];
}

// ---------------------------------------------------------------------------
// Data hook
// ---------------------------------------------------------------------------

function useInstalledPlugins() {
  return useQuery<InstalledPluginsResult>({
    queryKey: ['tenant-admin', 'plugins', 'installed'],
    queryFn: async () => {
      // Tenant plugin listing is served by the existing plugin API under /api/v1/plugins.
      // We cast through the raw client to avoid import cycles with admin.ts.
      const { adminApiClient } = await import('@/lib/api-client');
      type RawClient = { get: <T>(url: string) => Promise<T> };
      const client = adminApiClient as unknown as RawClient;
      return client.get<InstalledPluginsResult>('/api/v1/plugins?scope=tenant&limit=100');
    },
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function PluginStatusBadge({ status }: { status: InstalledPlugin['status'] }) {
  const map: Record<
    InstalledPlugin['status'],
    { label: string; variant: 'default' | 'secondary' | 'danger' }
  > = {
    active: { label: 'Active', variant: 'default' },
    inactive: { label: 'Inactive', variant: 'secondary' },
    error: { label: 'Error', variant: 'danger' },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function TenantAdminPluginsPage() {
  const { data, isLoading, error } = useInstalledPlugins();
  const plugins = data?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Plugin Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage plugins available to your tenant
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
        >
          Failed to load plugins. Please refresh.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isLoading ? 'Plugins' : `${plugins.length} plugin${plugins.length !== 1 ? 's' : ''}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-4 py-4 flex items-center gap-4">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>
          ) : plugins.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
              <Puzzle className="h-10 w-10" aria-hidden="true" />
              <p className="text-sm">No plugins installed in this tenant.</p>
            </div>
          ) : (
            <div className="divide-y" role="list" aria-label="Installed plugins">
              {plugins.map((plugin) => (
                <div
                  key={plugin.id}
                  role="listitem"
                  className="px-4 py-4 flex items-center gap-4 hover:bg-muted/20 transition-colors"
                >
                  <div
                    className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0"
                    aria-hidden="true"
                  >
                    <Puzzle className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground text-sm">{plugin.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        v{plugin.version}
                      </span>
                    </div>
                    {plugin.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {plugin.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <PluginStatusBadge status={plugin.status} />
                    <span className="text-xs text-muted-foreground hidden sm:block">
                      Installed {new Date(plugin.installedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
