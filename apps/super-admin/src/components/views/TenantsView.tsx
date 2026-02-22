import { useState } from 'react';
import { Button, Input, Badge, Card } from '@plexica/ui';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTenants } from '@/hooks';
import type { Tenant } from '@/types';
import { StatCard } from '../tenants/StatCard';
import { CreateTenantWizard } from '../tenants/CreateTenantWizard';
import { TenantDetailModal } from '../tenants/TenantDetailModal';
import { EditTenantModal } from '../tenants/EditTenantModal';

export function TenantsView() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  const {
    tenants,
    pagination,
    stats,
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    clearFilters,
    hasActiveFilters,
    suspendTenant,
    activateTenant,
    isSuspending,
    isActivating,
    page,
    setPage,
    refetch,
  } = useTenants();

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'default';
      case 'SUSPENDED':
        return 'danger';
      case 'PROVISIONING':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-1">Tenant Management</h2>
          <p className="text-muted-foreground">View and manage all workspace tenants</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>+ Create Tenant</Button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
            <p className="text-muted-foreground">Loading tenants...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card className="bg-destructive/10 border-destructive/30 mb-6">
          <div className="p-4">
            <p className="text-destructive text-sm">
              <strong>Error:</strong> Failed to load tenants. {(error as Error).message}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="mt-2 text-destructive hover:text-destructive"
            >
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* Search and Filters */}
      {!isLoading && !error && (
        <>
          <div className="flex items-center gap-4 mb-6">
            {/* Search Input */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search tenants by name or slug..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="PROVISIONING">Provisioning</option>
              <option value="PENDING_DELETION">Pending Deletion</option>
            </select>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <StatCard title="Total Tenants" value={stats.total} icon="building" />
            <StatCard title="Active" value={stats.active} icon="check" />
            <StatCard title="Suspended" value={stats.suspended} icon="pause" />
            <StatCard title="Provisioning" value={stats.provisioning} icon="gear" />
          </div>

          {/* Tenants Table */}
          <Card>
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                    Tenant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">{tenant.name}</p>
                        <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={getStatusBadgeVariant(tenant.status)}>{tenant.status}</Badge>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {new Date(tenant.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedTenant(tenant)}>
                          View
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingTenant(tenant)}>
                          Edit
                        </Button>
                        {tenant.status === 'ACTIVE' ? (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              if (confirm(`Suspend tenant "${tenant.name}"?`)) {
                                suspendTenant(tenant.id);
                              }
                            }}
                            disabled={isSuspending}
                          >
                            {isSuspending ? '...' : 'Suspend'}
                          </Button>
                        ) : tenant.status === 'SUSPENDED' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (confirm(`Activate tenant "${tenant.name}"?`)) {
                                activateTenant(tenant.id);
                              }
                            }}
                            disabled={isActivating}
                          >
                            {isActivating ? '...' : 'Activate'}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * pagination.limit + 1}–
                  {Math.min(page * pagination.limit, pagination.total)} of {pagination.total}{' '}
                  tenants
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-foreground">
                    Page {page} of {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page >= pagination.totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Empty State - No Tenants */}
            {stats.total === 0 && !isLoading && !error && (
              <div className="text-center py-12">
                <h3 className="text-xl font-semibold text-foreground mb-2">No tenants yet</h3>
                <p className="text-muted-foreground">Create your first tenant to get started</p>
              </div>
            )}

            {/* No Results State - Filtered */}
            {stats.total > 0 && tenants.length === 0 && (
              <div className="text-center py-12">
                <h3 className="text-xl font-semibold text-foreground mb-2">No tenants found</h3>
                <p className="text-muted-foreground">Try adjusting your search or filters</p>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Create Tenant Modal */}
      {showCreateModal && (
        <CreateTenantWizard
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            refetch();
          }}
        />
      )}

      {/* Edit Tenant Modal */}
      {editingTenant && (
        <EditTenantModal
          tenant={editingTenant}
          onClose={() => setEditingTenant(null)}
          onSuccess={() => {
            setEditingTenant(null);
            refetch();
          }}
        />
      )}

      {/* Tenant Detail Modal */}
      {selectedTenant && (
        <TenantDetailModal tenant={selectedTenant} onClose={() => setSelectedTenant(null)} />
      )}
    </div>
  );
}
