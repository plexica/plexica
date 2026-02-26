// apps/web/src/components/plugins/PluginHealthTab.tsx
//
// Health tab content for PluginDetailModal.
// Polls GET /api/v1/plugins/:id/health every 10s via the usePluginHealth hook.
// Displays:
//   - Overall health status badge
//   - Container CPU / memory usage bars (green ≤70%, yellow 70–90%, red >90%)
//   - Uptime counter
//   - Endpoint list

import { Badge } from '@plexica/ui';
import { Progress } from '@plexica/ui';
import { Alert, AlertDescription } from '@plexica/ui';
import { usePluginHealth } from '@/hooks/usePluginHealth';

interface PluginHealthTabProps {
  pluginId: string;
}

/** Returns Tailwind bg class for a 0–100 percentage value */
function resourceColor(pct: number): string {
  if (pct > 90) return 'bg-red-500';
  if (pct > 70) return 'bg-yellow-500';
  return 'bg-green-500';
}

/** Returns Badge variant for a health status */
function healthVariant(
  status: 'healthy' | 'unhealthy' | 'starting'
): 'default' | 'secondary' | 'danger' | 'outline' {
  if (status === 'healthy') return 'default';
  if (status === 'unhealthy') return 'danger';
  return 'secondary';
}

function healthLabel(status: 'healthy' | 'unhealthy' | 'starting'): string {
  const labels = { healthy: 'Healthy', unhealthy: 'Unhealthy', starting: 'Starting' };
  return labels[status];
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

export function PluginHealthTab({ pluginId }: PluginHealthTabProps) {
  const { health, isLoading, error } = usePluginHealth(pluginId);

  return (
    <div>
      {/* Live region for screen-reader announcements on health updates */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {health ? `Plugin health: ${health.status}` : isLoading ? 'Loading health data' : ''}
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>Failed to load health data: {error.message}</AlertDescription>
        </Alert>
      )}

      {/* Loading skeleton */}
      {isLoading && !health && (
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-32 rounded bg-muted" />
          <div className="h-4 w-full rounded bg-muted" />
          <div className="h-4 w-full rounded bg-muted" />
        </div>
      )}

      {health && (
        <div className="space-y-6">
          {/* Status row */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Status</span>
            <Badge variant={healthVariant(health.status)}>{healthLabel(health.status)}</Badge>
            {health.uptime !== undefined && (
              <span className="text-sm text-muted-foreground ml-auto">
                Uptime: {formatUptime(health.uptime)}
              </span>
            )}
          </div>

          {/* CPU usage */}
          {health.cpu !== undefined && (
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">CPU Usage</span>
                <span className="text-muted-foreground">{health.cpu.toFixed(1)}%</span>
              </div>
              <div
                role="meter"
                aria-label={`CPU usage ${health.cpu.toFixed(1)} percent`}
                aria-valuenow={health.cpu}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <Progress
                  value={health.cpu}
                  className={`h-3 [&>div]:${resourceColor(health.cpu)}`}
                />
              </div>
              {health.cpu > 90 && <p className="text-xs text-red-500 mt-1">⚠ High CPU usage</p>}
              {health.cpu > 70 && health.cpu <= 90 && (
                <p className="text-xs text-yellow-600 mt-1">CPU usage is elevated</p>
              )}
            </div>
          )}

          {/* Memory usage */}
          {health.memory !== undefined && (
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">Memory Usage</span>
                <span className="text-muted-foreground">{health.memory.toFixed(1)}%</span>
              </div>
              <div
                role="meter"
                aria-label={`Memory usage ${health.memory.toFixed(1)} percent`}
                aria-valuenow={health.memory}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <Progress
                  value={health.memory}
                  className={`h-3 [&>div]:${resourceColor(health.memory)}`}
                />
              </div>
              {health.memory > 90 && (
                <p className="text-xs text-red-500 mt-1">⚠ High memory usage</p>
              )}
              {health.memory > 70 && health.memory <= 90 && (
                <p className="text-xs text-yellow-600 mt-1">Memory usage is elevated</p>
              )}
            </div>
          )}

          {/* Endpoints */}
          {health.endpoints && health.endpoints.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Registered Endpoints</h4>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                        Method
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                        Path
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {health.endpoints.map((ep, idx) => (
                      <tr key={idx} className="border-t border-border">
                        <td className="px-3 py-2">
                          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                            {ep.method}
                          </code>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{ep.path}</td>
                        <td className="px-3 py-2">
                          <Badge
                            variant={ep.status === 'ok' ? 'default' : 'danger'}
                            className="text-xs"
                          >
                            {ep.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* No endpoints */}
          {(!health.endpoints || health.endpoints.length === 0) && (
            <p className="text-sm text-muted-foreground">No endpoints registered.</p>
          )}
        </div>
      )}
    </div>
  );
}
