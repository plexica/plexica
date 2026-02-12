// File: apps/plugin-crm/src/components/HomePage.tsx

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
  StatCard,
} from '@plexica/ui';
import { DollarSign, Handshake, Trophy, Users } from 'lucide-react';

/**
 * CRM Dashboard - Overview of key metrics
 */
const HomePage: React.FC<PluginProps> = ({ tenantId, userId }) => {
  // Mock data for dashboard stats
  const stats = [
    { label: 'Total Contacts', value: '1,247', trend: 12, icon: <Users className="h-5 w-5" /> },
    {
      label: 'Active Deals',
      value: '89',
      trend: 8,
      icon: <Handshake className="h-5 w-5" />,
    },
    {
      label: 'Pipeline Value',
      value: '$2.4M',
      trend: 15,
      icon: <DollarSign className="h-5 w-5" />,
    },
    {
      label: 'Won This Month',
      value: '$420K',
      trend: 23,
      icon: <Trophy className="h-5 w-5" />,
    },
  ];

  const recentDeals = [
    { name: 'Acme Corp Deal', value: '$45K', status: 'Negotiation', contact: 'John Smith' },
    {
      name: 'TechStart Partnership',
      value: '$120K',
      status: 'Proposal',
      contact: 'Sarah Johnson',
    },
    { name: 'Global Industries', value: '$85K', status: 'Qualified', contact: 'Mike Davis' },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">CRM Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your sales pipeline and customer relationships
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            trend={stat.trend}
            icon={stat.icon}
          />
        ))}
      </div>

      {/* Recent Deals */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Deals</CardTitle>
            <CardDescription>Latest deals in your pipeline</CardDescription>
          </div>
          <Button variant="link" size="sm" asChild>
            <a href="/plugins/crm/deals">View All &rarr;</a>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentDeals.map((deal, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-lg bg-muted/50 p-4"
              >
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">{deal.name}</h3>
                  <p className="text-sm text-muted-foreground">Contact: {deal.contact}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-foreground">{deal.value}</span>
                  <Badge variant="secondary">{deal.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Button asChild>
          <a href="/plugins/crm/contacts">View Contacts</a>
        </Button>
        <Button variant="outline" asChild>
          <a href="/plugins/crm/deals">Manage Deals</a>
        </Button>
      </div>

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

export default HomePage;
