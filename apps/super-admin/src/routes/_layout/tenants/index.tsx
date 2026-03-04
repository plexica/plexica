// File: apps/super-admin/src/routes/_layout/tenants/index.tsx
//
// Tenant List screen — T008-44 (Spec 008 Admin Interfaces).
//
// The parent _layout.tsx handles auth, sidebar, and header.
// This component renders content directly — no ProtectedRoute or AppLayout wrapper.
//
// Features:
//   - Filterable, searchable (debounced 300ms) table of tenants
//   - Status filter select (All / Active / Suspended / Provisioning)
//   - Per-row action menu: Edit, Suspend, Reactivate, Delete (with slug confirm)
//   - Pagination: prev / next with page count display
//   - Loading: skeleton rows  |  Empty: "No tenants found" message

import { useState, useCallback, useRef } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  Building2,
  Search,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Input,
  Skeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@plexica/ui';
import { TenantStatusBadge } from '@/components/TenantStatusBadge';
import {
  useTenants,
  useSuspendTenant,
  useReactivateTenant,
  useDeleteTenant,
  type TenantStatusFilter,
} from '@/hooks/useTenants';
import type { Tenant } from '@/types';

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/_layout/tenants/' as never)({
  component: TenantsPage,
});

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <tr>
      <td className="px-4 py-3">
        <div className="space-y-1.5">
          <Skeleton width={160} height={14} shape="line" />
          <Skeleton width={100} height={12} shape="line" />
        </div>
      </td>
      <td className="px-4 py-3">
        <Skeleton width={80} height={20} shape="rect" />
      </td>
      <td className="px-4 py-3">
        <Skeleton width={90} height={14} shape="line" />
      </td>
      <td className="px-4 py-3 text-right">
        <Skeleton width={32} height={32} shape="rect" className="ml-auto rounded" />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog (inline, state-based — no window.prompt)
// ---------------------------------------------------------------------------

interface DeleteConfirmProps {
  tenant: Tenant;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}

