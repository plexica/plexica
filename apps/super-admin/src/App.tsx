// apps/super-admin/src/App.tsx

import { useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from './lib/api-client';
import type { Tenant, Plugin } from './types';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<'tenants' | 'plugins' | 'users' | 'analytics'>(
    'tenants'
  );

  return (
    <div className="min-h-screen bg-muted">
      {/* Header */}
      <header className="bg-card border-b border-border">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-white font-bold text-xl">
                P
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Plexica Super Admin</h1>
                <p className="text-xs text-muted-foreground">Platform Management</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">admin@plexica.com</span>
              <button className="px-4 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors">
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-card border-b border-border">
        <div className="container mx-auto px-6">
          <div className="flex items-center gap-1">
            <TabButton
              label="Tenants"
              icon="🏢"
              active={activeTab === 'tenants'}
              onClick={() => setActiveTab('tenants')}
            />
            <TabButton
              label="Plugins"
              icon="🧩"
              active={activeTab === 'plugins'}
              onClick={() => setActiveTab('plugins')}
            />
            <TabButton
              label="Users"
              icon="👥"
              active={activeTab === 'users'}
              onClick={() => setActiveTab('users')}
            />
            <TabButton
              label="Analytics"
              icon="📊"
              active={activeTab === 'analytics'}
              onClick={() => setActiveTab('analytics')}
            />
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {activeTab === 'tenants' && <TenantsView />}
        {activeTab === 'plugins' && <PluginsView />}
        {activeTab === 'users' && <UsersView />}
        {activeTab === 'analytics' && <AnalyticsView />}
      </main>
    </div>
  );
}

// Tab Button Component
function TabButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
        active
          ? 'border-primary text-primary font-medium'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      <span>{icon}</span>
      <span className="text-sm">{label}</span>
    </button>
  );
}

