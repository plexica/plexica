import type { Meta, StoryObj } from '@storybook/react';

import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/table.js';

const meta: Meta = {
  title: 'Components/Table',
  tags: ['autodocs'],
};
export default meta;

const ROWS = [
  { id: '1', name: 'Alice', role: 'Admin', status: 'Active' },
  { id: '2', name: 'Bob', role: 'Member', status: 'Active' },
  { id: '3', name: 'Charlie', role: 'Member', status: 'Suspended' },
  { id: '4', name: 'Diana', role: 'Viewer', status: 'Active' },
  { id: '5', name: 'Eve', role: 'Admin', status: 'Active' },
];

export const Default: StoryObj = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead sortable sortDirection="asc">Name</TableHead>
          <TableHead sortable sortDirection="none">Role</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ROWS.map((row) => (
          <TableRow key={row.id}>
            <TableCell>{row.name}</TableCell>
            <TableCell>{row.role}</TableCell>
            <TableCell>{row.status}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};
