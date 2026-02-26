// apps/web/src/routes/extensions.tsx
//
// Tenant Extensions page — allows tenant admins to enable/disable and configure
// plugins that are available to their tenant.
//
// Route: /extensions
// RBAC guard: requires user.roles.includes('tenant_admin')
// T004-32 — design-spec.md Screen 5

import { createFileRoute } from '@tanstack/react-router';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppLayout } from '../components/Layout';
import { useAuthStore } from '../stores/auth-store';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import { useMemo } from 'react';
import { Alert, AlertDescription } from '@plexica/ui';
import { Button } from '@plexica/ui';
import { Skeleton } from '@plexica/ui';
import { AlertCircle, Puzzle } from 'lucide-react';
import type { TenantPlugin } from '../types';
import { PluginToggleCard } from '../components/plugins/PluginToggleCard';
import { ForbiddenPage } from '../components/plugins/ForbiddenPage';
import { toast } from '../components/ToastProvider';

export const Route = createFileRoute('/extensions')({
  component: ExtensionsPage,
});

export { ExtensionsPage };

// ---------------------------------------------------------------------------
// Skeleton loading cards
// ---------------------------------------------------------------------------

function ExtensionsLoadingSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading extensions">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-start gap-4">
            <Skeleton className="w-12 h-12 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-full max-w-sm" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="w-10 h-6 rounded-full flex-shrink-0" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function ExtensionsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  // RBAC guard — must be a tenant_admin
  const isTenantAdmin = user?.roles?.includes('tenant_admin') ?? false;

  // Fetch tenant-active plugins
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['tenant-active-plugins'],
    queryFn: () => apiClient.getTenantActivePlugins(),
    enabled: isTenantAdmin,
  });

  const plugins: TenantPlugin[] = useMemo(() => data ?? [], [data]);

  // Toggle mutation
  const toggleMutation = useMutation({
    mutationFn: async ({ pluginId, enable }: { pluginId: string; enable: boolean }) => {
      if (enable) {
        return apiClient.enableTenantPlugin(pluginId);
      } else {
        return apiClient.disableTenantPlugin(pluginId);
      }
    },
    onMutate: async ({ pluginId, enable }) => {
      await queryClient.cancelQueries({ queryKey: ['tenant-active-plugins'] });
      const previousData = queryClient.getQueryData<TenantPlugin[]>(['tenant-active-plugins']);

      // Optimistic update
      queryClient.setQueryData<TenantPlugin[]>(['tenant-active-plugins'], (old) => {
        if (!old) return old;
        return old.map((tp) =>
          tp.plugin.id === pluginId ? { ...tp, status: enable ? 'ACTIVE' : 'INACTIVE' } : tp
        );
      });
      return { previousData };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['tenant-active-plugins'], context.previousData);
      }
      toast.error('Failed to update plugin status. Please try again.');
    },
    onSuccess: (_data, { enable, pluginId }) => {
      const name = plugins.find((p) => p.plugin.id === pluginId)?.plugin.name ?? 'Plugin';
      toast.success(`${name} ${enable ? 'enabled' : 'disabled'} successfully`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-active-plugins'] });
    },
  });

  function handleToggle(pluginId: string, enable: boolean) {
    toggleMutation.mutate({ pluginId, enable });
  }

  return (
    <ProtectedRoute>
      <AppLayout>
        {/* RBAC guard */}
        {!isTenantAdmin ? (
          <ForbiddenPage />
        ) : (
          <>
            {/* Page header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Puzzle className="w-5 h-5 text-primary" aria-hidden="true" />
                </div>
                <h1 className="text-3xl font-bold text-foreground">Extensions</h1>
              </div>
              <p className="text-muted-foreground">
                Manage plugins available to your organization. Enable or disable extensions and
                configure per-tenant settings.
              </p>
            </div>

            {/* Loading */}
            {isLoading && <ExtensionsLoadingSkeleton />}

            {/* Error */}
            {error && !isLoading && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <span>Failed to load extensions. Please try again.</span>
                  <Button variant="secondary" size="sm" onClick={() => refetch()} className="ml-4">
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Empty */}
            {!isLoading && !error && plugins.length === 0 && (
              <div className="bg-card border border-border rounded-lg p-12 text-center">
                <div className="text-6xl mb-4">🧩</div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  No extensions available
                </h2>
                <p className="text-muted-foreground max-w-sm mx-auto">
                  No extensions available. Contact your platform administrator.
                </p>
              </div>
            )}

            {/* Plugin cards */}
            {!isLoading && !error && plugins.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">
                      {plugins.filter((p) => p.status === 'ACTIVE').length}
                    </strong>{' '}
                    of <strong className="text-foreground">{plugins.length}</strong> extensions
                    enabled
                  </p>
                </div>

                <div className="space-y-4">
                  {plugins.map((tenantPlugin) => (
                    <PluginToggleCard
                      key={tenantPlugin.id}
                      tenantPlugin={tenantPlugin}
                      onToggle={handleToggle}
                      isToggling={
                        toggleMutation.isPending &&
                        (toggleMutation.variables as { pluginId: string } | undefined)?.pluginId ===
                          tenantPlugin.plugin.id
                      }
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </AppLayout>
    </ProtectedRoute>
  );
}
