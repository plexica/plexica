// apps/web/src/routes/index.tsx

import { createFileRoute } from '@tanstack/react-router';
import { useNavigate } from '@tanstack/react-router';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { AppLayout } from '../components/Layout';
import { useAuthStore } from '../stores/auth-store';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import { Card, CardContent } from '@plexica/ui';
import { Button } from '@plexica/ui';
import { Badge } from '@plexica/ui';
import { CardSkeleton } from '@plexica/ui';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  const { tenant } = useAuthStore();
  const navigate = useNavigate();

  // Fetch tenant plugins
  const { data: pluginsData, isLoading } = useQuery({
    queryKey: ['tenant-plugins', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return { plugins: [] };
      return await apiClient.getTenantPlugins(tenant.id);
    },
    enabled: !!tenant?.id,
  });

  const installedPlugins = pluginsData?.plugins || [];
  const activePlugins = installedPlugins.filter((p: any) => p.status === 'ACTIVE');

  return (
    <ProtectedRoute>
      <AppLayout>
        {/* Dashboard Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <Button variant="outline" size="sm">
            Customize ⚙️
          </Button>
        </div>

        {/* Metrics Row - Top level stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {isLoading ? (
            <>
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </>
          ) : (
            <>
              <MetricCard
                title="Active Plugins"
                value={activePlugins.length}
                icon="🧩"
                subtitle={`${installedPlugins.length} installed`}
              />
              <MetricCard title="Team Members" value="12" icon="👥" subtitle="3 active today" />
              <MetricCard
                title="Workspace Storage"
                value="2.4 GB"
                icon="💾"
                subtitle="24% of 10 GB"
              />
              <MetricCard title="Recent Activity" value="47" icon="📊" subtitle="Last 7 days" />
            </>
          )}
        </div>

        {/* Widget Grid - Plugin-contributed widgets */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Widget: My Contacts (simulated CRM plugin widget) */}
          <WidgetCard title="My Contacts" subtitle="CRM" icon="👥" isEmpty={false}>
            <div className="space-y-3">
              <ContactItem name="Alice Johnson" company="Acme Corp" status="active" />
              <ContactItem name="Bob Smith" company="Tech Inc" status="active" />
              <ContactItem name="Carol Davis" company="StartupXYZ" status="inactive" />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-4"
              onClick={() => navigate({ to: '/plugins' })}
            >
              View All Contacts
            </Button>
          </WidgetCard>

          {/* Widget: Recent Invoices (simulated Billing plugin widget) */}
          <WidgetCard title="Recent Invoices" subtitle="Billing" icon="💰" isEmpty={false}>
            <div className="space-y-3">
              <InvoiceItem number="#INV-1234" amount="$1,250" status="paid" date="2 days ago" />
              <InvoiceItem number="#INV-1233" amount="$850" status="pending" date="5 days ago" />
              <InvoiceItem number="#INV-1232" amount="$2,100" status="paid" date="1 week ago" />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-4"
              onClick={() => navigate({ to: '/plugins' })}
            >
              View All Invoices
            </Button>
          </WidgetCard>

          {/* Widget: Quick Actions */}
          <WidgetCard
            title="Quick Actions"
            subtitle={`${tenant?.name || 'Workspace'}`}
            icon="⚡"
            isEmpty={false}
          >
            <div className="space-y-2">
              <QuickActionButton
                label="Browse Plugins"
                icon="📦"
                onClick={() => navigate({ to: '/plugins' })}
              />
              <QuickActionButton
                label="Manage Members"
                icon="👥"
                onClick={() => navigate({ to: '/members-management' })}
              />
              <QuickActionButton
                label="Workspace Settings"
                icon="⚙️"
                onClick={() => navigate({ to: '/workspace-settings' })}
              />
              <QuickActionButton
                label="View Activity"
                icon="📝"
                onClick={() => navigate({ to: '/activity-log' })}
              />
            </div>
          </WidgetCard>
        </div>

        {/* Recent Activity - Workspace scoped */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-foreground">
                Recent Activity ({tenant?.name || 'Workspace'})
              </h2>
              <Badge variant="secondary" className="text-xs">
                Last 24 hours
              </Badge>
            </div>
            <div className="space-y-4">
              <ActivityItem
                icon="🔧"
                title="Plugin activated"
                description="CRM plugin enabled by Admin"
                time="2 hours ago"
                workspace={tenant?.name}
              />
              <ActivityItem
                icon="👤"
                title="Team member added"
                description="Alice Johnson invited to workspace"
                time="5 hours ago"
                workspace={tenant?.name}
              />
              <ActivityItem
                icon="💾"
                title="Data exported"
                description="Contact list exported by Bob Smith"
                time="1 day ago"
                workspace={tenant?.name}
              />
              <ActivityItem
                icon="⚙️"
                title="Settings updated"
                description="Workspace preferences changed"
                time="2 days ago"
                workspace={tenant?.name}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-4"
              onClick={() => navigate({ to: '/activity-log' })}
            >
              View Full Activity Log →
            </Button>
          </CardContent>
        </Card>
      </AppLayout>
    </ProtectedRoute>
  );
}

