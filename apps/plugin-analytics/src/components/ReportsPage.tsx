// File: apps/plugin-analytics/src/components/ReportsPage.tsx

import React, { useState } from 'react';
import type { PluginProps } from '@plexica/types';

interface Report {
  id: number;
  name: string;
  type: string;
  lastRun: string;
  status: 'completed' | 'running' | 'failed';
  size: string;
}

/**
 * Reports Page - Generate and manage analytics reports
 */
const ReportsPage: React.FC<PluginProps> = ({ tenantId }) => {
  const [reports] = useState<Report[]>([
    {
      id: 1,
      name: 'Monthly Revenue Summary',
      type: 'Financial',
      lastRun: '2026-01-22 08:30',
      status: 'completed',
      size: '2.4 MB',
    },
    {
      id: 2,
      name: 'User Activity Report',
      type: 'Engagement',
      lastRun: '2026-01-22 06:00',
      status: 'completed',
      size: '1.8 MB',
    },
    {
      id: 3,
      name: 'Sales Pipeline Analysis',
      type: 'Sales',
      lastRun: '2026-01-21 23:45',
      status: 'completed',
      size: '3.2 MB',
    },
    {
      id: 4,
      name: 'Customer Segmentation',
      type: 'Marketing',
      lastRun: '2026-01-21 18:20',
      status: 'running',
      size: '—',
    },
    {
      id: 5,
      name: 'Performance Metrics',
      type: 'Technical',
      lastRun: '2026-01-21 14:15',
      status: 'completed',
      size: '892 KB',
    },
  ]);

  const reportTemplates = [
    {
      name: 'Revenue Analysis',
      description: 'Comprehensive revenue breakdown and trends',
      icon: '💰',
    },
    { name: 'User Insights', description: 'User behavior and engagement analytics', icon: '👥' },
    {
      name: 'Conversion Funnel',
      description: 'Track user journey and conversion rates',
      icon: '🎯',
    },
    { name: 'Custom Report', description: 'Build a custom report with your metrics', icon: '📊' },
  ];

  const getStatusColor = (status: Report['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-600 mt-1">Generate, schedule, and export analytics reports</p>
      </div>

      {/* Report Templates */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New Report</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {reportTemplates.map((template) => (
            <button
              key={template.name}
              className="bg-white p-4 rounded-lg shadow border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all text-left"
            >
              <div className="text-3xl mb-2">{template.icon}</div>
              <h3 className="font-semibold text-gray-900 mb-1">{template.name}</h3>
              <p className="text-sm text-gray-600">{template.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <p className="text-sm text-gray-600">Total Reports</p>
          <p className="text-2xl font-bold text-gray-900">{reports.length}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <p className="text-sm text-gray-600">Reports This Month</p>
          <p className="text-2xl font-bold text-gray-900">24</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <p className="text-sm text-gray-600">Scheduled Reports</p>
          <p className="text-2xl font-bold text-gray-900">8</p>
        </div>
      </div>

      {/* Recent Reports */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">Recent Reports</h2>
            <div className="flex gap-2">
              <button className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50">
                Filter
              </button>
              <button className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50">
                Sort
              </button>
            </div>
          </div>
        </div>

        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Report Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Run
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Size
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {reports.map((report) => (
              <tr key={report.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="text-sm font-medium text-gray-900">{report.name}</div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{report.type}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-600">{report.lastRun}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                      report.status
                    )}`}
                  >
                    {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{report.size}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button className="text-blue-600 hover:text-blue-900 mr-3">View</button>
                  <button className="text-blue-600 hover:text-blue-900 mr-3">Download</button>
                  <button className="text-gray-600 hover:text-gray-900">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Export Options */}
      <div className="mt-8 bg-white p-6 rounded-lg shadow border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Export Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Export Format</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <option>PDF</option>
              <option>Excel (XLSX)</option>
              <option>CSV</option>
              <option>JSON</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <option>Last 7 days</option>
              <option>Last 30 days</option>
              <option>Last 90 days</option>
              <option>Custom range</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Schedule</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <option>One-time</option>
              <option>Daily</option>
              <option>Weekly</option>
              <option>Monthly</option>
            </select>
          </div>
        </div>
        <button className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
          Generate Report
        </button>
      </div>

      {/* Context Info */}
      <div className="mt-8 p-4 bg-gray-100 rounded text-xs text-gray-600">
        <strong>Plugin Context:</strong> Tenant: {tenantId} | Showing {reports.length} reports
      </div>
    </div>
  );
};

export default ReportsPage;
