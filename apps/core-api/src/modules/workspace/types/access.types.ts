/**
 * WorkspaceAccess types for Spec 011 — Workspace Hierarchical Visibility.
 * Describes how a user gained access to a workspace (direct membership vs.
 * inherited access via ancestor admin).
 */

export type WorkspaceAccessType = 'direct' | 'ancestor_admin';

/**
 * The effective access descriptor attached to `request.workspaceAccess`
 * by the workspace guard after a successful access check.
 *
 * - `direct`: user is a direct member of the workspace
 * - `ancestor_admin`: user is ADMIN of an ancestor workspace and gains
 *   read-only (HIERARCHICAL_READER) access to descendant workspaces
 */
export interface WorkspaceAccess {
  workspaceId: string;
  userId: string;
  /** Effective role. Inherited access always uses 'HIERARCHICAL_READER'. */
  role: 'ADMIN' | 'MEMBER' | 'VIEWER' | 'HIERARCHICAL_READER';
  accessType: WorkspaceAccessType;
}
