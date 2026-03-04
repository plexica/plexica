// File: apps/super-admin/src/routes/_layout/audit-logs/index.tsx
//
// T008-49 — Global Audit Log screen (Super Admin).
//
// Features:
//  - Filter bar: date range, action text input, user ID text input, tenant ID text input
//  - Filters stored in local React state (no URL search params — routeTree.gen.ts constraint)
//  - AuditLogTable component (showTenantColumn=true for global view)
//  - 10K cap banner with role="alert" when meta.total > 10_000
//  - keepPreviousData: true — no blank flash between pages
//  - Loading skeletons | Error banner with retry
//
// Spec 008 — T008-49

import { useState, useCallback, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Search, AlertCircle, RefreshCw, X, FilterX } from 'lucide-react';
import { Button, Input, Label, Skeleton } from '@plexica/ui';
import { AuditLogTable } from '@/components/AuditLogTable';
import { useAuditLogs } from '@/hooks/useAuditLogs';

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/_layout/audit-logs/' as never)({
  component: AuditLogsPage,
});

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

interface FilterBarProps {
  action: string;
  userId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  onActionChange: (v: string) => void;
  onUserIdChange: (v: string) => void;
  onTenantIdChange: (v: string) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onClear: () => void;
}

function FilterBar({
  action,
  userId,
  tenantId,
  startDate,
  endDate,
  onActionChange,
  onUserIdChange,
  onTenantIdChange,
  onStartDateChange,
  onEndDateChange,
  onClear,
}: FilterBarProps) {
  const hasFilters = !!(action || userId || tenantId || startDate || endDate);

  return (
    <div className="space-y-3">
      {/* Row 1: action + user + tenant */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1 space-y-1">
          <Label htmlFor="filter-action" className="text-xs text-muted-foreground">
            Action
          </Label>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="filter-action"
              type="text"
              placeholder="e.g. tenant.created"
              value={action}
              onChange={(e) => onActionChange(e.target.value)}
              className="pl-9"
              aria-label="Filter by action"
            />
          </div>
        </div>

        <div className="flex-1 space-y-1">
          <Label htmlFor="filter-user" className="text-xs text-muted-foreground">
            User ID
          </Label>
          <Input
            id="filter-user"
            type="text"
            placeholder="User ID"
            value={userId}
            onChange={(e) => onUserIdChange(e.target.value)}
            aria-label="Filter by user ID"
          />
        </div>

        <div className="flex-1 space-y-1">
          <Label htmlFor="filter-tenant" className="text-xs text-muted-foreground">
            Tenant ID
          </Label>
          <Input
            id="filter-tenant"
            type="text"
            placeholder="Tenant ID"
            value={tenantId}
            onChange={(e) => onTenantIdChange(e.target.value)}
            aria-label="Filter by tenant ID"
          />
        </div>
      </div>

      {/* Row 2: date range + clear */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <Label htmlFor="filter-start-date" className="text-xs text-muted-foreground">
            From
          </Label>
          <Input
            id="filter-start-date"
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            aria-label="Filter from date"
          />
        </div>

        <div className="flex-1 space-y-1">
          <Label htmlFor="filter-end-date" className="text-xs text-muted-foreground">
            To
          </Label>
          <Input
            id="filter-end-date"
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            aria-label="Filter to date"
          />
        </div>

        {hasFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClear}
            aria-label="Clear all filters"
            className="self-end"
          >
            <FilterX className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 10K cap banner
// ---------------------------------------------------------------------------

interface CapBannerProps {
  onDismiss: () => void;
}

function CapBanner({ onDismiss }: CapBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800"
    >
      <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <p className="flex-1 text-sm">
        Showing first 10,000 results. Narrow the results using the date range or action filters.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss warning"
        className="rounded p-0.5 hover:bg-amber-100 transition-colors"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function AuditLogsPage() {
  // All filter state lives in local React state (no URL search params).
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [capDismissed, setCapDismissed] = useState(false);

  // Applied (committed) filter values — updated after debounce
  const [appliedAction, setAppliedAction] = useState('');
  const [appliedUserId, setAppliedUserId] = useState('');
  const [appliedTenantId, setAppliedTenantId] = useState('');

  const LIMIT = 25;

  // Debounce refs for text filters
  const actionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tenantTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleActionChange = useCallback((v: string) => {
    setAction(v);
    if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
    actionTimerRef.current = setTimeout(() => {
      setAppliedAction(v);
      setPage(1);
    }, 300);
  }, []);

  const handleUserIdChange = useCallback((v: string) => {
    setUserId(v);
    if (userTimerRef.current) clearTimeout(userTimerRef.current);
    userTimerRef.current = setTimeout(() => {
      setAppliedUserId(v);
      setPage(1);
    }, 300);
  }, []);

  const handleTenantIdChange = useCallback((v: string) => {
    setTenantId(v);
    if (tenantTimerRef.current) clearTimeout(tenantTimerRef.current);
    tenantTimerRef.current = setTimeout(() => {
      setAppliedTenantId(v);
      setPage(1);
    }, 300);
  }, []);

  const handleStartDateChange = useCallback((v: string) => {
    setStartDate(v);
    setPage(1);
  }, []);

  const handleEndDateChange = useCallback((v: string) => {
    setEndDate(v);
    setPage(1);
  }, []);

  const handleClearFilters = useCallback(() => {
    setAction('');
    setUserId('');
    setTenantId('');
    setStartDate('');
    setEndDate('');
    setAppliedAction('');
    setAppliedUserId('');
    setAppliedTenantId('');
    setPage(1);
    setCapDismissed(false);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  // Fetch using applied (debounced) filter values
  const { data, isLoading, isError, error, refetch } = useAuditLogs({
    page,
    limit: LIMIT,
    action: appliedAction || undefined,
    userId: appliedUserId || undefined,
    tenantId: appliedTenantId || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const showCapBanner = !capDismissed && (data?.meta.total ?? 0) > 10_000;

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Audit Log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Global audit trail across all tenants and users
        </p>
      </div>

      {/* 10K cap banner */}
      {showCapBanner && <CapBanner onDismiss={() => setCapDismissed(true)} />}

      {/* Error banner */}
      {isError && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <span className="flex-1 text-sm">
            Failed to load audit log. {error instanceof Error ? error.message : 'Unknown error.'}
          </span>
          <button
            type="button"
            onClick={() => void refetch()}
            className="flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium hover:bg-red-100 transition-colors"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {/* Filter bar */}
      <FilterBar
        action={action}
        userId={userId}
        tenantId={tenantId}
        startDate={startDate}
        endDate={endDate}
        onActionChange={handleActionChange}
        onUserIdChange={handleUserIdChange}
        onTenantIdChange={handleTenantIdChange}
        onStartDateChange={handleStartDateChange}
        onEndDateChange={handleEndDateChange}
        onClear={handleClearFilters}
      />

      {/* Audit log table */}
      {isLoading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} width="100%" height={44} shape="rect" />
          ))}
        </div>
      ) : (
        <AuditLogTable
          entries={data?.data ?? []}
          isLoading={isLoading}
          meta={data?.meta}
          currentPage={page}
          onPageChange={handlePageChange}
          showTenantColumn={true}
        />
      )}
    </div>
  );
}
