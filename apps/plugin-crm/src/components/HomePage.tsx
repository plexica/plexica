// File: apps/plugin-crm/src/components/HomePage.tsx

import React from 'react';
import type { PluginProps } from '@plexica/types';

/**
 * CRM Dashboard - Overview of key metrics
 */
const HomePage: React.FC<PluginProps> = ({ tenantId, userId }) => {
  // Mock data for dashboard stats
  const stats = [
    { label: 'Total Contacts', value: '1,247', change: '+12%', trend: 'up' },
    { label: 'Active Deals', value: '89', change: '+8%', trend: 'up' },
    { label: 'Pipeline Value', value: '$2.4M', change: '+15%', trend: 'up' },
    { label: 'Won This Month', value: '$420K', change: '+23%', trend: 'up' },
  ];

  const recentDeals = [
    { name: 'Acme Corp Deal', value: '$45K', status: 'Negotiation', contact: 'John Smith' },
    { name: 'TechStart Partnership', value: '$120K', status: 'Proposal', contact: 'Sarah Johnson' },
    { name: 'Global Industries', value: '$85K', status: 'Qualified', contact: 'Mike Davis' },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">CRM Dashboard</h1>
        <p className="text-gray-600 mt-1">
          Overview of your sales pipeline and customer relationships
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-lg shadow border border-gray-200">
            <p className="text-sm font-medium text-gray-600">{stat.label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
            <p
              className={`text-sm mt-2 ${stat.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}
            >
              {stat.change} from last month
            </p>
          </div>
        ))}
      </div>

      {/* Recent Deals */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Recent Deals</h2>
          <a
            href="/plugins/crm/deals"
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            View All →
          </a>
        </div>
        <div className="space-y-4">
          {recentDeals.map((deal, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
            >
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">{deal.name}</h3>
                <p className="text-sm text-gray-600">Contact: {deal.contact}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-900">{deal.value}</p>
                <span className="inline-block px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                  {deal.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-8 flex gap-4">
        <a
          href="/plugins/crm/contacts"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          View Contacts
        </a>
        <a
          href="/plugins/crm/deals"
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
        >
          Manage Deals
        </a>
      </div>

      {/* Context Info */}
      <div className="mt-8 p-4 bg-gray-100 rounded text-xs text-gray-600">
        <strong>Plugin Context:</strong> Tenant: {tenantId} | User: {userId}
      </div>
    </div>
  );
};

export default HomePage;
