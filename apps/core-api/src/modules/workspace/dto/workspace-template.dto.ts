// apps/core-api/src/modules/workspace/dto/workspace-template.dto.ts
//
// Response DTO types for workspace-template endpoints.
// Implements Spec 011 Phase 2 — FR-021, FR-022.
//
// These types mirror the service layer's TemplateListItem and TemplateWithItems
// and are used to type route handlers and test assertions.

export interface WorkspaceTemplateListItemDto {
  id: string;
  name: string;
  description: string | null;
  provided_by_plugin_id: string;
  is_default: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
  item_count: number;
}

export interface WorkspaceTemplateItemDto {
  id: string;
  template_id: string;
  type: 'plugin' | 'page' | 'setting';
  plugin_id: string | null;
  page_config: Record<string, unknown> | null;
  setting_key: string | null;
  setting_value: unknown | null;
  sort_order: number;
  created_at: Date;
}

export interface WorkspaceTemplateDetailDto {
  id: string;
  name: string;
  description: string | null;
  provided_by_plugin_id: string;
  is_default: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  items: WorkspaceTemplateItemDto[];
}
