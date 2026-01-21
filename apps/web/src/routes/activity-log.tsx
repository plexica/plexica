// apps/web/src/routes/activity-log.tsx

import { createFileRoute } from '@tanstack/react-router';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppLayout } from '../components/Layout';
import { useAuthStore } from '../stores/auth-store';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@plexica/ui';
import { Alert, AlertDescription } from '@plexica/ui';
import { AlertCircle, Download } from 'lucide-react';
import { DataTable } from '@plexica/ui';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from '@/components/ToastProvider';

export const Route = createFileRoute('/activity-log')({
  component: ActivityLogPage,
});

// Activity log entry type
interface ActivityLogEntry {
  id: string;
  timestamp: string;
  action: string;
  category: 'plugin' | 'member' | 'settings' | 'workspace' | 'security';
  actor: string;
  actorEmail: string;
  status: 'success' | 'failed' | 'pending';
  details: string;
  ipAddress?: string;
}

function ActivityLogPage() {
  const { tenant } = useAuthStore();
  const [view, setView] = useState<'table' | 'timeline'>('table');

  // Mock activity logs - in production, this would come from an API
  const {
    data: activitiesData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['activity-log', tenant?.id],
    queryFn: async () => {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 300));

      const mockActivities: ActivityLogEntry[] = [
        {
          id: '1',
          timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 min ago
          action: 'Plugin Installed',
          category: 'plugin',
          actor: 'John Doe',
          actorEmail: 'john@example.com',
          status: 'success',
          details: 'Installed "Analytics Dashboard" plugin v2.1.0',
          ipAddress: '192.168.1.100',
        },
        {
          id: '2',
          timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 min ago
          action: 'Member Invited',
          category: 'member',
          actor: 'Sarah Smith',
          actorEmail: 'sarah@example.com',
          status: 'success',
          details: 'Invited alice@example.com as Member',
          ipAddress: '192.168.1.101',
        },
        {
          id: '3',
          timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(), // 45 min ago
          action: 'Settings Updated',
          category: 'settings',
          actor: 'John Doe',
          actorEmail: 'john@example.com',
          status: 'success',
          details: 'Updated workspace name from "Acme" to "Acme Corp"',
          ipAddress: '192.168.1.100',
        },
        {
          id: '4',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
          action: 'Security Policy Changed',
          category: 'security',
          actor: 'Admin User',
          actorEmail: 'admin@example.com',
          status: 'success',
          details: 'Enabled two-factor authentication requirement',
          ipAddress: '192.168.1.102',
        },
        {
          id: '5',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(), // 4 hours ago
          action: 'Plugin Disabled',
          category: 'plugin',
          actor: 'John Doe',
          actorEmail: 'john@example.com',
          status: 'failed',
          details: 'Failed to disable "Email Notifications" plugin - dependency conflict',
          ipAddress: '192.168.1.100',
        },
        {
          id: '6',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
          action: 'Member Role Updated',
          category: 'member',
          actor: 'Sarah Smith',
          actorEmail: 'sarah@example.com',
          status: 'success',
          details: 'Changed bob@example.com role from Member to Admin',
          ipAddress: '192.168.1.101',
        },
      ];

      return { activities: mockActivities };
    },
    enabled: !!tenant?.id,
  });

  const activities: ActivityLogEntry[] = activitiesData?.activities || [];

  const handleExport = () => {
    const csv = [
      ['Timestamp', 'Action', 'Category', 'Actor', 'Status', 'Details', 'IP Address'],
      ...activities.map((a) => [
        new Date(a.timestamp).toLocaleString(),
        a.action,
        a.category,
        a.actor,
        a.status,
        a.details,
        a.ipAddress || 'N/A',
      ]),
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Activity log exported successfully');
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Activity Log</h1>
              <p className="text-muted-foreground">View all workspace activities and changes</p>
            </div>
            <Button onClick={handleExport} variant="outline" size="lg">
              <Download className="h-4 w-4 mr-2" />
              Export Log
            </Button>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>
              <strong className="text-foreground">{activities.length}</strong> total activities
            </span>
            <span>•</span>
            <span>
              <strong className="text-foreground">
                {activities.filter((a) => a.status === 'success').length}
              </strong>{' '}
              successful
            </span>
            <span>•</span>
            <span>
              <strong className="text-foreground">
                {activities.filter((a) => a.status === 'failed').length}
              </strong>{' '}
              failed
            </span>
          </div>
        </div>

        {/* View Toggle */}
        <div className="mb-6 flex gap-2">
          <Button
            variant={view === 'table' ? 'default' : 'outline'}
            onClick={() => setView('table')}
          >
            📋 Table View
          </Button>
          <Button
            variant={view === 'timeline' ? 'default' : 'outline'}
            onClick={() => setView('timeline')}
          >
            📅 Timeline View
          </Button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent mb-4"></div>
              <p className="text-muted-foreground">Loading activity log...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load activity log. Please try again later.
            </AlertDescription>
          </Alert>
        )}

        {/* Empty State */}
        {!isLoading && !error && activities.length === 0 && (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <div className="text-6xl mb-4">📝</div>
            <h3 className="text-xl font-semibold text-foreground mb-2">No activity yet</h3>
            <p className="text-muted-foreground">
              Activity log will appear here as you make changes to your workspace.
            </p>
          </div>
        )}

        {/* Table View */}
        {!isLoading && !error && activities.length > 0 && view === 'table' && (
          <ActivityTable activities={activities} />
        )}

        {/* Timeline View */}
        {!isLoading && !error && activities.length > 0 && view === 'timeline' && (
          <ActivityTimeline activities={activities} />
        )}
      </AppLayout>
    </ProtectedRoute>
  );
}

