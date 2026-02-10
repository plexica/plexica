// File: apps/plugin-template-frontend/src/pages/HomePage.tsx

import React from 'react';
import type { PluginProps } from '@plexica/types';
import type { ColumnDef } from '@plexica/ui';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  DataTable,
} from '@plexica/ui';
import { Package, Settings, TrendingUp, Users } from 'lucide-react';

// ---------------------------------------------------------------------------
// Sample data — replace with real API calls in your plugin
// ---------------------------------------------------------------------------

interface StatCard {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
}

interface RecentItem {
  id: string;
  name: string;
  status: 'active' | 'pending' | 'completed';
  date: string;
  assignee: string;
}

const STATS: StatCard[] = [
  {
    title: 'Total Items',
    value: '1,284',
    description: '+12% from last month',
    icon: <Package className="h-4 w-4 text-muted-foreground" />,
    trend: 'up',
  },
  {
    title: 'Active Users',
    value: '342',
    description: '+3% from last week',
    icon: <Users className="h-4 w-4 text-muted-foreground" />,
    trend: 'up',
  },
  {
    title: 'Completion Rate',
    value: '87.4%',
    description: '-1.2% from last month',
    icon: <TrendingUp className="h-4 w-4 text-muted-foreground" />,
    trend: 'down',
  },
];

const SAMPLE_DATA: RecentItem[] = [
  { id: '1', name: 'Project Alpha', status: 'active', date: '2026-02-10', assignee: 'Alice' },
  { id: '2', name: 'Project Beta', status: 'pending', date: '2026-02-09', assignee: 'Bob' },
  { id: '3', name: 'Project Gamma', status: 'completed', date: '2026-02-08', assignee: 'Carol' },
  { id: '4', name: 'Project Delta', status: 'active', date: '2026-02-07', assignee: 'Dave' },
  { id: '5', name: 'Project Epsilon', status: 'pending', date: '2026-02-06', assignee: 'Eve' },
];

const STATUS_VARIANT: Record<RecentItem['status'], 'success' | 'warning' | 'secondary'> = {
  active: 'success',
  pending: 'warning',
  completed: 'secondary',
};

// ---------------------------------------------------------------------------
// Table columns — demonstrates DataTable + Badge usage
// ---------------------------------------------------------------------------

const columns: ColumnDef<RecentItem, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.getValue<RecentItem['status']>('status');
      return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
    },
  },
  {
    accessorKey: 'assignee',
    header: 'Assignee',
  },
  {
    accessorKey: 'date',
    header: 'Date',
  },
];

// ---------------------------------------------------------------------------
// HomePage component
// ---------------------------------------------------------------------------

/**
 * Example dashboard page built entirely with `@plexica/ui` components.
 *
 * Demonstrates:
 * - `Card` (with `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`)
 * - `Badge` (status variants)
 * - `Button` (primary + outline)
 * - `DataTable` (sortable, paginated, with custom cell renderers)
 *
 * Replace the sample data with real API calls for your plugin.
 */
export const HomePage: React.FC<PluginProps> = ({ tenantId, userId, workspaceId }) => {
  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plugin Template</h1>
          <p className="text-sm text-muted-foreground">
            Dashboard overview for your plugin. Built with @plexica/ui components.
          </p>
        </div>
        <Button variant="outline" size="sm">
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </Button>
      </div>

      {/* Context info */}
      <Card>
        <CardHeader>
          <CardTitle>Plugin Context</CardTitle>
          <CardDescription>
            These values are injected by the host application via Module Federation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Badge variant="outline">Tenant: {tenantId}</Badge>
            <Badge variant="outline">User: {userId}</Badge>
            {workspaceId && <Badge variant="outline">Workspace: {workspaceId}</Badge>}
          </div>
        </CardContent>
      </Card>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {STATS.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              {stat.icon}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Data table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Items</CardTitle>
          <CardDescription>
            A sortable, searchable table powered by DataTable from @plexica/ui.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={SAMPLE_DATA}
            enableSorting
            enableGlobalFilter
            enablePagination
            pageSize={5}
          />
        </CardContent>
      </Card>
    </div>
  );
};
