import { Card } from '@plexica/ui';
import { useAnalytics } from '@/hooks';
import { StatCard } from '../tenants/StatCard';

export function AnalyticsView() {
  const {
    stats,
    tenantGrowthData,
    apiCallsData,
    plugins,
    timePeriod,
    setTimePeriod,
    maxTenantGrowth,
    maxApiCalls,
  } = useAnalytics();

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
        <StatCard title="Total Tenants" value={stats.totalTenants} icon="🏢" />
        <StatCard title="Total Users" value={stats.totalUsers} icon="👥" />
        <StatCard title="Active Plugins" value={stats.totalPlugins} icon="🧩" />
        <StatCard title="API Calls (24h)" value={stats.apiCalls24h.toLocaleString()} icon="📊" />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Avg Response Time</p>
          <p className="text-2xl font-bold text-foreground">{stats.avgResponseTime}ms</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Error Rate</p>
          <p className="text-2xl font-bold text-foreground">{stats.errorRate}%</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Active Tenants</p>
          <p className="text-2xl font-bold text-foreground">{stats.activeTenants}</p>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Tenant Growth Chart */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Tenant Growth</h3>
          <div className="space-y-2">
            {tenantGrowthData.map((data) => (
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
                      width: `${(data.count / maxTenantGrowth) * 100}%`,
                    }}
                  >
                    <span className="text-xs font-medium text-white">{data.count}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* API Calls Chart */}
        <Card className="p-6">
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
        </Card>
      </div>

      {/* Plugin Usage Table */}
      <Card className="p-6 mb-6">
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
      </Card>

      {/* Note about mock data */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <p className="text-sm text-blue-800 mb-2">
          <strong>Note:</strong> This analytics dashboard displays mock data for demonstration
          purposes. In production, these metrics would be fetched from the backend API endpoints:
        </p>
        <ul className="text-xs text-blue-700 ml-4 list-disc space-y-1">
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
      </Card>
    </div>
  );
}
