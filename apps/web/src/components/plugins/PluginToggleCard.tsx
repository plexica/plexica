// apps/web/src/components/plugins/PluginToggleCard.tsx
//
// Plugin card for the Extensions page.
// Shows plugin name, version, description, and an enable/disable Switch.
// When the plugin is enabled, a "Configure" button expands PluginConfigForm inline.
//
// T004-32 — design-spec.md Screen 5

import { useState } from 'react';
import { Switch } from '@plexica/ui';
import { Button } from '@plexica/ui';
import { Badge } from '@plexica/ui';
import { Label } from '@plexica/ui';
import { ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import type { TenantPlugin, PluginEntity } from '@plexica/types';
import { PluginConfigForm } from './PluginConfigForm';
import type { JsonSchema } from './PluginConfigForm';
import { apiClient } from '@/lib/api-client';
import { toast } from '@/components/ToastProvider';

interface PluginToggleCardProps {
  tenantPlugin: TenantPlugin;
  onToggle: (pluginId: string, enabled: boolean) => void;
  onConfigSaved?: (pluginId: string) => void;
  isToggling?: boolean;
}

export function PluginToggleCard({
  tenantPlugin,
  onToggle,
  onConfigSaved,
  isToggling = false,
}: PluginToggleCardProps) {
  const { plugin, status, configuration } = tenantPlugin;
  const isEnabled = status === 'ACTIVE';
  const [showConfig, setShowConfig] = useState(false);

  // Derive config schema from plugin manifest if available.
  // PluginEntity doesn't carry manifest directly; it may arrive via the
  // extended plugin object returned by getTenantActivePlugins.
  const pluginExtended = plugin as PluginEntity & { manifest?: Record<string, unknown> };
  const manifest = pluginExtended.manifest;
  const configSchema: JsonSchema | null =
    manifest?.configuration &&
    typeof manifest.configuration === 'object' &&
    (manifest.configuration as Record<string, unknown>).schema
      ? ((manifest.configuration as Record<string, unknown>).schema as JsonSchema)
      : null;

  const hasConfigSchema =
    configSchema !== null &&
    configSchema.properties &&
    Object.keys(configSchema.properties).length > 0;

  async function handleConfigSubmit(values: Record<string, unknown>) {
    await apiClient.updateTenantPluginConfig(plugin.id, values);
    toast.success('Configuration saved successfully');
    setShowConfig(false);
    onConfigSaved?.(plugin.id);
  }

  const switchId = `toggle-${plugin.id}`;

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Card header */}
      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-2xl" aria-hidden="true">
              {plugin.icon ?? '🧩'}
            </span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h2 className="text-base font-semibold text-foreground">{plugin.name}</h2>
              <Badge variant="secondary" className="text-xs">
                v{plugin.version}
              </Badge>
              {plugin.category && (
                <Badge variant="outline" className="text-xs">
                  {plugin.category}
                </Badge>
              )}
            </div>
            {plugin.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">{plugin.description}</p>
            )}
            {plugin.author && (
              <p className="text-xs text-muted-foreground mt-1">By {plugin.author}</p>
            )}
          </div>

          {/* Toggle */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <Label
              htmlFor={switchId}
              className="text-sm text-muted-foreground cursor-pointer select-none"
            >
              {isEnabled ? 'Enabled' : 'Disabled'}
            </Label>
            <Switch
              id={switchId}
              checked={isEnabled}
              disabled={isToggling}
              onCheckedChange={(checked) => onToggle(plugin.id, checked)}
              aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${plugin.name}`}
            />
          </div>
        </div>

        {/* Configure button — only visible when enabled */}
        {isEnabled && (
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {hasConfigSchema
                ? 'This plugin can be configured for your tenant.'
                : 'No configuration options available.'}
            </div>
            {hasConfigSchema && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowConfig((v) => !v)}
                aria-expanded={showConfig}
                aria-controls={`config-${plugin.id}`}
                className="flex items-center gap-1.5"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Configure
                {showConfig ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Inline config form — expands when enabled + Configure clicked */}
      {isEnabled && showConfig && hasConfigSchema && (
        <div id={`config-${plugin.id}`} className="border-t border-border px-5 py-5 bg-muted/20">
          <h3 className="text-sm font-semibold text-foreground mb-4">Plugin Configuration</h3>
          <PluginConfigForm
            schema={configSchema!}
            initialValues={(configuration as Record<string, unknown>) ?? {}}
            pluginId={plugin.id}
            onSubmit={handleConfigSubmit}
            onCancel={() => setShowConfig(false)}
          />
        </div>
      )}
    </div>
  );
}