// Activity Table Component
function ActivityTable({ activities }: { activities: ActivityLogEntry[] }) {
  const columns: ColumnDef<ActivityLogEntry>[] = [
    {
      accessorFn: (row) => new Date(row.timestamp).toLocaleString(),
      id: 'timestamp',
      header: 'Timestamp',
      cell: (info) => {
        const date = new Date(info.row.original.timestamp);
        const relative = getRelativeTime(date);
        return (
          <div className="text-sm">
            <p className="font-medium text-foreground">{date.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{relative}</p>
          </div>
        );
      },
    },
    {
      accessorKey: 'action',
      header: 'Action',
      cell: (info) => {
        const activity = info.row.original;
        const iconMap: Record<string, string> = {
          plugin: '🧩',
          member: '👥',
          settings: '⚙️',
          workspace: '🏢',
          security: '🔒',
        };
        return (
          <div className="flex items-center gap-2">
            <span>{iconMap[activity.category]}</span>
            <span className="font-medium text-foreground">{activity.action}</span>
          </div>
        );
      },
    },
    {
      accessorFn: (row) => `${row.actor} (${row.actorEmail})`,
      id: 'actor',
      header: 'Actor',
      cell: (info) => {
        const activity = info.row.original;
        return (
          <div className="text-sm">
            <p className="font-medium text-foreground">{activity.actor}</p>
            <p className="text-xs text-muted-foreground">{activity.actorEmail}</p>
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: (info) => {
        const status = info.getValue() as string;
        const colors = {
          success: 'bg-green-100 text-green-800',
          failed: 'bg-red-100 text-red-800',
          pending: 'bg-yellow-100 text-yellow-800',
        };
        return (
          <span
            className={`px-2 py-1 text-xs font-medium rounded ${colors[status as keyof typeof colors]}`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        );
      },
    },
    {
      accessorKey: 'details',
      header: 'Details',
      cell: (info) => (
        <p className="text-sm text-muted-foreground max-w-md line-clamp-2">
          {info.getValue() as string}
        </p>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={activities}
      isLoading={false}
      enableSorting
      enableColumnFilters
      enableGlobalFilter
      enablePagination
      pageSize={10}
    />
  );
}

// Activity Timeline Component
function ActivityTimeline({ activities }: { activities: ActivityLogEntry[] }) {
  return (
    <div className="space-y-6">
      {activities.map((activity, index) => {
        const iconMap: Record<string, string> = {
          plugin: '🧩',
          member: '👥',
          settings: '⚙️',
          workspace: '🏢',
          security: '🔒',
        };
        const statusColors = {
          success: 'border-green-500 bg-green-50',
          failed: 'border-red-500 bg-red-50',
          pending: 'border-yellow-500 bg-yellow-50',
        };

        return (
          <div key={activity.id} className="flex gap-4">
            {/* Timeline Line */}
            <div className="relative flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full border-4 flex items-center justify-center text-lg ${statusColors[activity.status]}`}
              >
                {iconMap[activity.category]}
              </div>
              {index !== activities.length - 1 && (
                <div
                  className={`w-1 h-16 border-2 border-dashed ${statusColors[activity.status].split(' ')[0]}`}
                ></div>
              )}
            </div>

            {/* Timeline Content */}
            <div className="flex-1 pt-2 pb-8">
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-semibold text-foreground">{activity.action}</h3>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded ${statusColors[activity.status].split(' ')[1]}`}
                  >
                    {activity.status.charAt(0).toUpperCase() + activity.status.slice(1)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{activity.details}</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {activity.actor} • {new Date(activity.timestamp).toLocaleString()}
                  </span>
                  {activity.ipAddress && <span>IP: {activity.ipAddress}</span>}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Helper function to get relative time
function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}
