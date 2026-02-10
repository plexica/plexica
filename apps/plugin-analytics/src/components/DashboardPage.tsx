// File: apps/plugin-analytics/src/components/DashboardPage.tsx

import React from 'react';
import type { PluginProps } from '@plexica/types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatCard,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@plexica/ui';
import { Activity, BarChart3, Clock, DollarSign, TrendingUp, Users } from 'lucide-react';

/**
 * Analytics Dashboard - Overview of key metrics and charts
 */
const DashboardPage: React.FC<PluginProps> = ({ tenantId, userId }) => {
  // Mock data for analytics
  const metrics = [
    {
      label: 'Total Revenue',
      value: '$2.4M',
      trend: 18.2,
      icon: <DollarSign className="h-5 w-5" />,
    },
    {
      label: 'Active Users',
      value: '12,482',
      trend: 12.5,
      icon: <Users className="h-5 w-5" />,
    },
    {
      label: 'Conversion Rate',
      value: '24.8%',
      trend: 3.1,
      icon: <TrendingUp className="h-5 w-5" />,
    },
    {
      label: 'Avg. Session Time',
      value: '4m 32s',
      trend: -5.3,
      icon: <Clock className="h-5 w-5" />,
    },
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

  const recentActivity = [
    { event: 'New user registration spike', time: '2 hours ago', type: 'positive' as const },
    { event: 'Page load time increased', time: '5 hours ago', type: 'warning' as const },
    { event: 'Revenue goal achieved', time: '1 day ago', type: 'positive' as const },
    { event: 'Weekly report generated', time: '2 days ago', type: 'neutral' as const },
  ];

  const ACTIVITY_VARIANT: Record<string, 'success' | 'warning' | 'secondary'> = {
    positive: 'success',
    warning: 'warning',
    neutral: 'secondary',
  };

  const maxRevenue = Math.max(...revenueByMonth.map((d) => d.value));

  const SOURCE_COLORS = ['bg-primary', 'bg-green-600', 'bg-yellow-500', 'bg-purple-600'];

  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Analytics Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Track performance metrics and insights across your platform
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <StatCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            trend={metric.trend}
            icon={metric.icon}
          />
        ))}
      </div>

      {/* Charts Section with Tabs */}
      <Tabs defaultValue="revenue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="revenue">
            <BarChart3 className="mr-2 h-4 w-4" />
            Revenue
          </TabsTrigger>
          <TabsTrigger value="sources">
            <Activity className="mr-2 h-4 w-4" />
            Traffic Sources
          </TabsTrigger>
        </TabsList>

        <TabsContent value="revenue">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Revenue Trend</CardTitle>
                <CardDescription>Monthly revenue over the selected period</CardDescription>
              </div>
              <Select defaultValue="7months">
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7months">Last 7 months</SelectItem>
                  <SelectItem value="12months">Last 12 months</SelectItem>
                  <SelectItem value="year">This year</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {revenueByMonth.map((data) => (
                  <div key={data.month} className="flex items-center gap-3">
                    <span className="w-12 text-sm font-medium text-muted-foreground">
                      {data.month}
                    </span>
                    <div className="relative flex-1 overflow-hidden rounded-full bg-muted h-8">
                      <div
                        className="flex h-full items-center justify-end rounded-full bg-primary pr-3 transition-all"
                        style={{ width: `${(data.value / maxRevenue) * 100}%` }}
                      >
                        <span className="text-xs font-medium text-primary-foreground">
                          ${data.value}K
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources">
          <Card>
            <CardHeader>
              <CardTitle>Top Traffic Sources</CardTitle>
              <CardDescription>User acquisition breakdown by source</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topSources.map((source, index) => (
                  <div key={source.name}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`h-3 w-3 rounded-full ${SOURCE_COLORS[index]}`} />
                        <span className="text-sm font-medium text-foreground">{source.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-foreground">
                          {source.users.toLocaleString()}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {source.percentage}%
                        </span>
                      </div>
                    </div>
                    <Progress value={source.percentage} className="h-2" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest events and alerts</CardDescription>
          </div>
          <Button variant="link" size="sm" asChild>
            <a href="/plugins/analytics/reports">View All Reports &rarr;</a>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentActivity.map((activity, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-lg bg-muted/50 p-3"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant={ACTIVITY_VARIANT[activity.type]}
                    className="h-2 w-2 rounded-full p-0"
                  />
                  <span className="text-sm text-foreground">{activity.event}</span>
                </div>
                <span className="text-xs text-muted-foreground">{activity.time}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Context Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <Badge variant="outline">Tenant: {tenantId}</Badge>
            <Badge variant="outline">User: {userId}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardPage;
