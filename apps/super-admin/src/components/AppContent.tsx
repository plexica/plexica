import { useState } from 'react';
import { Button } from '@plexica/ui';
import { LogOut } from 'lucide-react';
import { TabButton } from './TabButton';
import { ThemeToggle } from './ThemeToggle';
import { TenantsView } from './views/TenantsView';
import { PluginsView } from './views/PluginsView';
import { UsersView } from './views/UsersView';
import { AnalyticsView } from './views/AnalyticsView';

interface AppContentProps {
  onLogout: () => void;
}

export function AppContent({ onLogout }: AppContentProps) {
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
              <ThemeToggle />
              <Button onClick={onLogout} variant="danger" size="sm">
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
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
