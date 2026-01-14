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
      <AuthWrapper />
    </QueryClientProvider>
  );
}

// Auth Wrapper - Simple authentication check
function AuthWrapper() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    // Check if user is authenticated (simple localStorage check)
    return localStorage.getItem('super-admin-auth') === 'true';
  });

  const handleLogin = (email: string, password: string) => {
    // Simple mock authentication
    // In production, this would integrate with Keycloak
    if (email === 'admin@plexica.com' && password === 'admin') {
      localStorage.setItem('super-admin-auth', 'true');
      localStorage.setItem('super-admin-email', email);
      setIsAuthenticated(true);
    } else {
      alert('Invalid credentials. Use: admin@plexica.com / admin');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('super-admin-auth');
    localStorage.removeItem('super-admin-email');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return <AppContent onLogout={handleLogout} />;
}

// Login Page Component
function LoginPage({ onLogin }: { onLogin: (email: string, password: string) => void }) {
  const [email, setEmail] = useState('admin@plexica.com');
  const [password, setPassword] = useState('admin');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center px-4">
      <div className="bg-card border border-border rounded-lg p-8 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 bg-primary rounded-lg items-center justify-center text-white font-bold text-2xl mb-4">
            P
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Plexica Super Admin</h1>
          <p className="text-sm text-muted-foreground">Platform Management Console</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="admin@plexica.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            className="w-full px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium"
          >
            Sign In
          </button>
        </form>

        {/* Demo Credentials */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-800">
            <strong>Demo Credentials:</strong>
          </p>
          <p className="text-xs text-blue-700 mt-1">
            Email: <code>admin@plexica.com</code>
            <br />
            Password: <code>admin</code>
          </p>
        </div>

        {/* Note */}
        <p className="text-xs text-muted-foreground text-center mt-6">
          In production, this would integrate with Keycloak SSO
        </p>
      </div>
    </div>
  );
}

function AppContent({ onLogout }: { onLogout: () => void }) {
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
              <span className="text-sm text-muted-foreground">
                {localStorage.getItem('super-admin-email') || 'admin@plexica.com'}
              </span>
              <button
                onClick={onLogout}
                className="px-4 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
              >
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
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'provisioning'>(
    'all'
  );

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

  const allTenants: Tenant[] = tenantsData?.tenants || [];

  // Filter tenants based on search and status
  const tenants = allTenants.filter((tenant) => {
    const matchesSearch =
      tenant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tenant.slug.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || tenant.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

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

      {/* Search and Filters */}
      {!isLoading && !error && (
        <>
          <div className="flex items-center gap-4 mb-6">
            {/* Search Input */}
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Search tenants by name or slug..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 pl-10 bg-card border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                🔍
              </span>
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="provisioning">Provisioning</option>
            </select>

            {/* Clear Filters */}
            {(searchQuery || statusFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <StatCard title="Total Tenants" value={allTenants.length} icon="🏢" />
            <StatCard
              title="Active"
              value={allTenants.filter((t) => t.status === 'active').length}
              icon="✅"
            />
            <StatCard
              title="Suspended"
              value={allTenants.filter((t) => t.status === 'suspended').length}
              icon="⏸️"
            />
            <StatCard
              title="Provisioning"
              value={allTenants.filter((t) => t.status === 'provisioning').length}
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
                        <button
                          onClick={() => setSelectedTenant(tenant)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
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

            {/* Empty State - No Tenants */}
            {allTenants.length === 0 && !isLoading && !error && (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🏢</div>
                <h3 className="text-xl font-semibold text-foreground mb-2">No tenants yet</h3>
                <p className="text-muted-foreground">Create your first tenant to get started</p>
              </div>
            )}

            {/* No Results State - Filtered */}
            {allTenants.length > 0 && tenants.length === 0 && (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🔍</div>
                <h3 className="text-xl font-semibold text-foreground mb-2">No tenants found</h3>
                <p className="text-muted-foreground">Try adjusting your search or filters</p>
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

      {/* Tenant Detail Modal */}
      {selectedTenant && (
        <TenantDetailModal tenant={selectedTenant} onClose={() => setSelectedTenant(null)} />
      )}
    </div>
  );
}

// Plugins View (Marketplace)
function PluginsView() {
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'deprecated'>(
    'all'
  );
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const {
    data: pluginsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => apiClient.getPlugins(),
  });

  const allPlugins: Plugin[] = pluginsData?.plugins || [];

  // Get unique categories
  const categories = Array.from(new Set(allPlugins.map((p) => p.category)));

  // Filter plugins based on search, status, and category
  const plugins = allPlugins.filter((plugin) => {
    const matchesSearch =
      plugin.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plugin.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plugin.author.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || plugin.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || plugin.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

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

      {/* Search and Filters */}
      {!isLoading && !error && (
        <>
          <div className="flex items-center gap-4 mb-6">
            {/* Search Input */}
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Search plugins by name, description, or author..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 pl-10 bg-card border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                🔍
              </span>
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Statuses</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="deprecated">Deprecated</option>
            </select>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            {/* Clear Filters */}
            {(searchQuery || statusFilter !== 'all' || categoryFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setCategoryFilter('all');
                }}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Stats */}
          <div className="mb-6 flex items-center gap-6 text-sm text-muted-foreground">
            <span>
              <strong className="text-foreground">{allPlugins.length}</strong> total plugins
            </span>
            <span>•</span>
            <span>
              <strong className="text-foreground">
                {allPlugins.filter((p) => p.status === 'published').length}
              </strong>{' '}
              published
            </span>
            <span>•</span>
            <span>
              <strong className="text-foreground">{categories.length}</strong> categories
            </span>
            {(searchQuery || statusFilter !== 'all' || categoryFilter !== 'all') && (
              <>
                <span>•</span>
                <span>
                  <strong className="text-foreground">{plugins.length}</strong> results
                </span>
              </>
            )}
          </div>
        </>
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
                    <button
                      onClick={() => setSelectedPlugin(plugin)}
                      className="flex-1 px-3 py-2 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200"
                    >
                      View
                    </button>
                    <button className="flex-1 px-3 py-2 bg-orange-100 text-orange-700 rounded text-sm font-medium hover:bg-orange-200">
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : allPlugins.length === 0 ? (
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
          ) : (
            <div className="bg-card border border-border rounded-lg p-12 text-center">
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-xl font-semibold text-foreground mb-2">No plugins found</h3>
              <p className="text-muted-foreground">Try adjusting your search or filters</p>
            </div>
          )}
        </>
      )}

      {/* Plugin Detail Modal */}
      {selectedPlugin && (
        <PluginDetailModal plugin={selectedPlugin} onClose={() => setSelectedPlugin(null)} />
      )}
    </div>
  );
}

// Users View
function UsersView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [tenantFilter, setTenantFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<any | null>(null);

  // NOTE: Using mock data since backend API endpoint doesn't exist yet
  // In production, this would use: useQuery({ queryKey: ['users'], queryFn: () => apiClient.getUsers() })
  const { data: tenantsData } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => apiClient.getTenants(),
  });

  const tenants = tenantsData?.tenants || [];

  // Mock users data (simulates cross-tenant user list from API)
  const mockUsers = [
    {
      id: '1',
      email: 'john.doe@acme.com',
      name: 'John Doe',
      tenantId: tenants.find((t: any) => t.slug === 'acme-corp')?.id || '1',
      tenantName: 'ACME Corporation',
      tenantSlug: 'acme-corp',
      roles: ['admin', 'user'],
      status: 'active',
      lastLogin: '2026-01-14T10:30:00Z',
      createdAt: '2026-01-10T08:00:00Z',
    },
    {
      id: '2',
      email: 'jane.smith@globex.com',
      name: 'Jane Smith',
      tenantId: tenants.find((t: any) => t.slug === 'globex-inc')?.id || '2',
      tenantName: 'Globex Inc',
      tenantSlug: 'globex-inc',
      roles: ['user'],
      status: 'active',
      lastLogin: '2026-01-14T09:15:00Z',
      createdAt: '2026-01-11T10:00:00Z',
    },
    {
      id: '3',
      email: 'bob.johnson@acme.com',
      name: 'Bob Johnson',
      tenantId: tenants.find((t: any) => t.slug === 'acme-corp')?.id || '1',
      tenantName: 'ACME Corporation',
      tenantSlug: 'acme-corp',
      roles: ['user'],
      status: 'active',
      lastLogin: '2026-01-13T16:45:00Z',
      createdAt: '2026-01-12T14:00:00Z',
    },
    {
      id: '4',
      email: 'alice.williams@demo.com',
      name: 'Alice Williams',
      tenantId: tenants.find((t: any) => t.slug === 'demo-company')?.id || '3',
      tenantName: 'Demo Company',
      tenantSlug: 'demo-company',
      roles: ['admin', 'user'],
      status: 'active',
      lastLogin: '2026-01-14T11:00:00Z',
      createdAt: '2026-01-09T09:00:00Z',
    },
    {
      id: '5',
      email: 'charlie.brown@globex.com',
      name: 'Charlie Brown',
      tenantId: tenants.find((t: any) => t.slug === 'globex-inc')?.id || '2',
      tenantName: 'Globex Inc',
      tenantSlug: 'globex-inc',
      roles: ['admin', 'user'],
      status: 'active',
      lastLogin: '2026-01-12T14:30:00Z',
      createdAt: '2026-01-08T11:00:00Z',
    },
  ];

  // Filter users
  const allUsers = mockUsers;
  const users = allUsers.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.tenantName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTenant = tenantFilter === 'all' || user.tenantSlug === tenantFilter;
    const matchesRole = roleFilter === 'all' || user.roles.includes(roleFilter);

    return matchesSearch && matchesTenant && matchesRole;
  });

  // Get unique roles
  const allRoles = Array.from(new Set(allUsers.flatMap((u) => u.roles)));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-1">Platform Users</h2>
          <p className="text-muted-foreground">View all users across all tenants</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center gap-4 mb-6">
        {/* Search Input */}
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search users by name, email, or tenant..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 pl-10 bg-card border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">🔍</span>
        </div>

        {/* Tenant Filter */}
        <select
          value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)}
          className="px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">All Tenants</option>
          {tenants.map((tenant: any) => (
            <option key={tenant.id} value={tenant.slug}>
              {tenant.name}
            </option>
          ))}
        </select>

        {/* Role Filter */}
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="all">All Roles</option>
          {allRoles.map((role) => (
            <option key={role} value={role}>
              {role.charAt(0).toUpperCase() + role.slice(1)}
            </option>
          ))}
        </select>

        {/* Clear Filters */}
        {(searchQuery || tenantFilter !== 'all' || roleFilter !== 'all') && (
          <button
            onClick={() => {
              setSearchQuery('');
              setTenantFilter('all');
              setRoleFilter('all');
            }}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="mb-6 flex items-center gap-6 text-sm text-muted-foreground">
        <span>
          <strong className="text-foreground">{allUsers.length}</strong> total users
        </span>
        <span>•</span>
        <span>
          <strong className="text-foreground">{tenants.length}</strong> tenants
        </span>
        <span>•</span>
        <span>
          <strong className="text-foreground">{allRoles.length}</strong> roles
        </span>
        {(searchQuery || tenantFilter !== 'all' || roleFilter !== 'all') && (
          <>
            <span>•</span>
            <span>
              <strong className="text-foreground">{users.length}</strong> results
            </span>
          </>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                Tenant
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                Roles
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                Last Login
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-6 py-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div>
                    <p className="text-sm text-foreground">{user.tenantName}</p>
                    <p className="text-xs text-muted-foreground">{user.tenantSlug}</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-1">
                    {user.roles.map((role) => (
                      <span
                        key={role}
                        className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-muted-foreground">
                  {new Date(user.lastLogin).toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => setSelectedUser(user)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Empty State - No Users */}
        {allUsers.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">👥</div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No users yet</h3>
            <p className="text-muted-foreground">Users will appear here once tenants are created</p>
          </div>
        )}

        {/* No Results State - Filtered */}
        {allUsers.length > 0 && users.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No users found</h3>
            <p className="text-muted-foreground">Try adjusting your search or filters</p>
          </div>
        )}
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <UserDetailModal user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  );
}

// Analytics View
function AnalyticsView() {
  const [timePeriod, setTimePeriod] = useState<'24h' | '7d' | '30d'>('7d');

  const { data: tenantsData } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => apiClient.getTenants(),
  });

  const { data: pluginsData } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => apiClient.getPlugins(),
  });

  const tenants = tenantsData?.tenants || [];
  const plugins = pluginsData?.plugins || [];

  // Mock analytics data
  const mockStats = {
    totalTenants: tenants.length,
    activeTenants: tenants.filter((t: any) => t.status === 'active').length,
    totalUsers: 5, // From mock users
    totalPlugins: plugins.length,
    apiCalls24h: 12543,
    avgResponseTime: 45, // ms
    errorRate: 0.2, // %
  };

  // Mock tenant growth data
  const tenantGrowthData = [
    { date: '2026-01-08', count: 1 },
    { date: '2026-01-09', count: 2 },
    { date: '2026-01-10', count: 3 },
    { date: '2026-01-11', count: 3 },
    { date: '2026-01-12', count: 4 },
    { date: '2026-01-13', count: 4 },
    { date: '2026-01-14', count: 4 },
  ];

  // Mock API calls data
  const apiCallsData = [
    { hour: '00:00', calls: 450 },
    { hour: '04:00', calls: 320 },
    { hour: '08:00', calls: 890 },
    { hour: '12:00', calls: 1250 },
    { hour: '16:00', calls: 1680 },
    { hour: '20:00', calls: 980 },
  ];

  // Calculate max values for chart scaling
  const maxApiCalls = Math.max(...apiCallsData.map((d) => d.calls));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-1">Platform Analytics</h2>
          <p className="text-muted-foreground">Monitor platform-wide metrics and performance</p>
        </div>
        {/* Time Period Selector */}
        <select
          value={timePeriod}
          onChange={(e) => setTimePeriod(e.target.value as typeof timePeriod)}
          className="px-4 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
        </select>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Tenants" value={mockStats.totalTenants} icon="🏢" />
        <StatCard title="Total Users" value={mockStats.totalUsers} icon="👥" />
        <StatCard title="Active Plugins" value={mockStats.totalPlugins} icon="🧩" />
        <StatCard
          title="API Calls (24h)"
          value={mockStats.apiCalls24h.toLocaleString()}
          icon="📊"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground mb-1">Avg Response Time</p>
          <p className="text-2xl font-bold text-foreground">{mockStats.avgResponseTime}ms</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground mb-1">Error Rate</p>
          <p className="text-2xl font-bold text-foreground">{mockStats.errorRate}%</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground mb-1">Active Tenants</p>
          <p className="text-2xl font-bold text-foreground">{mockStats.activeTenants}</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Tenant Growth Chart */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Tenant Growth</h3>
          <div className="space-y-2">
            {tenantGrowthData.map((data, index) => (
              <div key={data.date} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-20">
                  {new Date(data.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <div className="flex-1 bg-muted rounded-full h-8 overflow-hidden">
                  <div
                    className="bg-primary h-full flex items-center justify-end pr-2 transition-all"
                    style={{
                      width: `${(data.count / Math.max(...tenantGrowthData.map((d) => d.count))) * 100}%`,
                    }}
                  >
                    <span className="text-xs font-medium text-white">{data.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* API Calls Chart */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">API Calls (24h)</h3>
          <div className="space-y-2">
            {apiCallsData.map((data) => (
              <div key={data.hour} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-12">{data.hour}</span>
                <div className="flex-1 bg-muted rounded-full h-8 overflow-hidden">
                  <div
                    className="bg-blue-500 h-full flex items-center justify-end pr-2 transition-all"
                    style={{ width: `${(data.calls / maxApiCalls) * 100}%` }}
                  >
                    <span className="text-xs font-medium text-white">
                      {data.calls.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Plugin Usage Table */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Plugin Usage</h3>
        <div className="space-y-3">
          {plugins.slice(0, 5).map((plugin: any) => (
            <div key={plugin.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{plugin.icon || '🧩'}</span>
                <div>
                  <p className="text-sm font-medium text-foreground">{plugin.name}</p>
                  <p className="text-xs text-muted-foreground">{plugin.category}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-foreground">- installs</p>
                <p className="text-xs text-muted-foreground">No data</p>
              </div>
            </div>
          ))}
          {plugins.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No plugins available</p>
          )}
        </div>
      </div>

      {/* Note about mock data */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> This analytics dashboard displays mock data for demonstration
          purposes. In production, these metrics would be fetched from the backend API endpoints:
        </p>
        <ul className="text-xs text-blue-700 mt-2 ml-4 list-disc space-y-1">
          <li>
            <code>/api/admin/analytics/overview</code> - Platform-wide statistics
          </li>
          <li>
            <code>/api/admin/analytics/tenants</code> - Tenant growth data
          </li>
          <li>
            <code>/api/admin/analytics/api-calls</code> - API usage metrics
          </li>
          <li>
            <code>/api/admin/analytics/plugins</code> - Plugin installation stats
          </li>
        </ul>
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

// Plugin Detail Modal Component
function PluginDetailModal({ plugin, onClose }: { plugin: Plugin; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center text-2xl">
                {plugin.icon || '🧩'}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground">{plugin.name}</h2>
                <p className="text-sm text-muted-foreground">v{plugin.version}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status and Category */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Status:</span>
              <span
                className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
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
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Category:</span>
              <span className="text-sm text-foreground">{plugin.category}</span>
            </div>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">Description</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{plugin.description}</p>
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Plugin ID</p>
              <p className="text-sm text-foreground font-mono">{plugin.id}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Author</p>
              <p className="text-sm text-foreground">{plugin.author}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Version</p>
              <p className="text-sm text-foreground font-mono">{plugin.version}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Published</p>
              <p className="text-sm text-foreground">
                {new Date(plugin.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Technical Info */}
          {plugin.entryPoint && (
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Technical Details</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Entry Point:</span>
                  <span className="text-foreground font-mono text-xs">{plugin.entryPoint}</span>
                </div>
              </div>
            </div>
          )}

          {/* Installation Statistics */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Statistics</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Installs</p>
                <p className="text-xl font-bold text-foreground">-</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Active Users</p>
                <p className="text-xl font-bold text-foreground">-</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Rating</p>
                <p className="text-xl font-bold text-foreground">-</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Detailed statistics coming in future release
            </p>
          </div>

          {/* Actions */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Actions</h3>
            <div className="flex gap-3">
              <button className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors text-sm font-medium">
                Edit Plugin
              </button>
              <button className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium">
                View Installations
              </button>
              {plugin.status === 'published' && (
                <button className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium">
                  Deprecate
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// User Detail Modal Component
function UserDetailModal({ user, onClose }: { user: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">{user.name}</h2>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status Badge */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Status:</span>
            <span className="inline-flex px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
              {user.status}
            </span>
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">User ID</p>
              <p className="text-sm text-foreground font-mono">{user.id}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Email</p>
              <p className="text-sm text-foreground">{user.email}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Tenant</p>
              <p className="text-sm text-foreground">{user.tenantName}</p>
              <p className="text-xs text-muted-foreground">{user.tenantSlug}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Roles</p>
              <div className="flex gap-1 flex-wrap">
                {user.roles.map((role: string) => (
                  <span
                    key={role}
                    className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Activity Info */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Activity</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Created:</span>
                <span className="text-foreground">{new Date(user.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Last Login:</span>
                <span className="text-foreground">{new Date(user.lastLogin).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Actions</h3>
            <div className="flex gap-3">
              <button className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium">
                View in Keycloak
              </button>
              <button className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors text-sm font-medium">
                Manage Roles
              </button>
              <button className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium">
                Suspend User
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Tenant Detail Modal Component
function TenantDetailModal({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">{tenant.name}</h2>
              <p className="text-sm text-muted-foreground">{tenant.slug}</p>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status Badge */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Status:</span>
            <span
              className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
                tenant.status === 'active'
                  ? 'bg-green-100 text-green-700'
                  : tenant.status === 'suspended'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-orange-100 text-orange-700'
              }`}
            >
              {tenant.status}
            </span>
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Tenant ID</p>
              <p className="text-sm text-foreground font-mono">{tenant.id}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Created At</p>
              <p className="text-sm text-foreground">
                {new Date(tenant.createdAt).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Updated At</p>
              <p className="text-sm text-foreground">
                {new Date(tenant.updatedAt).toLocaleString()}
              </p>
            </div>
            {tenant.suspendedAt && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Suspended At</p>
                <p className="text-sm text-foreground">
                  {new Date(tenant.suspendedAt).toLocaleString()}
                </p>
              </div>
            )}
          </div>

          {/* Infrastructure Info */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Infrastructure</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Database Schema:</span>
                <span className="text-foreground font-mono">{tenant.slug}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Keycloak Realm:</span>
                <span className="text-foreground font-mono">{tenant.slug}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">MinIO Bucket:</span>
                <span className="text-foreground font-mono">{tenant.slug}</span>
              </div>
            </div>
          </div>

          {/* Statistics Placeholder */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Statistics</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Members</p>
                <p className="text-xl font-bold text-foreground">-</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Plugins</p>
                <p className="text-xl font-bold text-foreground">-</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">API Calls</p>
                <p className="text-xl font-bold text-foreground">-</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Detailed statistics coming in future release
            </p>
          </div>

          {/* Actions */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Actions</h3>
            <div className="flex gap-3">
              <button className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium">
                View Details
              </button>
              <button className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors text-sm font-medium">
                Manage Settings
              </button>
              {tenant.status === 'active' ? (
                <button className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium">
                  Suspend Tenant
                </button>
              ) : tenant.status === 'suspended' ? (
                <button className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm font-medium">
                  Activate Tenant
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
