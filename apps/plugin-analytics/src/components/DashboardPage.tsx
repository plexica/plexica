// File: apps/plugin-analytics/src/components/DashboardPage.tsx

import React from 'react';

export interface PluginProps {
  tenantId: string;
  userId: string;
  workspaceId?: string;
}

/**
 * Analytics Dashboard - Overview of key metrics and charts
 */
const DashboardPage: React.FC<PluginProps> = ({ tenantId, userId }) => {
  // Mock data for analytics
  const metrics = [
    { label: 'Total Revenue', value: '$2.4M', change: '+18.2%', trend: 'up' },
    { label: 'Active Users', value: '12,482', change: '+12.5%', trend: 'up' },
    { label: 'Conversion Rate', value: '24.8%', change: '+3.1%', trend: 'up' },
    { label: 'Avg. Session Time', value: '4m 32s', change: '-5.3%', trend: 'down' },
  ];

  const revenueByMonth = [
    { month: 'Jul', value: 180 },
    { month: 'Aug', value: 220 },
    { month: 'Sep', value: 195 },
    { month: 'Oct', value: 240 },
    { month: 'Nov', value: 280 },
    { month: 'Dec', value: 310 },
    { month: 'Jan', value: 420 },
  ];

  const topSources = [
    { name: 'Organic Search', users: 4580, percentage: 37 },
    { name: 'Direct', users: 3240, percentage: 26 },
    { name: 'Social Media', users: 2890, percentage: 23 },
    { name: 'Referral', users: 1772, percentage: 14 },
  ];

  const maxRevenue = Math.max(...revenueByMonth.map((d) => d.value));

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
        <p className="text-gray-600 mt-1">
          Track performance metrics and insights across your platform
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {metrics.map((metric) => (
          <div key={metric.label} className="bg-white p-6 rounded-lg shadow border border-gray-200">
            <p className="text-sm font-medium text-gray-600">{metric.label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{metric.value}</p>
            <p
              className={`text-sm mt-2 font-medium ${
                metric.trend === 'up' ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {metric.change} from last month
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Revenue Chart */}
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Revenue Trend</h2>
            <select className="text-sm border border-gray-300 rounded px-3 py-1">
              <option>Last 7 months</option>
              <option>Last 12 months</option>
              <option>This year</option>
            </select>
          </div>

          {/* Simple Bar Chart */}
          <div className="space-y-3">
            {revenueByMonth.map((data) => (
              <div key={data.month} className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-600 w-12">{data.month}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-8 relative overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full flex items-center justify-end pr-3 transition-all"
                    style={{ width: `${(data.value / maxRevenue) * 100}%` }}
                  >
                    <span className="text-xs font-medium text-white">${data.value}K</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Traffic Sources */}
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Top Traffic Sources</h2>
          <div className="space-y-4">
            {topSources.map((source, index) => (
              <div key={source.name}>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        index === 0
                          ? 'bg-blue-600'
                          : index === 1
                            ? 'bg-green-600'
                            : index === 2
                              ? 'bg-yellow-600'
                              : 'bg-purple-600'
                      }`}
                    />
                    <span className="text-sm font-medium text-gray-900">{source.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-gray-900">
                      {source.users.toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-600 ml-2">{source.percentage}%</span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      index === 0
                        ? 'bg-blue-600'
                        : index === 1
                          ? 'bg-green-600'
                          : index === 2
                            ? 'bg-yellow-600'
                            : 'bg-purple-600'
                    }`}
                    style={{ width: `${source.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Recent Activity</h2>
          <a
            href="/plugins/analytics/reports"
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            View All Reports →
          </a>
        </div>
        <div className="space-y-3">
          {[
            { event: 'New user registration spike', time: '2 hours ago', type: 'positive' },
            { event: 'Page load time increased', time: '5 hours ago', type: 'warning' },
            { event: 'Revenue goal achieved', time: '1 day ago', type: 'positive' },
            { event: 'Weekly report generated', time: '2 days ago', type: 'neutral' },
          ].map((activity, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-2 h-2 rounded-full ${
                    activity.type === 'positive'
                      ? 'bg-green-500'
                      : activity.type === 'warning'
                        ? 'bg-yellow-500'
                        : 'bg-gray-400'
                  }`}
                />
                <span className="text-sm text-gray-900">{activity.event}</span>
              </div>
              <span className="text-xs text-gray-500">{activity.time}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Context Info */}
      <div className="mt-8 p-4 bg-gray-100 rounded text-xs text-gray-600">
        <strong>Plugin Context:</strong> Tenant: {tenantId} | User: {userId}
      </div>
    </div>
  );
};

export default DashboardPage;
