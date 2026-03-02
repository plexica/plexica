// apps/web/src/routes/admin.jobs.tsx
// T007-30 — Job Status Dashboard page
// Shows real-time job metrics, filterable table, and expandable detail panels.

import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { LayoutList, RefreshCw } from 'lucide-react';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppLayout } from '../components/Layout';
import { useAuthStore } from '../stores/auth-store';
import {
  StatCard,
  Button,
  JobStatusBadge,
  JobDetailPanel,
  type JobDetails,
  type JobStatusValue,
  Spinner,
} from '@plexica/ui';

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------
export const Route = createFileRoute('/admin/jobs' as never)({
  component: JobsPage,
});

// ---------------------------------------------------------------------------
// Types (mirrors backend API response)
// ---------------------------------------------------------------------------
interface JobsApiResponse {
  data: JobRecord[];
  total: number;
  page: number;
  pageSize: number;
}

interface JobRecord {
  id: string;
  name: string;
  status: JobStatusValue;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  retries: number;
  maxRetries: number;
  cronExpression?: string;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

interface JobMetrics {
  running: number;
  queued: number;
  failed: number;
  completedToday: number;
}

type TabKey = 'all' | 'RUNNING' | 'QUEUED' | 'FAILED' | 'SCHEDULED';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'RUNNING', label: 'Running' },
  { key: 'QUEUED', label: 'Queued' },
  { key: 'FAILED', label: 'Failed' },
  { key: 'SCHEDULED', label: 'Scheduled' },
];

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------
function JobsPage() {
  const { token } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [metrics, setMetrics] = useState<JobMetrics>({
    running: 0,
    queued: 0,
    failed: 0,
    completedToday: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;

  const authHeaders = { Authorization: `Bearer ${token ?? ''}` };

  const fetchJobs = useCallback(
    async (showRefreshing = false) => {
      if (showRefreshing) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      try {
        const statusParam = activeTab !== 'all' ? `&status=${activeTab}` : '';
        const url = `${API_BASE}/api/v1/jobs?page=${page}&pageSize=${PAGE_SIZE}${statusParam}`;
        const res = await fetch(url, { headers: authHeaders });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as JobsApiResponse;
        setJobs(body.data);
        setTotal(body.total);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load jobs');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTab, page, token]
  );

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/jobs/metrics`, { headers: authHeaders });
      if (!res.ok) return;
      const body = (await res.json()) as JobMetrics;
      setMetrics(body);
    } catch {
      // Metrics are best-effort; no error UI
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Initial load + tab/page changes
  useEffect(() => {
    void fetchJobs();
    void fetchMetrics();
  }, [fetchJobs, fetchMetrics]);

  // Auto-refresh every 15s
  useEffect(() => {
    const timer = setInterval(() => {
      void fetchJobs(true);
      void fetchMetrics();
    }, 15_000);
    return () => clearInterval(timer);
  }, [fetchJobs, fetchMetrics]);

  const handleRetry = async (job: JobDetails) => {
    try {
      await fetch(`${API_BASE}/api/v1/jobs/${job.id}/retry`, {
        method: 'POST',
        headers: authHeaders,
      });
      void fetchJobs(true);
    } catch {
      // Handled silently; user can retry manually
    }
  };

  const handleDisableSchedule = async (job: JobDetails) => {
    try {
      await fetch(`${API_BASE}/api/v1/jobs/${job.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      void fetchJobs(true);
    } catch {
      // Handled silently
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <ProtectedRoute requiredRole="admin">
      <AppLayout>
        {/* Page header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Job Queue</h1>
            <p className="text-muted-foreground mt-1">Monitor and manage background jobs</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchJobs(true)}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`mr-1.5 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Refresh
          </Button>
        </div>

        {/* Stat cards */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Running"
            value={metrics.running}
            icon={<LayoutList className="h-5 w-5" />}
          />
          <StatCard
            label="Queued"
            value={metrics.queued}
            icon={<LayoutList className="h-5 w-5" />}
          />
          <StatCard
            label="Failed"
            value={metrics.failed}
            icon={<LayoutList className="h-5 w-5" />}
          />
          <StatCard
            label="Completed Today"
            value={metrics.completedToday}
            icon={<LayoutList className="h-5 w-5" />}
          />
        </div>

        {/* Filter tabs */}
        <div
          className="mb-4 flex gap-1 rounded-lg bg-muted p-1 w-fit"
          role="tablist"
          aria-label="Filter jobs by status"
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setPage(1);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Job list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => fetchJobs()}>
              Try again
            </Button>
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-16 text-center">
            <LayoutList
              className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40"
              aria-hidden="true"
            />
            <p className="font-medium text-foreground">No jobs found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeTab === 'all'
                ? 'No jobs have been enqueued yet.'
                : `No ${activeTab.toLowerCase()} jobs.`}
            </p>
          </div>
        ) : (
          <div
            role="tabpanel"
            aria-label={`${activeTab === 'all' ? 'All' : activeTab} jobs`}
            className="space-y-2"
          >
            {/* Table header row */}
            <div
              role="row"
              className="hidden items-center gap-4 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide sm:flex"
            >
              <div className="w-28">Status</div>
              <div className="flex-1">Name</div>
              <div className="w-32 text-right">Created</div>
            </div>

            {jobs.map((job) => {
              const details: JobDetails = {
                id: job.id,
                name: job.name,
                status: job.status,
                payload: job.payload,
                result: job.result,
                error: job.error,
                retries: job.retries,
                maxRetries: job.maxRetries,
                cronExpression: job.cronExpression,
                scheduledAt: job.scheduledAt,
                startedAt: job.startedAt,
                completedAt: job.completedAt,
                createdAt: job.createdAt,
              };

              return (
                <JobDetailPanel
                  key={job.id}
                  job={details}
                  expanded={expandedJobId === job.id}
                  onExpandedChange={(v: boolean) => setExpandedJobId(v ? job.id : null)}
                  onRetry={handleRetry}
                  onDisableSchedule={handleDisableSchedule}
                />
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {!isLoading && !error && totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {total} total jobs · Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Inline status legend */}
        <div className="mt-8 flex flex-wrap gap-2">
          {(
            [
              'PENDING',
              'QUEUED',
              'RUNNING',
              'COMPLETED',
              'FAILED',
              'CANCELLED',
              'SCHEDULED',
            ] as JobStatusValue[]
          ).map((s) => (
            <JobStatusBadge key={s} status={s} />
          ))}
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}
