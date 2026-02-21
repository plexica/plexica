// apps/core-api/src/modules/workspace/types/workspace-plugin.types.ts
//
// Type definitions for workspace-level plugin management (Spec 011 Phase 2).

export interface WorkspacePluginRow {
  workspace_id: string;
  plugin_id: string;
  enabled: boolean;
  configuration: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}
