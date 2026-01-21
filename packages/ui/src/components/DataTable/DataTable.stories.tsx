// File: packages/ui/src/components/DataTable/DataTable.stories.tsx

import type { Meta, StoryObj } from '@storybook/react';
import { DataTable } from './DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '../Badge/Badge';
import { Button } from '../Button/Button';

type Person = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive';
  createdAt: string;
};

const mockData: Person[] = [
  {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    role: 'Admin',
    status: 'active',
    createdAt: '2024-01-15',
  },
  {
    id: '2',
    name: 'Jane Smith',
    email: 'jane@example.com',
    role: 'Member',
    status: 'active',
    createdAt: '2024-01-16',
  },
  {
    id: '3',
    name: 'Bob Johnson',
    email: 'bob@example.com',
    role: 'Viewer',
    status: 'inactive',
    createdAt: '2024-01-17',
  },
  {
    id: '4',
    name: 'Alice Williams',
    email: 'alice@example.com',
    role: 'Member',
    status: 'active',
    createdAt: '2024-01-18',
  },
  {
    id: '5',
    name: 'Charlie Brown',
    email: 'charlie@example.com',
    role: 'Admin',
    status: 'active',
    createdAt: '2024-01-19',
  },
];

const columns: ColumnDef<Person>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'role',
    header: 'Role',
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.original.status === 'active' ? 'default' : 'secondary'}>
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: () => (
      <div className="flex gap-2">
        <Button variant="outline" size="sm">
          Edit
        </Button>
        <Button variant="destructive" size="sm">
          Delete
        </Button>
      </div>
    ),
  },
];

const meta: Meta<typeof DataTable> = {
  title: 'Data Display/DataTable',
  component: DataTable,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A powerful data table component with sorting, filtering, and pagination built on TanStack Table.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    columns: columns as ColumnDef<unknown>[],
    data: mockData,
  },
};

export const WithSorting: Story = {
  args: {
    columns: columns as ColumnDef<unknown>[],
    data: mockData,
    enableSorting: true,
  },
};

export const WithGlobalFilter: Story = {
  args: {
    columns: columns as ColumnDef<unknown>[],
    data: mockData,
    enableGlobalFilter: true,
  },
};

export const WithPagination: Story = {
  args: {
    columns: columns as ColumnDef<unknown>[],
    data: mockData,
    enablePagination: true,
    pageSize: 3,
  },
};

export const FullFeatured: Story = {
  args: {
    columns: columns as ColumnDef<unknown>[],
    data: mockData,
    enableSorting: true,
    enableGlobalFilter: true,
    enablePagination: true,
    pageSize: 3,
  },
};

export const Loading: Story = {
  args: {
    columns: columns as ColumnDef<unknown>[],
    data: [],
    isLoading: true,
  },
};

export const Empty: Story = {
  args: {
    columns: columns as ColumnDef<unknown>[],
    data: [],
  },
};