// Helper Components

// Metric Card - Top level stats
function MetricCard({
  title,
  value,
  icon,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: string;
  subtitle: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-2">
          <p className="text-sm text-muted-foreground">{title}</p>
          <span className="text-2xl">{icon}</span>
        </div>
        <p className="text-2xl font-bold text-foreground mb-1">{value}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

// Widget Card - Container for plugin widgets
function WidgetCard({
  title,
  subtitle,
  icon,
  isEmpty = false,
  children,
}: {
  title: string;
  subtitle: string;
  icon: string;
  isEmpty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <div>
              <h3 className="text-base font-semibold text-foreground">{title}</h3>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
        </div>
        {isEmpty ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground mb-4">No data available</p>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

// Contact Item - for CRM widget
function ContactItem({
  name,
  company,
  status,
}: {
  name: string;
  company: string;
  status: 'active' | 'inactive';
}) {
  return (
    <div className="flex items-center justify-between p-2 hover:bg-background-secondary rounded">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
          <span className="text-sm">👤</span>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{name}</p>
          <p className="text-xs text-muted-foreground">{company}</p>
        </div>
      </div>
      <Badge variant={status === 'active' ? 'default' : 'secondary'} className="text-xs">
        {status}
      </Badge>
    </div>
  );
}

// Invoice Item - for Billing widget
function InvoiceItem({
  number,
  amount,
  status,
  date,
}: {
  number: string;
  amount: string;
  status: 'paid' | 'pending';
  date: string;
}) {
  return (
    <div className="flex items-center justify-between p-2 hover:bg-background-secondary rounded">
      <div>
        <p className="text-sm font-medium text-foreground">{number}</p>
        <p className="text-xs text-muted-foreground">{date}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-foreground">{amount}</p>
        <Badge variant={status === 'paid' ? 'default' : 'secondary'} className="text-xs">
          {status}
        </Badge>
      </div>
    </div>
  );
}

// Quick Action Button - for quick actions widget
function QuickActionButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full p-3 text-left rounded-lg hover:bg-background-secondary transition-colors"
    >
      <span className="text-lg">{icon}</span>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </button>
  );
}

// Activity Item - for activity feed
function ActivityItem({
  icon,
  title,
  description,
  time,
  workspace,
}: {
  icon: string;
  title: string;
  description: string;
  time: string;
  workspace?: string;
}) {
  return (
    <div className="flex items-start gap-3 pb-4 border-b border-border last:border-0 last:pb-0">
      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
        <span className="text-xl">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
        {workspace && (
          <p className="text-xs text-muted-foreground mt-1">
            <Badge variant="secondary" className="text-xs">
              {workspace}
            </Badge>
          </p>
        )}
      </div>
      <span className="text-xs text-muted-foreground flex-shrink-0">{time}</span>
    </div>
  );
}
