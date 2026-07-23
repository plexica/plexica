// messages.en.workspace-users.ts — Workspace, members, users, and roles strings.

export const messagesWorkspaceUsers = {
  // Workspace
  'workspace.list.title': 'Workspaces',
  'workspace.list.empty': 'No workspaces yet',
  'workspace.create.title': 'Create Workspace',
  'workspace.create.name.label': 'Name',
  'workspace.create.description.label': 'Description',
  'workspace.create.parent.label': 'Parent workspace',
  'workspace.create.template.label': 'Template',
  'workspace.create.submit': 'Create',
  'workspace.edit.title': 'Edit Workspace',
  'workspace.edit.submit': 'Save changes',
  'workspace.delete.confirm.title': 'Archive workspace',
  'workspace.delete.confirm.description':
    'This will archive the workspace and all its children. They can be restored within 30 days.',
  'workspace.restore.confirm.title': 'Restore workspace',
  'workspace.restore.confirm.description': 'This will restore the workspace and its children.',
  'workspace.status.active': 'Active',
  'workspace.status.archived': 'Archived',
  'workspace.detail.parent': 'Parent workspace:',
  'workspace.detail.members': 'Members',
  'workspace.detail.children': 'Sub-workspaces',
  'workspace.reparent.label': 'Move to',
  'workspace.dangerZone.title': 'Danger Zone',
  'workspace.tree.label': 'Workspace hierarchy',
  'workspace.tree.empty': 'No workspaces.',
  'workspace.tree.expand': 'Expand {name}',
  'workspace.tree.collapse': 'Collapse {name}',
  'workspace.tree.search.label': 'Search workspaces',
  'workspace.tree.search.placeholder': 'Search workspaces...',
  'workspace.tree.search.results':
    '{count, plural, one {# workspace found} other {# workspaces found}}',
  'workspace.tree.search.empty': 'No workspaces match your search.',
  'workspace.tree.noParent': 'No parent workspace',
  'workspace.selector.label': 'Workspace selector: {name}',
  'workspace.selector.viewAll': 'View all workspaces',

  // Members
  'members.title': 'Members',
  'members.add': 'Add member',
  'members.invite': 'Invite by email',
  'members.remove.confirm.title': 'Remove member',
  'members.remove.confirm.description': 'This member will lose access to this workspace.',
  'members.role.admin': 'Admin',
  'members.role.member': 'Member',
  'members.role.viewer': 'Viewer',
  'members.role.aria': 'Role for {name}',
  'members.remove.aria': 'Remove {name}',
  'members.invitation.pending': 'Invitation pending',
  'members.invitation.resend': 'Resend',

  // Users
  'users.title': 'Users',
  'users.search.placeholder': 'Search users\u2026',
  'users.remove.title': 'Remove user',
  'users.remove.description': 'This user will be removed from the tenant.',
  'users.remove.confirm.instructions': 'Type CONFIRM to permanently remove this user',
  'users.remove.reassign.label': 'Reassign content to',
  'users.status.active': 'Active',
  'users.status.suspended': 'Suspended',
  'users.status.pending_deletion': 'Pending deletion',

  // Roles
  'roles.title': 'Roles & Permissions',
  'roles.matrix.title': 'Permission Matrix',
  'roles.export.csv': 'Export CSV',

  // Workspace status
  'workspace.status.all': 'All statuses',
} as const;
