// action-matrix-table.tsx
// Table showing which roles have which permissions.
// Accessible: uses <table> with proper headers.

import { Check, Minus } from 'lucide-react';
import { FormattedMessage } from 'react-intl';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@plexica/ui';

import type { ActionMatrixRow } from '../../types/user-management.js';

interface ActionMatrixTableProps {
  rows: ActionMatrixRow[];
}

function BoolCell({ value }: { value: boolean }): JSX.Element {
  return value ? (
    <Check className="h-4 w-4 text-green-600" aria-label="Yes" />
  ) : (
    <Minus className="h-4 w-4 text-neutral-300" aria-label="No" />
  );
}

export function ActionMatrixTable({ rows }: ActionMatrixTableProps): JSX.Element {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <FormattedMessage id="auditLog.table.action" />
            </TableHead>
            <TableHead>
              <FormattedMessage id="members.role.admin" /> (Tenant)
            </TableHead>
            <TableHead>
              <FormattedMessage id="members.role.admin" /> (WS)
            </TableHead>
            <TableHead>
              <FormattedMessage id="members.role.member" />
            </TableHead>
            <TableHead>
              <FormattedMessage id="members.role.viewer" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.action}>
              <TableCell className="font-medium">{row.label}</TableCell>
              <TableCell>
                <BoolCell value={row.tenantAdmin} />
              </TableCell>
              <TableCell>
                <BoolCell value={row.workspaceAdmin} />
              </TableCell>
              <TableCell>
                <BoolCell value={row.member} />
              </TableCell>
              <TableCell>
                <BoolCell value={row.viewer} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
