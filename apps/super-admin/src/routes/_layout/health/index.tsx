// File: apps/super-admin/src/routes/_layout/health/index.tsx
//
// T008-50 — System Health screen (Super Admin).
//
// Features:
//  - Grid of 4 SystemHealthCard components (detailed variant): DB, Redis, Keycloak, Storage
//  - Overall status summary card
//  - 30s auto-refresh via useSystemHealth (refetchInterval: 30_000)
//  - Manual Refresh button (aria-label="Refresh health check") resets countdown
//  - Countdown indicator: "Next refresh in N seconds"
//  - aria-live="polite" on status grid for screen reader announcements
//
// Spec 008 — T008-50

import { useEffect, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { Button, Card, CardContent, Skeleton } from '@plexica/ui';
import { SystemHealthCard } from '@/components/SystemHealthCard';
import { useSystemHealth } from '@/hooks/useSystemHealth';
import type { SystemHealth } from '@/api/admin';

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/_layout/health/' as never)({
  component: SystemHealthPage,
});

// ---------------------------------------------------------------------------
// Status badge colours
// ---------------------------------------------------------------------------

const STATUS_CLASSES: Record<SystemHealth['status'], string> = {
  healthy: 'bg-green-100 text-green-800',
  degraded: 'bg-amber-100 text-amber-800',
  unhealthy: 'bg-red-100 text-red-800',
};

// ---------------------------------------------------------------------------
// Overall status summary card
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  health: SystemHealth;
}

function SummaryCard({ health }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Overall status
            </p>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold capitalize ${STATUS_CLASSES[health.status]}`}
            >
              {health.status}
            </span>
          </div>

          <div className="text-right text-sm text-muted-foreground space-y-1">
            <p>
              <span className="font-medium text-foreground">Last checked:</span>{' '}
              <time dateTime={health.timestamp}>
                {new Date(health.timestamp).toLocaleTimeString()}
              </time>
            </p>
            <p className="text-xs">{new Date(health.timestamp).toLocaleDateString()}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Countdown hook — ticks down from 30s, resettable
// ---------------------------------------------------------------------------

function useCountdown(seconds: number, resetSignal: number) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
  }, [seconds, resetSignal]);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [remaining]);

  return remaining;
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function HealthSkeleton() {
  return (
    <div className="space-y-6">
      {/* Summary skeleton */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton width={100} height={12} shape="line" />
              <Skeleton width={80} height={28} shape="rect" />
            </div>
            <div className="space-y-2 text-right">
              <Skeleton width={160} height={14} shape="line" />
              <Skeleton width={100} height={12} shape="line" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dependency cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {['Database', 'Redis', 'Keycloak', 'Storage'].map((name) => (
          <Card key={name}>
            <CardContent className="pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                {name}
              </p>
              <div className="space-y-2">
                <Skeleton width="100%" height={20} shape="rect" />
                <div className="flex justify-between">
                  <Skeleton width={80} height={14} shape="line" />
                  <Skeleton width={60} height={14} shape="line" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-dependency card wrapper
// ---------------------------------------------------------------------------

const DEP_LABELS: Record<string, string> = {
  database: 'Database',
  redis: 'Redis',
  keycloak: 'Keycloak',
  storage: 'Storage',
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function SystemHealthPage() {
  const { data: health, isLoading, isError, error, refetch } = useSystemHealth();

  // Track refetch timestamp to reset countdown
  const [resetSignal, setResetSignal] = useState(0);
  const countdown = useCountdown(30, resetSignal);
  const isRefreshing = useRef(false);

  const handleRefresh = () => {
    if (isRefreshing.current) return;
    isRefreshing.current = true;
    setResetSignal((s) => s + 1);
    void refetch().finally(() => {
      isRefreshing.current = false;
    });
  };

  const depKeys = ['database', 'redis', 'keycloak', 'storage'] as const;

  return (
    <div className="space-y-6">
      {/* Page heading + refresh controls */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">System Health</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time status of all platform dependencies
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Countdown indicator */}
          {!isLoading && (
            <span className="text-xs text-muted-foreground tabular-nums" aria-live="off">
              Next refresh in {countdown}s
            </span>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            aria-label="Refresh health check"
          >
            <RefreshCw
              className={`h-4 w-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {isError && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <span className="flex-1 text-sm">
            Failed to load health data. {error instanceof Error ? error.message : 'Unknown error.'}
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            className="flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium hover:bg-red-100 transition-colors"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {/* Main content */}
      {isLoading && !health ? (
        <HealthSkeleton />
      ) : (
        <div aria-live="polite" aria-label="System health status" className="space-y-6">
          {/* Overall status summary */}
          {health && <SummaryCard health={health} />}

          {/* Per-dependency detailed cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {depKeys.map((depKey) => {
              const dep = health?.dependencies[depKey];
              if (!dep && !health) {
                return (
                  <Card key={depKey}>
                    <CardContent className="pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        {DEP_LABELS[depKey]}
                      </p>
                      <SystemHealthCard health={undefined} isLoading={false} variant="detailed" />
                    </CardContent>
                  </Card>
                );
              }

              return (
                <Card key={depKey}>
                  <CardContent className="pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                      {DEP_LABELS[depKey]}
                    </p>
                    {dep ? (
                      <div className="space-y-2">
                        {/* Status */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Status</span>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_CLASSES[dep.status]}`}
                          >
                            {dep.status}
                          </span>
                        </div>

                        {/* Latency */}
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Latency</span>
                          <span className="text-sm font-mono tabular-nums text-foreground">
                            {dep.latencyMs != null ? `${dep.latencyMs} ms` : '—'}
                          </span>
                        </div>

                        {/* Error message */}
                        {dep.message && (
                          <p className="text-xs text-red-600 mt-1 rounded bg-red-50 px-2 py-1">
                            {dep.message}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No data available.</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
