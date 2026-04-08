// action-types.ts
// Static registry of audit log action types with human-readable labels.
// Implements: FR-021, DR-08, plan §5.1.7

export interface ActionTypeDefinition {
  key: string;
  label: string;
  category: string;
}

export const AUDIT_ACTION_TYPES: ActionTypeDefinition[] = [
  // Authentication
  { key: 'auth.login', label: 'Login', category: 'Authentication' },
  { key: 'auth.logout', label: 'Logout', category: 'Authentication' },
  { key: 'auth.failed_login', label: 'Failed Login', category: 'Authentication' },
  { key: 'auth.password_change', label: 'Password Change', category: 'Authentication' },
  { key: 'auth.mfa_event', label: 'MFA Event', category: 'Authentication' },
  // Workspace
  { key: 'workspace.create', label: 'Create Workspace', category: 'Workspace' },
  { key: 'workspace.update', label: 'Update Workspace', category: 'Workspace' },
  { key: 'workspace.delete', label: 'Delete Workspace', category: 'Workspace' },
  { key: 'workspace.archive', label: 'Archive Workspace', category: 'Workspace' },
  { key: 'workspace.restore', label: 'Restore Workspace', category: 'Workspace' },
  { key: 'workspace.reparent', label: 'Move Workspace', category: 'Workspace' },
  // Membership
  { key: 'member.add', label: 'Add Member', category: 'Membership' },
  { key: 'member.remove', label: 'Remove Member', category: 'Membership' },
  { key: 'member.role_change', label: 'Change Member Role', category: 'Membership' },
  // Invitation
  { key: 'invitation.send', label: 'Send Invitation', category: 'Invitation' },
  { key: 'invitation.accept', label: 'Accept Invitation', category: 'Invitation' },
  { key: 'invitation.expire', label: 'Expire Invitation', category: 'Invitation' },
  { key: 'invitation.resend', label: 'Resend Invitation', category: 'Invitation' },
  // Tenant Settings
  { key: 'settings.name_change', label: 'Update Tenant Name', category: 'Settings' },
  { key: 'settings.branding_update', label: 'Update Branding', category: 'Settings' },
  { key: 'settings.auth_config_change', label: 'Update Auth Config', category: 'Settings' },
  // User Profile
  { key: 'profile.update', label: 'Update Profile', category: 'Profile' },
  { key: 'profile.avatar_change', label: 'Change Avatar', category: 'Profile' },
];

// Build O(1) lookup
export const ACTION_TYPE_MAP: Map<string, ActionTypeDefinition> = new Map(
  AUDIT_ACTION_TYPES.map((a) => [a.key, a])
);
