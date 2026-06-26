// workspace-member-row.tsx
// Single member row for the workspace members table.
// Per-row aria-labels include member identity (WCAG 4.1.2).
// Role change uses optimistic update with rollback on error.
// Removal is guarded by ConfirmDialog in the parent page.

import { FormattedMessage, useIntl } from 'react-intl';
import {
  Button,
  Select,
  TableRow,
  TableCell,
} from '@plexica/ui';

import type { WorkspaceMember } from '../../types/workspace.js';
import type { SelectOption } from '@plexica/ui';

interface WorkspaceMemberRowProps {
  member: WorkspaceMember;
  workspaceId: string;
  roleOptions: SelectOption[];
  roleChangeDisabled: boolean;
  onRoleChange: (vars: { workspaceId: string; userId: string; role: string }) => void;
  onRemoveClick: (userId: string) => void;
}

export function WorkspaceMemberRow({
  member,
  workspaceId,
  roleOptions,
  roleChangeDisabled,
  onRoleChange,
  onRemoveClick,
}: WorkspaceMemberRowProps): JSX.Element {
  const intl = useIntl();
  const memberName = member.displayName ?? member.email;
  const isChanging = roleChangeDisabled;

  return (
    <TableRow key={member.userId}>
      <TableCell>
        <div>
          <p className="font-medium text-neutral-900">{memberName}</p>
          <p className="text-xs text-neutral-500 sm:hidden">{member.email}</p>
        </div>
      </TableCell>
      <TableCell className="hidden text-neutral-600 sm:table-cell">{member.email}</TableCell>
      <TableCell>
        <Select
          options={roleOptions}
          value={member.role}
          onValueChange={(v) => onRoleChange({ workspaceId, userId: member.userId, role: v })}
          disabled={isChanging}
          aria-label={intl.formatMessage(
            { id: 'members.role.aria' },
            { name: memberName },
          )}
        />
      </TableCell>
      <TableCell>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemoveClick(member.userId)}
          aria-label={intl.formatMessage(
            { id: 'members.remove.aria' },
            { name: memberName },
          )}
        >
          <FormattedMessage id="common.delete" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