// Tenants View
function TenantsView() {
  const [showCreateModal, setShowCreateModal] = useState(false);

  const {
    data: tenantsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => apiClient.getTenants(),
  });

  const suspendMutation = useMutation({
    mutationFn: (tenantId: string) => apiClient.suspendTenant(tenantId),
    onSuccess: () => {
      refetch();
    },
  });

  const activateMutation = useMutation({
    mutationFn: (tenantId: string) => apiClient.activateTenant(tenantId),
    onSuccess: () => {
      refetch();
    },
  });

  const tenants: Tenant[] = tenantsData?.tenants || [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-1">Tenant Management</h2>
          <p className="text-muted-foreground">View and manage all workspace tenants</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium"
        >
          + Create Tenant
        </button>
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
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800 text-sm">
            <strong>Error:</strong> Failed to load tenants. {(error as Error).message}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {/* Stats */}
      {!isLoading && !error && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <StatCard title="Total Tenants" value={tenants.length} icon="🏢" />
            <StatCard
              title="Active"
              value={tenants.filter((t) => t.status === 'active').length}
              icon="✅"
            />
            <StatCard
              title="Suspended"
              value={tenants.filter((t) => t.status === 'suspended').length}
              icon="⏸️"
            />
            <StatCard
              title="Provisioning"
              value={tenants.filter((t) => t.status === 'provisioning').length}
              icon="⚙️"
            />
          </div>

          {/* Tenants Table */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
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
                      <span
                        className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          tenant.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : tenant.status === 'suspended'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-orange-100 text-orange-700'
                        }`}
                      >
                        {tenant.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {new Date(tenant.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                          View
                        </button>
                        <button className="text-orange-600 hover:text-orange-800 text-sm font-medium">
                          Edit
                        </button>
                        {tenant.status === 'active' ? (
                          <button
                            onClick={() => {
                              if (confirm(`Suspend tenant "${tenant.name}"?`)) {
                                suspendMutation.mutate(tenant.id);
                              }
                            }}
                            disabled={suspendMutation.isPending}
                            className="text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50"
                          >
                            {suspendMutation.isPending ? '...' : 'Suspend'}
                          </button>
                        ) : tenant.status === 'suspended' ? (
                          <button
                            onClick={() => {
                              if (confirm(`Activate tenant "${tenant.name}"?`)) {
                                activateMutation.mutate(tenant.id);
                              }
                            }}
                            disabled={activateMutation.isPending}
                            className="text-green-600 hover:text-green-800 text-sm font-medium disabled:opacity-50"
                          >
                            {activateMutation.isPending ? '...' : 'Activate'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Empty State */}
            {tenants.length === 0 && !isLoading && !error && (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🏢</div>
                <h3 className="text-xl font-semibold text-foreground mb-2">No tenants yet</h3>
                <p className="text-muted-foreground">Create your first tenant to get started</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Create Tenant Modal */}
      {showCreateModal && (
        <CreateTenantModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}

// Plugins View (Marketplace)
function PluginsView() {
  const {
    data: pluginsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => apiClient.getPlugins(),
  });

  const plugins: Plugin[] = pluginsData?.plugins || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-1">Plugin Marketplace</h2>
          <p className="text-muted-foreground">Manage global plugin registry</p>
        </div>
        <button className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium">
          + Publish Plugin
        </button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
            <p className="text-muted-foreground">Loading plugins...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800 text-sm">
            <strong>Error:</strong> Failed to load plugins. {(error as Error).message}
          </p>
        </div>
      )}

      {/* Plugins Grid */}
      {!isLoading && !error && (
        <>
          {plugins.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plugins.map((plugin) => (
                <div key={plugin.id} className="bg-card border border-border rounded-lg p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center text-2xl">
                      {plugin.icon || '🧩'}
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        plugin.status === 'published'
                          ? 'bg-green-100 text-green-700'
                          : plugin.status === 'draft'
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {plugin.status}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">{plugin.name}</h3>
                  <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                    {plugin.description}
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    v{plugin.version} • {plugin.category}
                  </p>
                  <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
                    <span>By {plugin.author}</span>
                  </div>
                  <div className="flex gap-2">
                    <button className="flex-1 px-3 py-2 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200">
                      View
                    </button>
                    <button className="flex-1 px-3 py-2 bg-orange-100 text-orange-700 rounded text-sm font-medium hover:bg-orange-200">
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg p-12 text-center">
              <div className="text-6xl mb-4">🧩</div>
              <h3 className="text-xl font-semibold text-foreground mb-2">No plugins yet</h3>
              <p className="text-muted-foreground mb-6">
                Publish your first plugin to the marketplace
              </p>
              <button className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium">
                + Publish Plugin
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Users View
function UsersView() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-1">Platform Users</h2>
          <p className="text-muted-foreground">View all users across all tenants</p>
        </div>
      </div>
      <div className="bg-card border border-border rounded-lg p-12 text-center">
        <div className="text-6xl mb-4">👥</div>
        <h3 className="text-xl font-semibold text-foreground mb-2">User Management</h3>
        <p className="text-muted-foreground">User management view coming soon</p>
      </div>
    </div>
  );
}

// Analytics View
function AnalyticsView() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-1">Platform Analytics</h2>
          <p className="text-muted-foreground">Monitor platform-wide metrics</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Tenants" value="..." icon="🏢" />
        <StatCard title="Total Users" value="..." icon="👥" />
        <StatCard title="Active Plugins" value="..." icon="🧩" />
        <StatCard title="API Calls (24h)" value="..." icon="📊" />
      </div>

      <div className="bg-card border border-border rounded-lg p-12 text-center">
        <div className="text-6xl mb-4">📊</div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Advanced Analytics</h3>
        <p className="text-muted-foreground">Detailed analytics dashboard coming soon</p>
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({ title, value, icon }: { title: string; value: string | number; icon: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm text-muted-foreground">{title}</p>
        <span className="text-2xl">{icon}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

// Create Tenant Modal Component
function CreateTenantModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: { name: string; slug: string }) => apiClient.createTenant(data),
    onSuccess: () => {
      onSuccess();
    },
    onError: (error: Error) => {
      alert(`Failed to create tenant: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) {
      alert('Please fill in all fields');
      return;
    }
    createMutation.mutate({ name: name.trim(), slug: slug.trim() });
  };

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value);
    // Auto-generate slug if user hasn't manually edited it
    const autoSlug = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    setSlug(autoSlug);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">Create New Tenant</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name Input */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
              Tenant Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              placeholder="ACME Corporation"
              className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Slug Input */}
          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-foreground mb-2">
              Tenant Slug
            </label>
            <input
              type="text"
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              placeholder="acme-corporation"
              pattern="[a-z0-9-]+"
              title="Lowercase letters, numbers, and hyphens only"
              className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Used in URLs and database schemas (lowercase, hyphens only)
            </p>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              <strong>Note:</strong> Creating a tenant will:
            </p>
            <ul className="text-xs text-blue-800 mt-2 ml-4 list-disc space-y-1">
              <li>Create a dedicated PostgreSQL schema</li>
              <li>Create a Keycloak realm for authentication</li>
              <li>Create a MinIO storage bucket</li>
              <li>This process may take 5-10 seconds</li>
            </ul>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={createMutation.isPending}
              className="flex-1 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Tenant'}
            </button>
          </div>

          {/* Progress Indicator */}
          {createMutation.isPending && (
            <div className="pt-4">
              <div className="flex items-center gap-3">
                <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-primary border-r-transparent"></div>
                <span className="text-sm text-muted-foreground">
                  Provisioning tenant resources...
                </span>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default App;
