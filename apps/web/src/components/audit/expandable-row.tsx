// expandable-row.tsx
// Table row that expands to show audit log entry metadata.
// Uses <details>/<summary> for native collapse behavior.

import type { AuditLogEntry } from '../../types/audit.js';

interface ExpandableRowProps {
  entry: AuditLogEntry;
}

export function ExpandableRow({ entry }: ExpandableRowProps): JSX.Element {
  const hasMetadata = Object.keys(entry.metadata).length > 0;

  return (
    <details className="group">
      <summary className="grid cursor-pointer list-none grid-cols-5 gap-4 px-4 py-3 text-sm hover:bg-neutral-50 [&::-webkit-details-marker]:hidden">
        <span className="truncate text-neutral-700">{entry.actorId}</span>
        <span className="truncate text-neutral-700">{entry.actionType}</span>
        <span className="truncate text-neutral-700">
          {entry.targetType}:{entry.targetId}
        </span>
        <span className="truncate text-neutral-500">{entry.workspaceId ?? '—'}</span>
        <span className="text-neutral-500">{new Date(entry.createdAt).toLocaleString()}</span>
      </summary>
      {hasMetadata && (
        <div className="border-t border-neutral-100 bg-neutral-50 px-4 py-3">
          <pre className="overflow-x-auto rounded-md bg-white p-3 text-xs text-neutral-700">
            {JSON.stringify(entry.metadata, null, 2)}
          </pre>
        </div>
      )}
    </details>
  );
}
