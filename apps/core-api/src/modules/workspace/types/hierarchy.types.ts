/**
 * Hierarchy types for Spec 011 — Workspace Hierarchical Visibility & Templates
 * See: plan.md §4.1, ADR-013 (Materialised Path)
 */

/**
 * Raw SQL row shape for a workspace record (extended with hierarchy fields).
 * Matches the column names returned by $queryRaw selects on the workspaces table.
 */
export interface WorkspaceHierarchyRow {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  depth: number;
  path: string;
  slug: string;
  name: string;
  description: string | null;
  settings: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

/**
 * Computed hierarchy fields returned by computeHierarchyFields().
 */
export interface HierarchyFields {
  depth: number;
  path: string;
}

/**
 * Aggregated member and child workspace counts across a subtree.
 * Used by getAggregatedCounts() for workspace cards / stats panels.
 */
export interface AggregatedCounts {
  /** Total distinct member count across this workspace and all descendants. */
  aggregatedMemberCount: number;
  /** Total descendant workspace count (direct + indirect children). */
  aggregatedChildCount: number;
}

/**
 * Nested tree node returned by getTree().
 * Represents a workspace visible to the requesting user.
 */
export interface TreeNode {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  depth: number;
  path: string;
  parentId: string | null;
  /** The requesting user's role in this workspace, null if access via ancestor inheritance. */
  memberRole: string | null;
  _count: {
    members: number;
    children: number;
  };
  children: TreeNode[];
}

/**
 * WorkspaceAccess result — which role (direct or inherited) the user has.
 */
export type AccessSource = 'direct' | 'hierarchical';

export interface WorkspaceAccess {
  workspaceId: string;
  userId: string;
  /** Effective role. Inherited access uses 'VIEWER' regardless of ancestor role. */
  role: string;
  source: AccessSource;
}
