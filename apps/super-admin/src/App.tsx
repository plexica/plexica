// apps/super-admin/src/App.tsx

import { useState } from 'react';

function App() {
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
  const tenants = [
    {
      id: '1',
      name: 'ACME Corporation',
      slug: 'acme-corp',
      status: 'active',
      members: 12,
      plugins: 5,
      createdAt: '2024-01-15',
    },
    {
      id: '2',
      name: 'Globex Inc',
      slug: 'globex-inc',
      status: 'active',
      members: 8,
      plugins: 3,
      createdAt: '2024-02-20',
    },
    {
      id: '3',
      name: 'Demo Company',
      slug: 'demo-company',
      status: 'active',
      members: 5,
      plugins: 2,
      createdAt: '2024-03-10',
    },
    {
      id: '4',
      name: 'TestCorp',
      slug: 'testcorp',
      status: 'suspended',
      members: 3,
      plugins: 1,
      createdAt: '2024-01-05',
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-1">Tenant Management</h2>
          <p className="text-muted-foreground">View and manage all workspace tenants</p>
        </div>
        <button className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium">
          + Create Tenant
        </button>
      </div>

      {/* Stats */}
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
          title="Total Members"
          value={tenants.reduce((acc, t) => acc + t.members, 0)}
          icon="👥"
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
                Members
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                Plugins
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
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {tenant.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-foreground">{tenant.members}</td>
                <td className="px-6 py-4 text-sm text-foreground">{tenant.plugins}</td>
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
                      <button className="text-red-600 hover:text-red-800 text-sm font-medium">
                        Suspend
                      </button>
                    ) : (
                      <button className="text-green-600 hover:text-green-800 text-sm font-medium">
                        Activate
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Plugins View (Marketplace)
function PluginsView() {
  const plugins = [
    {
      id: '1',
      name: 'Analytics Dashboard',
      version: '2.1.0',
      category: 'Analytics',
      status: 'published',
      installs: 45,
      author: 'Plexica',
    },
    {
      id: '2',
      name: 'CRM Integration',
      version: '1.5.2',
      category: 'Integration',
      status: 'published',
      installs: 32,
      author: 'Third Party',
    },
    {
      id: '3',
      name: 'Reporting Suite',
      version: '3.0.1',
      category: 'Reports',
      status: 'published',
      installs: 28,
      author: 'Plexica',
    },
  ];

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plugins.map((plugin) => (
          <div key={plugin.id} className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center text-2xl">
                🧩
              </div>
              <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                {plugin.status}
              </span>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">{plugin.name}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              v{plugin.version} • {plugin.category}
            </p>
            <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
              <span>{plugin.installs} installs</span>
              <span>By {plugin.author}</span>
            </div>
            <div className="flex gap-2">
              <button className="flex-1 px-3 py-2 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200">
                Edit
              </button>
              <button className="flex-1 px-3 py-2 bg-red-100 text-red-700 rounded text-sm font-medium hover:bg-red-200">
                Unpublish
              </button>
            </div>
          </div>
        ))}
      </div>
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
        <StatCard title="Total Tenants" value="142" icon="🏢" />
        <StatCard title="Total Users" value="1,847" icon="👥" />
        <StatCard title="Active Plugins" value="23" icon="🧩" />
        <StatCard title="API Calls (24h)" value="45.2k" icon="📊" />
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

export default App;
