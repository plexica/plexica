# Plugin UI Patterns

**Date**: February 10, 2026
**Status**: Active
**Target Audience**: Plugin developers building frontend UI
**Prerequisites**: Read the [Plugin Frontend Guide](./PLUGIN_FRONTEND_GUIDE.md) first

---

## Table of Contents

- [Overview](#overview)
- [Pattern 1: Dashboard Page](#pattern-1-dashboard-page)
- [Pattern 2: List Page](#pattern-2-list-page)
- [Pattern 3: Detail / Kanban Page](#pattern-3-detail--kanban-page)
- [Pattern 4: Form / Settings Page](#pattern-4-form--settings-page)
- [Pattern 5: Report / Export Page](#pattern-5-report--export-page)
- [Common Building Blocks](#common-building-blocks)
- [Reference Plugins](#reference-plugins)

---

## Overview

This guide provides **copy-pasteable page patterns** for common plugin UI layouts. Each pattern is extracted from the real sample plugins (`plugin-crm` and `plugin-analytics`) and uses only `@plexica/ui` components.

**Every pattern follows the same structure:**

```
┌─────────────────────────────────────┐
│  Page Header (title + description)  │
│  + optional action button           │
├─────────────────────────────────────┤
│  StatCard grid (key metrics)        │
├─────────────────────────────────────┤
│  Main content area                  │
│  (table, cards, tabs, form, etc.)   │
├─────────────────────────────────────┤
│  Context badge footer (optional)    │
└─────────────────────────────────────┘
```

**Common conventions:**

- Root wrapper: `<div className="space-y-6 p-6">`
- Page title: `<h1 className="text-2xl font-bold tracking-tight text-foreground">`
- Subtitle: `<p className="text-sm text-muted-foreground">`
- Grid breakpoints: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4` (4 stats), `md:grid-cols-3` (3 stats)
- All components from `@plexica/ui`, icons from `lucide-react`

---

## Pattern 1: Dashboard Page

A metrics overview page with stat cards, tabbed chart sections, and an activity feed. Best for plugin home pages.

**Live example**: `apps/plugin-analytics/src/components/DashboardPage.tsx`

**Components used**: `StatCard`, `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `Badge`, `Button`, `Progress`, `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`

```typescript
// File: src/pages/DashboardPage.tsx

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

export const DashboardPage: React.FC<PluginProps> = ({ tenantId, userId }) => {
  // -- Data (replace with API calls) ------------------------------------

  const metrics = [
    { label: 'Total Revenue', value: '$2.4M', trend: 18.2, icon: <DollarSign className="h-5 w-5" /> },
    { label: 'Active Users', value: '12,482', trend: 12.5, icon: <Users className="h-5 w-5" /> },
    { label: 'Conversion Rate', value: '24.8%', trend: 3.1, icon: <TrendingUp className="h-5 w-5" /> },
    { label: 'Avg. Session', value: '4m 32s', trend: -5.3, icon: <Clock className="h-5 w-5" /> },
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

  // -- Render -----------------------------------------------------------

  return (
    <div className="space-y-6 p-6">
      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Analytics Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Track performance metrics and insights across your platform
        </p>
      </div>

      {/* ── Stat Cards ───────────────────────────────────────────────── */}
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

      {/* ── Tabbed Charts ────────────────────────────────────────────── */}
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

        {/* Revenue Tab */}
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

        {/* Traffic Sources Tab */}
        <TabsContent value="sources">
          <Card>
            <CardHeader>
              <CardTitle>Top Traffic Sources</CardTitle>
              <CardDescription>User acquisition breakdown by source</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topSources.map((source) => (
                  <div key={source.name}>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{source.name}</span>
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

      {/* ── Activity Feed ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest events and alerts</CardDescription>
          </div>
          <Button variant="link" size="sm" asChild>
            <a href="/plugins/myapp/reports">View All Reports &rarr;</a>
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
    </div>
  );
};
```

**Key techniques:**

- `StatCard` handles trend arrows and formatting automatically -- pass `trend` as a positive/negative number
- `Tabs` with icons in `TabsTrigger` for chart navigation
- `Select` inside `CardHeader` for time period filtering
- `Progress` bars for percentage-based breakdowns
- `Badge` with `className="h-2 w-2 rounded-full p-0"` as a colored status dot

---

## Pattern 2: List Page

A searchable, sortable data table with stat summary, empty state, and row actions. Best for entity listing pages (contacts, items, records).

**Live example**: `apps/plugin-crm/src/components/ContactsPage.tsx`

**Components used**: `DataTable`, `ColumnDef`, `StatCard`, `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Badge`, `Button`, `Avatar`, `AvatarFallback`, `EmptyState`

```typescript
// File: src/pages/ContactsPage.tsx

import React, { useState } from 'react';
import type { PluginProps } from '@plexica/types';
import type { ColumnDef } from '@plexica/ui';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  StatCard,
} from '@plexica/ui';
import { Plus, Search, Users } from 'lucide-react';

// -- Types --------------------------------------------------------------

interface Contact {
  id: number;
  name: string;
  email: string;
  company: string;
  phone: string;
  status: 'Active' | 'Lead';
  deals: number;
  value: string;
}

// Map status values to Badge variants
const STATUS_VARIANT: Record<Contact['status'], 'success' | 'warning'> = {
  Active: 'success',
  Lead: 'warning',
};

// -- Component ----------------------------------------------------------

export const ContactsPage: React.FC<PluginProps> = ({ tenantId }) => {
  // Replace with API call
  const [contacts] = useState<Contact[]>([
    {
      id: 1, name: 'John Smith', email: 'john@acme.com', company: 'Acme Corp',
      phone: '+1 (555) 123-4567', status: 'Active', deals: 3, value: '$145K',
    },
    {
      id: 2, name: 'Sarah Johnson', email: 'sarah@techstart.io', company: 'TechStart',
      phone: '+1 (555) 234-5678', status: 'Active', deals: 2, value: '$220K',
    },
    {
      id: 3, name: 'Emily Chen', email: 'emily@innovate.co', company: 'Innovate Co',
      phone: '+1 (555) 456-7890', status: 'Lead', deals: 0, value: '$0',
    },
  ]);

  // -- Column definitions -----------------------------------------------

  const columns: ColumnDef<Contact, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const name = row.getValue<string>('name');
        const initials = name.split(' ').map((n) => n[0]).join('');
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <span className="font-medium">{name}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'company',
      header: 'Company',
    },
    {
      accessorKey: 'email',
      header: 'Contact Info',
      cell: ({ row }) => (
        <div>
          <div className="text-sm">{row.original.email}</div>
          <div className="text-xs text-muted-foreground">{row.original.phone}</div>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue<Contact['status']>('status');
        return <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>;
      },
    },
    {
      accessorKey: 'deals',
      header: 'Deals',
    },
    {
      accessorKey: 'value',
      header: 'Value',
      cell: ({ row }) => (
        <span className="font-medium">{row.getValue<string>('value')}</span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: () => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm">View</Button>
          <Button variant="ghost" size="sm">Edit</Button>
        </div>
      ),
    },
  ];

  const activeCount = contacts.filter((c) => c.status === 'Active').length;

  // -- Render -----------------------------------------------------------

  return (
    <div className="space-y-6 p-6">
      {/* ── Page Header with Action ──────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Contacts</h1>
          <p className="text-sm text-muted-foreground">Manage your customer relationships</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Contact
        </Button>
      </div>

      {/* ── Stats Summary ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          label="Total Contacts"
          value={contacts.length}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard label="Active Customers" value={activeCount} />
        <StatCard label="Total Pipeline Value" value="$830K" />
      </div>

      {/* ── Data Table with Empty State ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>All Contacts</CardTitle>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <EmptyState
              icon={<Search className="h-10 w-10" />}
              title="No contacts found"
              description="Get started by adding your first contact."
              action={{ label: 'Add Contact', onClick: () => {} }}
            />
          ) : (
            <DataTable
              columns={columns}
              data={contacts}
              enableSorting
              enableGlobalFilter
              enablePagination
              pageSize={10}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};
```

**Key techniques:**

- `DataTable` with `enableSorting`, `enableGlobalFilter`, `enablePagination` -- built-in search, sort, and paging
- `ColumnDef` with custom `cell` renderers for avatars, badges, multi-line content, and action buttons
- Status-to-variant mapping via a `Record<Status, Variant>` constant
- `EmptyState` as a fallback when data is empty, with an action button
- `Avatar` + `AvatarFallback` for initials-based user display in table rows
- Row actions column with `id: 'actions'` (no `accessorKey`) and right-aligned buttons

---

## Pattern 3: Detail / Kanban Page

A Kanban-style board with grouped cards, progress indicators, and inline metadata. Best for pipeline views, task boards, or grouped entity displays.

**Live example**: `apps/plugin-crm/src/components/DealsPage.tsx`

**Components used**: `StatCard`, `Card`, `CardContent`, `Badge`, `Button`, `Progress`, `Separator`

```typescript
// File: src/pages/DealsPage.tsx

import React, { useState } from 'react';
import type { PluginProps } from '@plexica/types';
import { Badge, Button, Card, CardContent, Progress, Separator, StatCard } from '@plexica/ui';
import { Calendar, DollarSign, Handshake, Plus, Trophy, User } from 'lucide-react';

// -- Types --------------------------------------------------------------

interface Deal {
  id: number;
  name: string;
  value: string;
  stage: string;
  contact: string;
  company: string;
  probability: number;
  closeDate: string;
}

// -- Component ----------------------------------------------------------

export const DealsPage: React.FC<PluginProps> = ({ tenantId }) => {
  const stages = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won'];

  // Replace with API call
  const [deals] = useState<Deal[]>([
    {
      id: 1, name: 'Acme Corp Deal', value: '$45K', stage: 'Negotiation',
      contact: 'John Smith', company: 'Acme Corp', probability: 75, closeDate: '2026-02-15',
    },
    {
      id: 2, name: 'TechStart Partnership', value: '$120K', stage: 'Proposal',
      contact: 'Sarah Johnson', company: 'TechStart', probability: 60, closeDate: '2026-03-01',
    },
    {
      id: 3, name: 'Global Industries', value: '$85K', stage: 'Qualified',
      contact: 'Mike Davis', company: 'Global Industries', probability: 45, closeDate: '2026-03-15',
    },
  ]);

  const getDealsByStage = (stage: string) => deals.filter((d) => d.stage === stage);

  const STAGE_VARIANT: Record<string, 'secondary' | 'warning' | 'default' | 'success' | 'outline'> = {
    Lead: 'secondary',
    Qualified: 'warning',
    Proposal: 'default',
    Negotiation: 'default',
    'Closed Won': 'success',
  };

  // -- Render -----------------------------------------------------------

  return (
    <div className="space-y-6 p-6">
      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Sales Pipeline</h1>
          <p className="text-sm text-muted-foreground">Track and manage your deals</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Deal
        </Button>
      </div>

      {/* ── Stats ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard
          label="Total Deals"
          value={deals.length}
          icon={<Handshake className="h-5 w-5" />}
        />
        <StatCard
          label="Pipeline Value"
          value="$250K"
          icon={<DollarSign className="h-5 w-5" />}
        />
        <StatCard label="In Negotiation" value={getDealsByStage('Negotiation').length} />
        <StatCard
          label="Closed This Month"
          value={getDealsByStage('Closed Won').length}
          icon={<Trophy className="h-5 w-5" />}
        />
      </div>

      {/* ── Kanban Board ─────────────────────────────────────────────── */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageDeals = getDealsByStage(stage);

          return (
            <div key={stage} className="w-80 flex-shrink-0">
              {/* Column Header */}
              <Card className="rounded-b-none">
                <CardContent className="flex items-center justify-between p-4">
                  <h3 className="font-semibold text-foreground">{stage}</h3>
                  <Badge variant={STAGE_VARIANT[stage] ?? 'outline'}>
                    {stageDeals.length}
                  </Badge>
                </CardContent>
              </Card>

              {/* Column Body */}
              <div className="min-h-[400px] space-y-2 rounded-b-lg border border-t-0 border-border bg-muted/30 p-2">
                {stageDeals.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No deals
                  </div>
                ) : (
                  stageDeals.map((deal) => (
                    <Card
                      key={deal.id}
                      className="cursor-pointer transition-shadow hover:shadow-md"
                    >
                      <CardContent className="p-4">
                        <h4 className="mb-2 font-medium text-foreground">{deal.name}</h4>
                        <p className="mb-3 text-lg font-bold text-primary">{deal.value}</p>

                        {/* Metadata with icons */}
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <p className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5" />
                            {deal.contact}
                          </p>
                          <p className="flex items-center gap-1.5">
                            <Handshake className="h-3.5 w-3.5" />
                            {deal.company}
                          </p>
                          <p className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date(deal.closeDate).toLocaleDateString()}
                          </p>
                        </div>

                        {/* Probability progress bar */}
                        <div className="mt-3">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Probability</span>
                            <span className="text-xs font-medium text-foreground">
                              {deal.probability}%
                            </span>
                          </div>
                          <Progress value={deal.probability} className="h-2" />
                        </div>

                        <Separator className="my-3" />

                        {/* Card actions */}
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" className="h-7 text-xs">
                            View
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs">
                            Edit
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

**Key techniques:**

- Horizontal scroll Kanban: `flex gap-4 overflow-x-auto` with `w-80 flex-shrink-0` columns
- Column header as a `Card` with `rounded-b-none`, body as a bordered `div` with `border-t-0 rounded-b-lg`
- `Progress` bar for probability/completion percentage inside cards
- `Separator` to visually divide card content from action buttons
- Lucide icons at `h-3.5 w-3.5` for inline metadata rows
- Hover effect on cards: `transition-shadow hover:shadow-md`

---

## Pattern 4: Form / Settings Page

A configuration page with text inputs, select dropdowns, toggle switches, grouped into cards with save feedback. Best for plugin settings, user preferences, and configuration forms.

**Live example**: `apps/plugin-template-frontend/src/pages/SettingsPage.tsx`

**Components used**: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `Input`, `Label`, `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`, `Switch`, `Separator`, `Button`, `Alert`, `AlertTitle`, `AlertDescription`

```typescript
// File: src/pages/SettingsPage.tsx

import React, { useState } from 'react';
import type { PluginProps } from '@plexica/types';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
} from '@plexica/ui';
import { CheckCircle2, Save } from 'lucide-react';

export const SettingsPage: React.FC<PluginProps> = ({ tenantId }) => {
  const [saved, setSaved] = useState(false);
  const [pluginName, setPluginName] = useState('My Plugin');
  const [apiEndpoint, setApiEndpoint] = useState('https://api.example.com');
  const [refreshInterval, setRefreshInterval] = useState('30');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [debugMode, setDebugMode] = useState(false);

  const handleSave = () => {
    // Replace with real API call
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 p-6">
      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure your plugin for tenant <strong>{tenantId}</strong>.
        </p>
      </div>

      {/* ── Success Alert ────────────────────────────────────────────── */}
      {saved && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Settings saved</AlertTitle>
          <AlertDescription>
            Your plugin configuration has been updated successfully.
          </AlertDescription>
        </Alert>
      )}

      {/* ── General Settings Card ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Basic plugin configuration options.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Text input */}
          <div className="space-y-2">
            <Label htmlFor="plugin-name">Plugin Display Name</Label>
            <Input
              id="plugin-name"
              value={pluginName}
              onChange={(e) => setPluginName(e.target.value)}
              placeholder="Enter plugin name"
            />
          </div>

          {/* Input with helper text */}
          <div className="space-y-2">
            <Label htmlFor="api-endpoint">API Endpoint</Label>
            <Input
              id="api-endpoint"
              value={apiEndpoint}
              onChange={(e) => setApiEndpoint(e.target.value)}
              placeholder="https://api.example.com"
              helperText="The base URL for your plugin's backend API."
            />
          </div>

          {/* Select dropdown */}
          <div className="space-y-2">
            <Label htmlFor="refresh-interval">Data Refresh Interval</Label>
            <Select value={refreshInterval} onValueChange={setRefreshInterval}>
              <SelectTrigger>
                <SelectValue placeholder="Select interval" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">Every 10 seconds</SelectItem>
                <SelectItem value="30">Every 30 seconds</SelectItem>
                <SelectItem value="60">Every minute</SelectItem>
                <SelectItem value="300">Every 5 minutes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── Feature Toggles Card ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Features</CardTitle>
          <CardDescription>Enable or disable plugin features.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Toggle row pattern */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="notifications">Notifications</Label>
              <p className="text-xs text-muted-foreground">
                Receive alerts when important events occur.
              </p>
            </div>
            <Switch
              id="notifications"
              checked={notificationsEnabled}
              onCheckedChange={setNotificationsEnabled}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="debug-mode">Debug Mode</Label>
              <p className="text-xs text-muted-foreground">
                Show detailed logging in the browser console.
              </p>
            </div>
            <Switch id="debug-mode" checked={debugMode} onCheckedChange={setDebugMode} />
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            Save Settings
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
```

**Key techniques:**

- Group related fields into separate `Card` sections
- Form field pattern: `<div className="space-y-2">` → `<Label>` → `<Input>` or `<Select>`
- Toggle row pattern: `flex items-center justify-between` with label+description on left, `Switch` on right
- `Separator` between toggle rows for visual grouping
- `CardFooter className="justify-end"` for right-aligned save button
- `Alert variant="success"` with auto-dismiss for save feedback
- `Input helperText` prop for inline field descriptions

---

## Pattern 5: Report / Export Page

A report management page with template cards, a data table of generated reports, and an export configuration section. Best for analytics, report generation, and data export workflows.

**Live example**: `apps/plugin-analytics/src/components/ReportsPage.tsx`

**Components used**: `StatCard`, `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `DataTable`, `ColumnDef`, `Badge`, `Button`, `Label`, `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`, `Separator`

```typescript
// File: src/pages/ReportsPage.tsx

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

// -- Types --------------------------------------------------------------

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

// -- Component ----------------------------------------------------------

export const ReportsPage: React.FC<PluginProps> = ({ tenantId }) => {
  // Replace with API call
  const [reports] = useState<Report[]>([
    { id: 1, name: 'Monthly Revenue Summary', type: 'Financial', lastRun: '2026-01-22 08:30', status: 'completed', size: '2.4 MB' },
    { id: 2, name: 'User Activity Report', type: 'Engagement', lastRun: '2026-01-22 06:00', status: 'completed', size: '1.8 MB' },
    { id: 3, name: 'Customer Segmentation', type: 'Marketing', lastRun: '2026-01-21 18:20', status: 'running', size: '—' },
  ]);

  // -- Report template cards --------------------------------------------

  const reportTemplates = [
    { name: 'Revenue Analysis', description: 'Comprehensive revenue breakdown', icon: <BarChart3 className="h-6 w-6 text-muted-foreground" /> },
    { name: 'User Insights', description: 'User behavior analytics', icon: <Users className="h-6 w-6 text-muted-foreground" /> },
    { name: 'Conversion Funnel', description: 'Track conversion rates', icon: <Target className="h-6 w-6 text-muted-foreground" /> },
    { name: 'Custom Report', description: 'Build with your metrics', icon: <FileText className="h-6 w-6 text-muted-foreground" /> },
  ];

  // -- Table columns ----------------------------------------------------

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
          <Button variant="ghost" size="sm">View</Button>
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

  // -- Render -----------------------------------------------------------

  return (
    <div className="space-y-6 p-6">
      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Generate, schedule, and export analytics reports
        </p>
      </div>

      {/* ── Template Cards ───────────────────────────────────────────── */}
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

      {/* ── Stats ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Total Reports" value={reports.length} icon={<FileText className="h-5 w-5" />} />
        <StatCard label="Reports This Month" value={24} icon={<Calendar className="h-5 w-5" />} />
        <StatCard label="Scheduled Reports" value={8} />
      </div>

      {/* ── Reports Table ────────────────────────────────────────────── */}
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

      {/* ── Export Configuration ──────────────────────────────────────── */}
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
    </div>
  );
};
```

**Key techniques:**

- Template cards as clickable `Card` elements with `hover:border-primary hover:shadow-md`
- Multi-column form layout: `grid grid-cols-1 md:grid-cols-3 gap-4` for side-by-side selects
- Destructive action button: `className="text-destructive hover:text-destructive"` on ghost variant
- `Separator` to divide form fields from the submit button
- Icon inside button: `<Download className="mr-1 h-3.5 w-3.5" />` (smaller icon with `mr-1` in table rows)

---

## Common Building Blocks

### Page Header

Two variants -- simple and with action button:

```tsx
{
  /* Simple header */
}
<div>
  <h1 className="text-2xl font-bold tracking-tight text-foreground">Page Title</h1>
  <p className="text-sm text-muted-foreground">Page description goes here</p>
</div>;

{
  /* Header with action button */
}
<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h1 className="text-2xl font-bold tracking-tight text-foreground">Page Title</h1>
    <p className="text-sm text-muted-foreground">Page description</p>
  </div>
  <Button>
    <Plus className="mr-2 h-4 w-4" />
    Add Item
  </Button>
</div>;
```

### Stat Card Grid

```tsx
<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
  <StatCard label="Metric Name" value="1,234" trend={12} icon={<Users className="h-5 w-5" />} />
  <StatCard label="Another Metric" value="$56K" trend={-3.2} />
  {/* trend > 0 shows green arrow up, trend < 0 shows red arrow down */}
</div>
```

### Card with Header Action

```tsx
<Card>
  <CardHeader className="flex flex-row items-center justify-between">
    <div>
      <CardTitle>Section Title</CardTitle>
      <CardDescription>Optional description</CardDescription>
    </div>
    <Button variant="link" size="sm" asChild>
      <a href="/plugins/myapp/page">View All &rarr;</a>
    </Button>
  </CardHeader>
  <CardContent>{/* content */}</CardContent>
</Card>
```

### Status Badge Mapping

```tsx
// Define a mapping from your domain status to Badge variants
const STATUS_VARIANT: Record<MyStatus, 'success' | 'warning' | 'danger' | 'default'> = {
  active: 'success',
  pending: 'warning',
  failed: 'danger',
  draft: 'default',
};

// Use in JSX
<Badge variant={STATUS_VARIANT[item.status]}>{item.status}</Badge>;
```

Available Badge variants: `default`, `secondary`, `success`, `warning`, `danger`, `outline`

### Row Actions Column (DataTable)

```tsx
{
  id: 'actions',
  header: '',
  cell: () => (
    <div className="flex justify-end gap-2">
      <Button variant="ghost" size="sm">View</Button>
      <Button variant="ghost" size="sm">Edit</Button>
      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
        Delete
      </Button>
    </div>
  ),
}
```

### Toggle Row (Settings)

```tsx
<div className="flex items-center justify-between">
  <div className="space-y-0.5">
    <Label htmlFor="toggle-id">Feature Name</Label>
    <p className="text-xs text-muted-foreground">Description of what this toggle does.</p>
  </div>
  <Switch id="toggle-id" checked={value} onCheckedChange={setValue} />
</div>
```

### Context Info Footer

Display tenant/user context at the bottom of the page (useful for debugging):

```tsx
<Card>
  <CardContent className="pt-6">
    <div className="flex flex-wrap gap-3">
      <Badge variant="outline">Tenant: {tenantId}</Badge>
      <Badge variant="outline">User: {userId}</Badge>
    </div>
  </CardContent>
</Card>
```

---

## Reference Plugins

These sample plugins demonstrate every pattern in this guide using `@plexica/ui` components:

| Plugin          | Location                         | Patterns Demonstrated                                       |
| --------------- | -------------------------------- | ----------------------------------------------------------- |
| Plugin Template | `apps/plugin-template-frontend/` | Dashboard (Pattern 1), Settings (Pattern 4)                 |
| CRM             | `apps/plugin-crm/`               | Dashboard (Pattern 1), List (Pattern 2), Kanban (Pattern 3) |
| Analytics       | `apps/plugin-analytics/`         | Dashboard (Pattern 1), Reports/Export (Pattern 5)           |

All sample plugins use zero raw HTML elements -- every piece of UI is built with `@plexica/ui` components and semantic Tailwind classes that work in both light and dark mode.

---

## Related Guides

| Topic                       | Guide                                               |
| --------------------------- | --------------------------------------------------- |
| Full component catalog      | [Plugin Frontend Guide](./PLUGIN_FRONTEND_GUIDE.md) |
| 0-to-running quick start    | [Quick Start](./PLUGIN_QUICK_START.md)              |
| Backend services and events | [Backend Guide](./PLUGIN_BACKEND_GUIDE.md)          |
| Design system reference     | [Design System](../design/DESIGN_SYSTEM.md)         |

---

_Plugin UI Patterns v1.0_
_Created: February 10, 2026_
