// File: apps/super-admin/src/routes/_layout/plugins/$pluginId/config.tsx
//
// T008-46 — Super Admin Plugin Config screen.
//
// Renders a key-value form for the plugin's current `config` object.
// Changes are submitted via PATCH /api/v1/admin/plugins/:id/config.
//
// Breadcrumb: Plugins > {pluginName} > Config

import { useState, useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ChevronRight, ArrowLeft, AlertCircle } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Skeleton,
} from '@plexica/ui';
import { toast } from 'sonner';
import { useAdminPlugins } from '@/hooks/useAdminPlugins';

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------
export const Route = createFileRoute('/_layout/plugins/$pluginId/config' as never)({
  component: PluginConfigPage,
});

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
function PluginConfigPage() {
  const navigate = useNavigate();
  // params cast: routeTree.gen.ts regeneration needed for full type safety
  const { pluginId } = (Route as unknown as { useParams: () => { pluginId: string } }).useParams();

  const { plugins, isLoading, isError, error, updateConfigAsync, isUpdatingConfig } =
    useAdminPlugins();

  const plugin = plugins.find((p) => p.id === pluginId);
  const configEntries: Array<[string, unknown]> = Object.entries(plugin?.config ?? {});

  // -----------------------------------------------------------------------
  // Local form state — keyed by config field name, values as strings
  // -----------------------------------------------------------------------
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);

  // Initialise / reset form when plugin data arrives or changes
  useEffect(() => {
    if (plugin) {
      const initial = Object.fromEntries(
        Object.entries(plugin.config ?? {}).map(([k, v]) => [k, String(v ?? '')])
      );
      setLocalValues(initial);
      setIsDirty(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugin?.id, plugin?.config]);

  const handleChange = (key: string, value: string) => {
    setLocalValues((prev) => {
      const next = { ...prev, [key]: value };
      // Mark dirty if any value differs from the plugin's current config
      const original = Object.fromEntries(
        Object.entries(plugin?.config ?? {}).map(([k, v]) => [k, String(v ?? '')])
      );
      setIsDirty(JSON.stringify(next) !== JSON.stringify(original));
      return next;
    });
  };

  const goBack = () => {
    void (navigate as (opts: unknown) => void)({ to: '/_layout/plugins/' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plugin) return;
    try {
      await updateConfigAsync({ pluginId: plugin.id, config: localValues });
      toast.success(`${plugin.name} configuration saved`);
      setIsDirty(false);
    } catch (err) {
      toast.error(`Failed to save config: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton width={200} height={24} shape="line" />
        <Skeleton width={300} height={32} shape="line" />
        <Card>
          <CardHeader>
            <Skeleton width={160} height={20} shape="line" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton width={120} height={14} shape="line" />
                <Skeleton width="100%" height={36} shape="rect" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Error / not-found state
  // -----------------------------------------------------------------------
  if (isError || !plugin) {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Plugins
        </button>
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <span className="text-sm">
            {isError
              ? error instanceof Error
                ? error.message
                : 'Failed to load plugins.'
              : `Plugin "${pluginId}" not found.`}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button
        type="button"
        onClick={goBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Plugins
      </button>

      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <span>Plugins</span>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{plugin!.name}</span>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-foreground font-medium">Config</span>
      </nav>

      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{plugin!.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          v{plugin!.version} — Plugin configuration
        </p>
      </div>

      {/* Config form */}
      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {configEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                This plugin has no configurable settings.
              </p>
            ) : (
              configEntries.map(([key]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`config-${key}`}>{key}</Label>
                  <Input
                    id={`config-${key}`}
                    type="text"
                    value={localValues[key] ?? ''}
                    onChange={(e) => handleChange(key, e.target.value)}
                    placeholder={key}
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-3 justify-end">
          <Button type="button" variant="outline" onClick={goBack}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!isDirty || isUpdatingConfig || configEntries.length === 0}
          >
            {isUpdatingConfig ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}
