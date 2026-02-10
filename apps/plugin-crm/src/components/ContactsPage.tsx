// File: apps/plugin-crm/src/components/ContactsPage.tsx

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
// Note: Input is used internally by DataTable's enableGlobalFilter

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

const STATUS_VARIANT: Record<Contact['status'], 'success' | 'warning'> = {
  Active: 'success',
  Lead: 'warning',
};

/**
 * Contacts Page - View and manage customer contacts
 */
const ContactsPage: React.FC<PluginProps> = ({ tenantId }) => {
  // Mock contacts data
  const [contacts] = useState<Contact[]>([
    {
      id: 1,
      name: 'John Smith',
      email: 'john.smith@acme.com',
      company: 'Acme Corp',
      phone: '+1 (555) 123-4567',
      status: 'Active',
      deals: 3,
      value: '$145K',
    },
    {
      id: 2,
      name: 'Sarah Johnson',
      email: 'sarah.j@techstart.io',
      company: 'TechStart',
      phone: '+1 (555) 234-5678',
      status: 'Active',
      deals: 2,
      value: '$220K',
    },
    {
      id: 3,
      name: 'Mike Davis',
      email: 'mdavis@globalind.com',
      company: 'Global Industries',
      phone: '+1 (555) 345-6789',
      status: 'Active',
      deals: 1,
      value: '$85K',
    },
    {
      id: 4,
      name: 'Emily Chen',
      email: 'emily.chen@innovate.co',
      company: 'Innovate Co',
      phone: '+1 (555) 456-7890',
      status: 'Lead',
      deals: 0,
      value: '$0',
    },
    {
      id: 5,
      name: 'Robert Taylor',
      email: 'rtaylor@megacorp.com',
      company: 'MegaCorp',
      phone: '+1 (555) 567-8901',
      status: 'Active',
      deals: 5,
      value: '$380K',
    },
  ]);

  const columns: ColumnDef<Contact, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => {
        const name = row.getValue<string>('name');
        const initials = name
          .split(' ')
          .map((n) => n[0])
          .join('');
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
      cell: ({ row }) => <span className="font-medium">{row.getValue<string>('value')}</span>,
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
            Edit
          </Button>
        </div>
      ),
    },
  ];

  const activeCount = contacts.filter((c) => c.status === 'Active').length;

  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
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

      {/* Stats Summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          label="Total Contacts"
          value={contacts.length}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard label="Active Customers" value={activeCount} />
        <StatCard label="Total Pipeline Value" value="$830K" />
      </div>

      {/* Contacts Table */}
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

      {/* Context Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <Badge variant="outline">Tenant: {tenantId}</Badge>
            <Badge variant="outline">
              Showing {contacts.length} of {contacts.length} contacts
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ContactsPage;
