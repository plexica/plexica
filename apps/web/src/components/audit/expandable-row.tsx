// expandable-row.tsx
// Table row that expands to show audit log entry detail (before/after values).
// Uses a state toggle to show/hide the detail row within the table structure.

import { useState } from 'react';
import { TableRow, TableCell } from '@plexica/ui';

import type { AuditLogEntry } from '../../types/audit.js';

interface ExpandableRowProps {
  entry: AuditLogEntry;
}

export function ExpandableRow({ entry }: ExpandableRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = entry.beforeValue != null || entry.afterValue != null;

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-neutral-50"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <TableCell className="truncate text-sm text-neutral-700">{entry.actorId}</TableCell>
        <TableCell className="truncate text-sm text-neutral-700">{entry.actionType}</TableCell>
        <TableCell className="truncate text-sm text-neutral-700">
          {entry.targetType}
          {entry.targetId != null ? `:${entry.targetId}` : ''}
        </TableCell>
        <TableCell className="text-sm text-neutral-500">
          {new Date(entry.createdAt).toLocaleString()}
        </TableCell>
      </TableRow>
      {expanded && hasDetail && (
        <TableRow data-testid="audit-row-detail">
          <TableCell colSpan={4} className="bg-neutral-50 px-4 py-3">
            <pre className="overflow-x-auto rounded-md bg-white p-3 text-xs text-neutral-700">
              {JSON.stringify({ before: entry.beforeValue, after: entry.afterValue }, null, 2)}
            </pre>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
