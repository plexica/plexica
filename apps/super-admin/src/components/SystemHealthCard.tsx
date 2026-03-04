// File: apps/super-admin/src/components/SystemHealthCard.tsx
//
// Reusable system health display component with two rendering variants:
//   - compact  (default): overall status badge + last-checked timestamp
//   - detailed (T008-50): per-dependency table rows with name, status, latency
//
// A11y: wrapped in aria-live="polite" so screen readers announce status changes.
//
// Spec 008 — T008-43

import { Card, CardContent, Skeleton } from '@plexica/ui';
import type { SystemHealth, DependencyHealth } from '@/api/admin';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SystemHealthCardProps {
  health: SystemHealth | undefined;
  isLoading?: boolean;
  variant?: 'compact' | 'detailed';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_CLASSES: Record<DependencyHealth['status'], string> = {
  healthy: 'bg-green-100 text-green-800',
  degraded: 'bg-amber-100 text-amber-800',
  unhealthy: 'bg-red-100 text-red-800',
};

function StatusBadge({ status }: { status: DependencyHealth['status'] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_CLASSES[status]}`}
    >
      {status}
    </span>
  );
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

// ---------------------------------------------------------------------------
// Compact variant
// ---------------------------------------------------------------------------

function CompactHealth({ health }: { health: SystemHealth }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <StatusBadge status={health.status} />
        <span className="text-sm text-muted-foreground">
          Checked {formatTimestamp(health.timestamp)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detailed variant
// ---------------------------------------------------------------------------

const DEPENDENCY_LABELS: Record<keyof SystemHealth['dependencies'], string> = {
  database: 'Database',
  redis: 'Redis',
  keycloak: 'Keycloak',
  storage: 'Storage',
};

function DetailedHealth({ health }: { health: SystemHealth }) {
  const deps = health.dependencies;
  const depKeys = Object.keys(DEPENDENCY_LABELS) as Array<keyof SystemHealth['dependencies']>;

  return (
    <div className="space-y-3">
      {/* Overall status row */}
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <span className="text-sm font-medium text-foreground">Overall</span>
        <div className="flex items-center gap-3">
          <StatusBadge status={health.status} />
          <span className="text-xs text-muted-foreground">{formatTimestamp(health.timestamp)}</span>
        </div>
      </div>

      {/* Per-dependency rows */}
      {depKeys.map((key) => {
        const dep = deps[key];
        return (
          <div key={key} className="flex items-center justify-between">
            <span className="text-sm text-foreground">{DEPENDENCY_LABELS[key]}</span>
            <div className="flex items-center gap-3">
              <StatusBadge status={dep.status} />
              {dep.latencyMs != null ? (
                <span className="text-xs text-muted-foreground tabular-nums w-16 text-right">
                  {dep.latencyMs} ms
                </span>
              ) : (
                <span className="text-xs text-muted-foreground w-16 text-right">—</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function HealthSkeleton({ variant }: { variant: 'compact' | 'detailed' }) {
  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-3">
        <Skeleton width={72} height={20} shape="rect" aria-label="Loading status" />
        <Skeleton width={160} height={16} shape="line" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Skeleton width="100%" height={20} shape="rect" />
      {['database', 'redis', 'keycloak', 'storage'].map((key) => (
        <div key={key} className="flex items-center justify-between">
          <Skeleton width={80} height={16} shape="line" />
          <Skeleton width={64} height={20} shape="rect" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported component
// ---------------------------------------------------------------------------

export function SystemHealthCard({
  health,
  isLoading = false,
  variant = 'compact',
}: SystemHealthCardProps) {
  return (
    <div aria-live="polite" aria-label="System health status">
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-sm font-semibold text-foreground mb-3">System Health</h2>

          {isLoading && !health ? (
            <HealthSkeleton variant={variant} />
          ) : health ? (
            variant === 'detailed' ? (
              <DetailedHealth health={health} />
            ) : (
              <CompactHealth health={health} />
            )
          ) : (
            <p className="text-sm text-muted-foreground">Health data unavailable.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
