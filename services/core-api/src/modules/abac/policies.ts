// policies.ts
// Static registry of core ABAC actions and their minimum required roles.
// Implements: FR-013, FR-014, FR-018, FR-023, FR-024, plan §5.1.8, DR-04
//
// Design notes (F03, F05, F12 fixes — April 2026):
// - Tenant-level actions (workspace:create, user:*, branding:*, etc.) live ONLY
//   in TENANT_LEVEL_ACTIONS and are NOT duplicated in CORE_POLICIES.
// - Content actions (content:read/create/update/delete) added to CORE_POLICIES.
// - invitation:revoke removed (not in DR-04).
// - settings:read changed to 'admin' (was incorrectly 'viewer').

import type { PolicyRule, WorkspaceRole } from './types.js';

// 17 workspace-scoped actions and their minimum required workspace role.
// Tenant-level actions bypass this table — they use the isTenantAdmin check in engine.ts.
export const CORE_POLICIES: PolicyRule[] = [
  // Workspace management
  { action: 'workspace:read', requiredRole: 'viewer' },
  { action: 'workspace:update', requiredRole: 'admin' },
  { action: 'workspace:delete', requiredRole: 'admin' },
  { action: 'workspace:archive', requiredRole: 'admin' },
  { action: 'workspace:restore', requiredRole: 'admin' },
  { action: 'workspace:reparent', requiredRole: 'admin' },
  // Member management
  { action: 'member:list', requiredRole: 'viewer' },
  { action: 'member:invite', requiredRole: 'admin' },
  { action: 'member:remove', requiredRole: 'admin' },
  { action: 'member:role-change', requiredRole: 'admin' },
  // Invitation management (workspace-scoped)
  { action: 'invitation:list', requiredRole: 'admin' },
  { action: 'invitation:resend', requiredRole: 'admin' },
  // Settings — admin only (F12: was incorrectly 'viewer')
  { action: 'settings:read', requiredRole: 'admin' },
  // Content actions (F03: were missing from CORE_POLICIES)
  { action: 'content:read', requiredRole: 'viewer' },
  { action: 'content:create', requiredRole: 'member' },
  { action: 'content:update', requiredRole: 'member' },
  { action: 'content:delete', requiredRole: 'admin' },
];

// Build a lookup map for O(1) policy resolution
export const POLICY_MAP: Map<string, WorkspaceRole> = new Map(
  CORE_POLICIES.map((p) => [p.action, p.requiredRole])
);

// Tenant-level actions — bypass workspace membership, require isTenantAdmin.
// These must NOT overlap with CORE_POLICIES (F05 fix: removed duplicates).
export const TENANT_LEVEL_ACTIONS = new Set([
  'workspace:create',
  'user:list',
  'user:remove',
  'invitation:send',
  'branding:read',
  'branding:update',
  'settings:update',
  'auth:config-read',
  'auth:config-update',
  'audit:read',
  'role:read',
  'plugin-action:manage',
]);
