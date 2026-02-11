// apps/web/src/routes/plugins.$pluginId.tsx
//
// Dynamic catch-all route for rendering plugin pages.
// Uses TanStack Router flat-route convention (plugins.$pluginId)
// to create /plugins/$pluginId.
//
// Flow:
// 1. Extract pluginId from URL params
// 2. Look up loaded plugin in PluginContext
// 3. Find matching route via pluginRouteManager
// 4. Render the plugin component with PluginProps (tenantId, userId, workspaceId)
// 5. Handle loading / not-found / error states

import { createFileRoute, Link, useParams } from '@tanstack/react-router';
import { Suspense, useMemo, useState, useEffect, type ComponentType } from 'react';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppLayout } from '../components/Layout';
import { useAuthStore } from '../stores/auth-store';
import { usePlugins } from '../contexts/PluginContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { pluginRouteManager } from '../lib/plugin-routes';
import { pluginLoader } from '../lib/plugin-loader';
import { Button } from '@plexica/ui';
import { Alert, AlertDescription } from '@plexica/ui';
import { AlertCircle, ArrowLeft, Puzzle } from 'lucide-react';

export const Route = createFileRoute('/plugins/$pluginId')({
  component: PluginPageWrapper,
});

/** Props passed down to every plugin component */
interface PluginProps {
  tenantId: string;
  userId: string;
  workspaceId: string | null;
  pluginId: string;
}

function PluginPageWrapper() {
  return (
    <ProtectedRoute>
      <AppLayout>
        <PluginPage />
      </AppLayout>
    </ProtectedRoute>
  );
}

function PluginPage() {
  const { pluginId } = useParams({ from: '/plugins/$pluginId' });
  const { plugins, isLoading: pluginsLoading } = usePlugins();
  const { tenant, user } = useAuthStore();
  const { currentWorkspace } = useWorkspace();

  const [PluginComponent, setPluginComponent] = useState<ComponentType<any> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isResolvingComponent, setIsResolvingComponent] = useState(true);

  // Find the loaded plugin matching this pluginId
  const loadedPlugin = useMemo(() => {
    return plugins.find((p) => p.manifest.id === pluginId);
  }, [plugins, pluginId]);

  // Check if the plugin has a load error tracked by the loader
  const pluginLoadError = useMemo(() => {
    return pluginLoader.getPluginError(pluginId);
  }, [pluginId]);

  // Resolve the component to render
  useEffect(() => {
    if (pluginsLoading) {
      return;
    }

    setIsResolvingComponent(true);
    setLoadError(null);
    setPluginComponent(null);

    if (!loadedPlugin) {
      setIsResolvingComponent(false);
      return;
    }

    // Try to find a registered route for this plugin
    const pluginRoutes = pluginRouteManager.getPluginRoutes(pluginId);

    if (pluginRoutes.length > 0) {
      // Use the first route's component (typically the "home" page of the plugin)
      const primaryRoute = pluginRoutes[0];

      pluginRouteManager
        .getRouteComponent(primaryRoute)
        .then((Component) => {
          setPluginComponent(() => Component);
          setIsResolvingComponent(false);
        })
        .catch((err: Error) => {
          console.error(`[PluginPage] Failed to resolve component for ${pluginId}:`, err);
          setLoadError(err.message || 'Failed to load plugin component');
          setIsResolvingComponent(false);
        });
    } else {
      // No registered routes — try the plugin's default export
      const mod = loadedPlugin.module;
      if (mod?.default) {
        setPluginComponent(() => mod.default);
        setIsResolvingComponent(false);
      } else {
        setLoadError(
          `Plugin "${loadedPlugin.manifest.name}" has no registered routes or default component.`
        );
        setIsResolvingComponent(false);
      }
    }
  }, [pluginsLoading, loadedPlugin, pluginId]);

  // Build the props we pass to every plugin component
  const pluginProps: PluginProps = {
    tenantId: tenant?.id ?? '',
    userId: user?.id ?? '',
    workspaceId: currentWorkspace?.id ?? null,
    pluginId,
  };

  // --- Render states ---

  // 1. Plugins still loading
  if (pluginsLoading || isResolvingComponent) {
    return <PluginLoadingSkeleton />;
  }

  // 2. Plugin failed to load (tracked by pluginLoader)
  if (pluginLoadError) {
    return (
      <PluginErrorState
        pluginId={pluginId}
        message={`Plugin failed to load: ${pluginLoadError.error.message}`}
      />
    );
  }

  // 3. Plugin not found in loaded plugins
  if (!loadedPlugin) {
    return <PluginNotFoundState pluginId={pluginId} />;
  }

  // 4. Component resolution error
  if (loadError) {
    return <PluginErrorState pluginId={pluginId} message={loadError} />;
  }

  // 5. Component resolved — render it
  if (PluginComponent) {
    return (
      <div className="h-full">
        <Suspense fallback={<PluginLoadingSkeleton />}>
          <PluginComponent {...pluginProps} />
        </Suspense>
      </div>
    );
  }

  // Fallback (should not reach here)
  return <PluginNotFoundState pluginId={pluginId} />;
}

// ---------------------------------------------------------------------------
// Supporting UI components
// ---------------------------------------------------------------------------

function PluginLoadingSkeleton() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center">
        <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4" />
        <p className="text-muted-foreground">Loading plugin...</p>
      </div>
    </div>
  );
}

function PluginNotFoundState({ pluginId }: { pluginId: string }) {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
          <Puzzle className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Plugin not found</h2>
        <p className="text-muted-foreground mb-6">
          The plugin <code className="bg-muted px-1.5 py-0.5 rounded text-sm">{pluginId}</code> is
          not installed or is currently inactive. Make sure the plugin is installed and enabled.
        </p>
        <Link to="/plugins">
          <Button variant="secondary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Plugins
          </Button>
        </Link>
      </div>
    </div>
  );
}

function PluginErrorState({ pluginId, message }: { pluginId: string; message: string }) {
  return (
    <div className="py-8">
      <Alert variant="destructive" className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <div className="text-center">
        <p className="text-muted-foreground mb-4">
          There was a problem loading plugin{' '}
          <code className="bg-muted px-1.5 py-0.5 rounded text-sm">{pluginId}</code>.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/plugins">
            <Button variant="secondary">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Plugins
            </Button>
          </Link>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    </div>
  );
}
