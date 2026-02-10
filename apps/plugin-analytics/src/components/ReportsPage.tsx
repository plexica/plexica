// File: apps/plugin-analytics/src/components/ReportsPage.tsx

import React, { useState } from 'react';
import type { PluginProps } from '@plexica/types';
import type { ColumnDef } from '@plexica/ui';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  StatCard,
} from '@plexica/ui';
import { BarChart3, Calendar, Download, FileText, Plus, Target, Users } from 'lucide-react';

interface Report {
  id: number;
  name: string;
  type: string;
  lastRun: string;
  status: 'completed' | 'running' | 'failed';
  size: string;
}

const STATUS_VARIANT: Record<Report['status'], 'success' | 'default' | 'danger'> = {
  completed: 'success',
  running: 'default',
  failed: 'danger',
};

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
      icon: <BarChart3 className="h-6 w-6 text-muted-foreground" />,
    },
    {
      name: 'User Insights',
      description: 'User behavior and engagement analytics',
      icon: <Users className="h-6 w-6 text-muted-foreground" />,
    },
    {
      name: 'Conversion Funnel',
      description: 'Track user journey and conversion rates',
      icon: <Target className="h-6 w-6 text-muted-foreground" />,
    },
    {
      name: 'Custom Report',
      description: 'Build a custom report with your metrics',
      icon: <FileText className="h-6 w-6 text-muted-foreground" />,
    },
  ];

  const columns: ColumnDef<Report, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Report Name',
      cell: ({ row }) => <span className="font-medium">{row.getValue<string>('name')}</span>,
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => <Badge variant="outline">{row.getValue<string>('type')}</Badge>,
    },
    {
      accessorKey: 'lastRun',
      header: 'Last Run',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.getValue<string>('lastRun')}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue<Report['status']>('status');
        return (
          <Badge variant={STATUS_VARIANT[status]}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'size',
      header: 'Size',
      cell: ({ row }) => (
        <span className="text-muted-foreground">{row.getValue<string>('size')}</span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: () => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm">
            View
          </Button>
          <Button variant="ghost" size="sm">
            <Download className="mr-1 h-3.5 w-3.5" />
            Download
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Generate, schedule, and export analytics reports
        </p>
      </div>

      {/* Report Templates */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Create New Report</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {reportTemplates.map((template) => (
            <Card
              key={template.name}
              className="cursor-pointer transition-all hover:border-primary hover:shadow-md"
            >
              <CardContent className="p-4">
                <div className="mb-2">{template.icon}</div>
                <h3 className="mb-1 font-semibold text-foreground">{template.name}</h3>
                <p className="text-sm text-muted-foreground">{template.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          label="Total Reports"
          value={reports.length}
          icon={<FileText className="h-5 w-5" />}
        />
        <StatCard label="Reports This Month" value={24} icon={<Calendar className="h-5 w-5" />} />
        <StatCard label="Scheduled Reports" value={8} />
      </div>

      {/* Recent Reports Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Reports</CardTitle>
          <CardDescription>View, download, and manage your generated reports</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={reports}
            enableSorting
            enableGlobalFilter
            enablePagination
            pageSize={10}
          />
        </CardContent>
      </Card>

      {/* Export Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Export Settings</CardTitle>
          <CardDescription>Configure and generate a new report</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Export Format</Label>
              <Select defaultValue="pdf">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="json">JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date Range</Label>
              <Select defaultValue="30days">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7days">Last 7 days</SelectItem>
                  <SelectItem value="30days">Last 30 days</SelectItem>
                  <SelectItem value="90days">Last 90 days</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Schedule</Label>
              <Select defaultValue="once">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">One-time</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Separator className="my-4" />
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Generate Report
          </Button>
        </CardContent>
      </Card>

      {/* Context Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <Badge variant="outline">Tenant: {tenantId}</Badge>
            <Badge variant="outline">Showing {reports.length} reports</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReportsPage;
