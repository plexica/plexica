// File: apps/web/src/routes/admin.audit-logs.tsx
//
// T008-57 — Tenant Admin Audit Log screen.
// Displays tenant-scoped audit log with date-range, action, and resource type filters.
// Supports CSV/JSON export via T008-66 endpoint.
// Spec 008 Admin Interfaces — Tenant Admin Phase 7

import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@plexica/ui';
import { getTenantAuditLogs, exportTenantAuditLogs } from '@/api/admin';
import { AuditLogTable } from '@/components/AuditLogTable';
import type { AuditLogEntry, AuditLogMeta } from '@/components/AuditLogTable';
import type { TenantAuditLogFilters } from '@/api/admin';

export const Route = createFileRoute('/admin/audit-logs' as never)({
  component: TenantAdminAuditLogsPage,
});

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function useTenantAuditLogs(filters: TenantAuditLogFilters) {
  return useQuery({
    queryKey: ['tenant-admin', 'audit-logs', filters],
    queryFn: () => getTenantAuditLogs(filters),
    staleTime: 10_000,
  });
}

// ---------------------------------------------------------------------------
// Common action options for filter dropdown
// ---------------------------------------------------------------------------

const ACTION_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'USER_INVITED', label: 'User invited' },
  { value: 'USER_DEACTIVATED', label: 'User deactivated' },
  { value: 'USER_REACTIVATED', label: 'User reactivated' },
  { value: 'TEAM_CREATED', label: 'Team created' },
  { value: 'TEAM_DELETED', label: 'Team deleted' },
  { value: 'ROLE_CREATED', label: 'Role created' },
  { value: 'ROLE_UPDATED', label: 'Role updated' },
  { value: 'ROLE_DELETED', label: 'Role deleted' },
  { value: 'SETTINGS_UPDATED', label: 'Settings updated' },
  { value: 'PLUGIN_ENABLED', label: 'Plugin enabled' },
  { value: 'PLUGIN_DISABLED', label: 'Plugin disabled' },
];

const RESOURCE_OPTIONS = [
  { value: '', label: 'All resources' },
  { value: 'user', label: 'User' },
  { value: 'team', label: 'Team' },
  { value: 'role', label: 'Role' },
  { value: 'settings', label: 'Settings' },
  { value: 'plugin', label: 'Plugin' },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function TenantAdminAuditLogsPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exportLoading, setExportLoading] = useState(false);

  const LIMIT = 25;

  const filters: TenantAuditLogFilters = {
    action: action || undefined,
    resourceType: resourceType || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page,
    limit: LIMIT,
  };

  const { data, isLoading, error } = useTenantAuditLogs(filters);

  // Map backend entries → AuditLogTable entries
  const entries: AuditLogEntry[] =
    data?.data.map((e) => ({
      id: e.id,
      userId: e.userId,
      action: e.action,
      resourceType: e.resourceType,
      resourceId: e.resourceId,
      details: e.details,
      ipAddress: e.ipAddress,
      createdAt: e.createdAt,
    })) ?? [];

  const meta: AuditLogMeta | undefined = data
    ? {
        page: data.meta.page,
        limit: data.meta.limit,
        total: data.meta.total,
        totalPages: data.meta.totalPages,
      }
    : undefined;

  const handleExport = async (format: 'csv' | 'json') => {
    setExportLoading(true);
    try {
      const { jobId } = await exportTenantAuditLogs({
        format,
        filters: {
          action: action || undefined,
          resourceType: resourceType || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
      });
      toast.success(`Export started (job ${jobId.slice(0, 8)}…). You will be notified when ready.`);
    } catch {
      toast.error('Failed to start export');
    } finally {
      setExportLoading(false);
    }
  };

  const handleResetFilters = () => {
    setAction('');
    setResourceType('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const hasFilters = action || resourceType || startDate || endDate;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track all administrative actions in your tenant
          </p>
        </div>

        {/* Export dropdown — simple buttons for CSV and JSON */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={exportLoading}
            onClick={() => void handleExport('csv')}
          >
            <Download className="h-4 w-4 mr-2" aria-hidden="true" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exportLoading}
            onClick={() => void handleExport('json')}
          >
            <Download className="h-4 w-4 mr-2" aria-hidden="true" />
            Export JSON
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-sm font-medium text-muted-foreground">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="filter-action">Action</Label>
              <Select
                value={action}
                onValueChange={(v) => {
                  setAction(v);
                  setPage(1);
                }}
              >
                <SelectTrigger id="filter-action">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value || '_all'} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filter-resource">Resource type</Label>
              <Select
                value={resourceType}
                onValueChange={(v) => {
                  setResourceType(v);
                  setPage(1);
                }}
              >
                <SelectTrigger id="filter-resource">
                  <SelectValue placeholder="All resources" />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value || '_all'} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filter-start">From</Label>
              <Input
                id="filter-start"
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filter-end">To</Label>
              <Input
                id="filter-end"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {hasFilters && (
            <div className="mt-3 flex justify-end">
              <Button variant="outline" size="sm" onClick={handleResetFilters}>
                Reset filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
        >
          Failed to load audit log. Please refresh.
        </div>
      )}

      {/* Table */}
      <AuditLogTable
        entries={entries}
        isLoading={isLoading}
        meta={meta}
        currentPage={page}
        onPageChange={setPage}
        showTenantColumn={false}
      />
    </div>
  );
}