function DeleteConfirmDialog({ tenant, onConfirm, onCancel, isPending }: DeleteConfirmProps) {
  const [inputValue, setInputValue] = useState('');
  const slugMatches = inputValue === tenant.slug;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-xl">
        <h2 id="delete-dialog-title" className="text-base font-semibold text-foreground mb-1">
          Delete tenant
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          This action schedules <span className="font-medium text-foreground">{tenant.name}</span>{' '}
          for deletion. Type the tenant slug{' '}
          <code className="rounded bg-muted px-1 text-xs">{tenant.slug}</code> to confirm.
        </p>

        <Input
          aria-label={`Type ${tenant.slug} to confirm deletion`}
          placeholder={tenant.slug}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="mb-4"
          autoFocus
        />

        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={onConfirm}
            disabled={!slugMatches || isPending}
          >
            {isPending ? 'Deleting…' : 'Delete tenant'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row action menu
// ---------------------------------------------------------------------------

interface RowActionsProps {
  tenant: Tenant;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onEdit: () => void;
  onSuspend: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}

function RowActions({
  tenant,
  isOpen,
  onOpen,
  onClose,
  onEdit,
  onSuspend,
  onReactivate,
  onDelete,
}: RowActionsProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const canSuspend = tenant.status === 'ACTIVE';
  const canReactivate = tenant.status === 'SUSPENDED';
  const canDelete = tenant.status !== 'DELETED' && tenant.status !== 'PENDING_DELETION';

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        aria-label={`Actions for ${tenant.name}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
          isOpen ? onClose() : onOpen();
        }}
        className="rounded p-1 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>

      {isOpen && (
        <>
          {/* Click-outside backdrop */}
          <div className="fixed inset-0 z-10" aria-hidden="true" onClick={onClose} />
          <div
            role="menu"
            aria-label={`Actions for ${tenant.name}`}
            className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-border bg-background shadow-lg py-1 text-sm"
          >
            <button
              role="menuitem"
              type="button"
              className="w-full px-3 py-1.5 text-left hover:bg-muted transition-colors"
              onClick={() => {
                onClose();
                onEdit();
              }}
            >
              Edit
            </button>

            {canSuspend && (
              <button
                role="menuitem"
                type="button"
                className="w-full px-3 py-1.5 text-left hover:bg-muted transition-colors text-amber-700"
                onClick={() => {
                  onClose();
                  onSuspend();
                }}
              >
                Suspend
              </button>
            )}

            {canReactivate && (
              <button
                role="menuitem"
                type="button"
                className="w-full px-3 py-1.5 text-left hover:bg-muted transition-colors text-green-700"
                onClick={() => {
                  onClose();
                  onReactivate();
                }}
              >
                Reactivate
              </button>
            )}

            {canDelete && (
              <>
                <div className="my-1 border-t border-border" />
                <button
                  role="menuitem"
                  type="button"
                  className="w-full px-3 py-1.5 text-left hover:bg-muted transition-colors text-destructive"
                  onClick={() => {
                    onClose();
                    onDelete();
                  }}
                >
                  Delete…
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function TenantsPage() {
  const navigate = useNavigate();

  const {
    tenants,
    pagination,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    page,
    setPage,
    refetch,
  } = useTenants();

  const suspendMutation = useSuspendTenant();
  const reactivateMutation = useReactivateTenant();
  const deleteMutation = useDeleteTenant();

  // Debounced search — local value tracks input, query updates after 300ms
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setLocalSearch(value);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        setSearchQuery(value);
      }, 300);
    },
    [setSearchQuery]
  );

  // Row menu open state — only one row open at a time
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Delete confirmation dialog state
  const [deletingTenant, setDeletingTenant] = useState<Tenant | null>(null);

  // ---------------------------------------------------------------------------
  // Action handlers
  // ---------------------------------------------------------------------------

  const handleEdit = (tenant: Tenant) => {
    navigate({
      to: '/_layout/tenants/$tenantId' as never,
      params: { tenantId: tenant.id } as never,
    });
  };

  const handleSuspend = (tenant: Tenant) => {
    suspendMutation.mutate(tenant.id, {
      onSuccess: () => toast.success(`"${tenant.name}" suspended`),
      onError: (err) =>
        toast.error(`Failed to suspend "${tenant.name}": ${(err as Error).message}`),
    });
  };

  const handleReactivate = (tenant: Tenant) => {
    reactivateMutation.mutate(tenant.id, {
      onSuccess: () => toast.success(`"${tenant.name}" reactivated`),
      onError: (err) =>
        toast.error(`Failed to reactivate "${tenant.name}": ${(err as Error).message}`),
    });
  };

  const handleDeleteConfirm = () => {
    if (!deletingTenant) return;
    const tenant = deletingTenant;
    deleteMutation.mutate(tenant.id, {
      onSuccess: () => {
        toast.success(`"${tenant.name}" scheduled for deletion`);
        setDeletingTenant(null);
      },
      onError: (err) => {
        toast.error(`Failed to delete "${tenant.name}": ${(err as Error).message}`);
      },
    });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Tenants</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage all platform tenants</p>
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <span className="flex-1 text-sm">
            Failed to load tenants. {error instanceof Error ? error.message : 'Unknown error.'}
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

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search tenants by name or slug…"
            value={localSearch}
            onChange={handleSearchChange}
            className="pl-9"
            aria-label="Search tenants"
          />
        </div>

        {/* Status filter */}
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as TenantStatusFilter)}
        >
          <SelectTrigger className="w-full sm:w-48" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="SUSPENDED">Suspended</SelectItem>
            <SelectItem value="PROVISIONING">Provisioning</SelectItem>
            <SelectItem value="PENDING_DELETION">Pending Deletion</SelectItem>
            <SelectItem value="DELETED">Deleted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                Name / Slug
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                Created
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : tenants.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Building2 className="h-10 w-10 opacity-30" aria-hidden="true" />
                    <p className="font-medium text-foreground">No tenants found</p>
                    <p className="text-sm">Try adjusting your search or filter.</p>
                  </div>
                </td>
              </tr>
            ) : (
              tenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{tenant.name}</p>
                    <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <TenantStatusBadge status={tenant.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(tenant.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <RowActions
                      tenant={tenant}
                      isOpen={openMenuId === tenant.id}
                      onOpen={() => setOpenMenuId(tenant.id)}
                      onClose={() => setOpenMenuId(null)}
                      onEdit={() => handleEdit(tenant)}
                      onSuspend={() => handleSuspend(tenant)}
                      onReactivate={() => handleReactivate(tenant)}
                      onDelete={() => setDeletingTenant(tenant)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {!isLoading && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-sm text-muted-foreground">
              {(page - 1) * pagination.limit + 1}–
              {Math.min(page * pagination.limit, pagination.total)} of {pagination.total} tenants
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <span className="text-sm text-foreground min-w-[5rem] text-center">
                Page {page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={page >= pagination.totalPages}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {deletingTenant && (
        <DeleteConfirmDialog
          tenant={deletingTenant}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingTenant(null)}
          isPending={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
