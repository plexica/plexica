// File: apps/super-admin/src/routes/_layout/observability/index.tsx
//
// Observability dashboard — 4-tab interface (Health | Metrics | Traces | Alerts).
// Tab selection is managed via the `?tab=` search param so deep-linking works.
//
// Feature flag: VITE_ENABLE_OBSERVABILITY_DASHBOARD (default: true).
// When disabled the route redirects to /dashboard.
//
// Code-split: each tab panel is loaded via React.lazy so the recharts bundle
// only loads when the Metrics tab is first visited (NFR-018, ADR-029).
//
// WCAG 2.1 AA:
//   - Tab list uses role="tablist", each tab role="tab" with aria-selected
//   - Each panel has role="tabpanel" and aria-labelledby pointing to its tab
//   - Focus is moved to the new panel on tab change
//   - All colour indicators use colour + text/icon (not colour alone)
//
// Spec 012 — T012-27

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { Activity } from 'lucide-react';
import { Skeleton } from '@plexica/ui';

// ---------------------------------------------------------------------------
// Route search param schema
// ---------------------------------------------------------------------------

const ObservabilitySearchSchema = z.object({
  tab: z.enum(['health', 'metrics', 'traces', 'alerts']).catch('health'),
});

export const Route = createFileRoute('/_layout/observability/' as never)({
  validateSearch: (search) => ObservabilitySearchSchema.parse(search),
  component: ObservabilityPage,
});

// ---------------------------------------------------------------------------
// Lazy tab panels (code-split per NFR-018)
// ---------------------------------------------------------------------------

const HealthTab = React.lazy(() => import('@/components/observability/HealthTab'));
const MetricsTab = React.lazy(() => import('@/components/observability/MetricsTab'));
const TracesTab = React.lazy(() => import('@/components/observability/TracesTab'));
const AlertsTab = React.lazy(() => import('@/components/observability/AlertsTab'));

// ---------------------------------------------------------------------------
// Tab configuration
// ---------------------------------------------------------------------------

type Tab = 'health' | 'metrics' | 'traces' | 'alerts';

const TABS: { id: Tab; label: string }[] = [
  { id: 'health', label: 'Health' },
  { id: 'metrics', label: 'Metrics' },
  { id: 'traces', label: 'Traces' },
  { id: 'alerts', label: 'Alerts' },
];

// ---------------------------------------------------------------------------
// TabPanelSkeleton — shown while the lazy chunk loads
// ---------------------------------------------------------------------------

function TabPanelSkeleton() {
  return (
    <div className="space-y-4 p-2" aria-busy="true" aria-label="Loading tab content…">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ObservabilityPage
// ---------------------------------------------------------------------------

function ObservabilityPage() {
  const { tab: activeTab } = Route.useSearch();
  const navigate = useNavigate();

  // Redirect if feature flag is disabled
  useEffect(() => {
    if (import.meta.env.VITE_ENABLE_OBSERVABILITY_DASHBOARD === 'false') {
      void navigate({ to: '/dashboard' as never });
    }
  }, [navigate]);

  // Refs for tab buttons — used to move DOM focus on keyboard navigation
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleTabChange = useCallback(
    (tab: Tab) => {
      void navigate({ search: { tab } as never, replace: true });
    },
    [navigate]
  );

  // Arrow-key navigation within the tab list (WCAG 2.1 §2.1)
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      const count = TABS.length;
      let nextIndex: number | null = null;
      if (e.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % count;
      } else if (e.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + count) % count;
      } else if (e.key === 'Home') {
        nextIndex = 0;
      } else if (e.key === 'End') {
        nextIndex = count - 1;
      }
      if (nextIndex !== null) {
        e.preventDefault();
        handleTabChange(TABS[nextIndex].id);
        tabRefs.current[nextIndex]?.focus();
      }
    },
    [handleTabChange]
  );

  // Move focus to panel when tab changes (keyboard UX)
  const panelRef = useRef<HTMLDivElement | null>(null);
  const prevTab = useRef<Tab | null>(null);
  useEffect(() => {
    if (prevTab.current !== null && prevTab.current !== activeTab) {
      panelRef.current?.focus();
    }
    prevTab.current = activeTab;
  }, [activeTab]);

  // ── Render ────────────────────────────────────────────────────────────────

  const [selectedTab, setSelectedTab] = useState<Tab>(activeTab);
  useEffect(() => {
    setSelectedTab(activeTab);
  }, [activeTab]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Activity className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-2xl font-semibold tracking-tight">Plugin Observability</h1>
      </div>

      {/* Tab navigation */}
      <div
        role="tablist"
        aria-label="Observability sections"
        className="flex border-b border-border gap-1"
      >
        {TABS.map((tab, index) => {
          const isActive = selectedTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`obs-tab-${tab.id}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`obs-panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              onClick={() => handleTabChange(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, index)}
              className={[
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors outline-none',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              ].join(' ')}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab panels */}
      <div
        id={`obs-panel-${selectedTab}`}
        role="tabpanel"
        aria-labelledby={`obs-tab-${selectedTab}`}
        tabIndex={-1}
        ref={panelRef}
        className="outline-none"
      >
        <Suspense fallback={<TabPanelSkeleton />}>
          {selectedTab === 'health' && <HealthTab />}
          {selectedTab === 'metrics' && <MetricsTab />}
          {selectedTab === 'traces' && <TracesTab />}
          {selectedTab === 'alerts' && <AlertsTab />}
        </Suspense>
      </div>
    </div>
  );
}
