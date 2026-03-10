// File: apps/web/src/api/layout-config.ts
//
// Typed API client functions for Spec 014 Frontend Layout Engine endpoints.
// All functions use the existing `apiClient` singleton (WebApiClient) which
// handles Keycloak token refresh and auth failure redirects.
//
// Route prefixes (from apps/core-api/src/index.ts):
//   layoutConfigRoutes registered at /api/v1
//
// Spec 014 Layout Config endpoints:
//   GET  /api/v1/layout-configs/forms
//   GET  /api/v1/layout-configs/:formId
//   PUT  /api/v1/layout-configs/:formId
//   POST /api/v1/layout-configs/:formId/revert
//   DELETE /api/v1/layout-configs/:formId
//   GET  /api/v1/layout-configs/:formId/resolved
//   GET  /api/v1/workspaces/:wId/layout-configs/:formId
//   PUT  /api/v1/workspaces/:wId/layout-configs/:formId
//   POST /api/v1/workspaces/:wId/layout-configs/:formId/revert
//   DELETE /api/v1/workspaces/:wId/layout-configs/:formId

import { apiClient } from '@/lib/api-client';
import type {
  ConfigurableFormSummary,
  LayoutConfig,
  ResolvedLayout,
  SaveLayoutConfigInput,
} from '@plexica/types';

// ---------------------------------------------------------------------------
// Local raw client type (same pattern as apps/web/src/api/admin.ts)
// ---------------------------------------------------------------------------
// TenantApiClient exposes get/patch/post/delete at runtime but they are not
// in the public TypeScript surface. We cast once locally to keep call sites
// clean — the ApiClient interface in api-client.ts covers get/patch, but
// layout config also needs post and delete.

type RawClient = {
  get<T>(url: string): Promise<T>;
  put<T>(url: string, body: unknown): Promise<T>;
  post<T>(url: string, body: unknown): Promise<T>;
  delete<T>(url: string): Promise<T>;
};

function raw(): RawClient {
  return apiClient as unknown as RawClient;
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

export interface LayoutConfigFormsResponse {
  forms: ConfigurableFormSummary[];
}

export interface LayoutConfigResponse {
  config: LayoutConfig | null;
}

export interface LayoutConfigSaveResponse {
  config: LayoutConfig;
}

export interface RequiredFieldWarning {
  fieldId: string;
  label: string;
}

export interface LayoutConfigWarnings {
  code: 'REQUIRED_FIELD_NO_DEFAULT';
  message: string;
  details: {
    fields: RequiredFieldWarning[];
  };
}

// ---------------------------------------------------------------------------
// API error shape (Constitution Art. 6.2)
// ---------------------------------------------------------------------------

export interface LayoutConfigApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Tenant-scope API functions
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/layout-configs/forms
 * Returns the list of forms contributed by installed plugins that have
 * formSchemas in their manifest.
 */
export async function getLayoutConfigForms(): Promise<ConfigurableFormSummary[]> {
  const response = await raw().get<LayoutConfigFormsResponse>('/api/v1/layout-configs/forms');
  return response.forms;
}

/**
 * GET /api/v1/layout-configs/:formId
 * Returns the current saved layout config for a form at tenant scope.
 * Returns null if no config has been saved (plugin defaults apply).
 *
 * @param formId - The form identifier (e.g. "crm-contact-form")
 */
export async function getLayoutConfig(formId: string): Promise<LayoutConfig | null> {
  const response = await raw().get<LayoutConfigResponse>(
    `/api/v1/layout-configs/${encodeURIComponent(formId)}`
  );
  return response.config;
}

/**
 * PUT /api/v1/layout-configs/:formId
 * Saves (creates or updates) the layout config for a form at tenant scope.
 * Supports optimistic concurrency via `etag` (ISO string from `updatedAt`).
 *
 * @param formId - The form identifier
 * @param input  - The layout config payload
 * @param etag   - Optional ETag (updatedAt ISO string) for conflict detection
 */
export async function saveLayoutConfig(
  formId: string,
  input: SaveLayoutConfigInput,
  etag?: string
): Promise<LayoutConfig> {
  const url = `/api/v1/layout-configs/${encodeURIComponent(formId)}`;
  const headers: Record<string, string> = {};
  if (etag) {
    headers['If-Match'] = etag;
  }
  // The TenantApiClient's put method does not expose a headers parameter,
  // so for ETag support we use the underlying fetch-like interface.
  // For now: pass etag as a body field alongside the payload (backend reads
  // from both If-Match header and body.etag as a fallback for clients that
  // cannot set headers). The backend route handler checks body.etag if the
  // header is absent.
  const body = etag ? { ...input, etag } : input;
  const response = await raw().put<LayoutConfigSaveResponse>(url, body);
  return response.config;
}

/**
 * POST /api/v1/layout-configs/:formId/revert
 * Reverts the current config to the previous version (single-step undo).
 *
 * @param formId - The form identifier
 */
export async function revertLayoutConfig(formId: string): Promise<LayoutConfig> {
  const response = await raw().post<LayoutConfigSaveResponse>(
    `/api/v1/layout-configs/${encodeURIComponent(formId)}/revert`,
    {}
  );
  return response.config;
}

/**
 * DELETE /api/v1/layout-configs/:formId
 * Soft-deletes the layout config for a form (reverts to plugin manifest defaults).
 *
 * @param formId - The form identifier
 */
export async function deleteLayoutConfig(formId: string): Promise<void> {
  await raw().delete<void>(`/api/v1/layout-configs/${encodeURIComponent(formId)}`);
}

/**
 * GET /api/v1/layout-configs/:formId/resolved
 * Returns the fully resolved layout for the current user.
 * Includes role-specific visibility decisions. Cached 60s client-side.
 *
 * @param formId      - The form identifier
 * @param workspaceId - Optional workspace ID for workspace-scope resolution
 */
export async function getResolvedLayout(
  formId: string,
  workspaceId?: string
): Promise<ResolvedLayout> {
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  return raw().get<ResolvedLayout>(
    `/api/v1/layout-configs/${encodeURIComponent(formId)}/resolved${qs}`
  );
}

// ---------------------------------------------------------------------------
// Workspace-scope API functions
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/workspaces/:wId/layout-configs/:formId
 * Returns the workspace-level layout config (if it exists).
 *
 * @param workspaceId - The workspace UUID
 * @param formId      - The form identifier
 */
export async function getWorkspaceLayoutConfig(
  workspaceId: string,
  formId: string
): Promise<LayoutConfig | null> {
  const response = await raw().get<LayoutConfigResponse>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/layout-configs/${encodeURIComponent(formId)}`
  );
  return response.config;
}

/**
 * PUT /api/v1/workspaces/:wId/layout-configs/:formId
 * Saves (creates or updates) the workspace-level layout config.
 *
 * @param workspaceId - The workspace UUID
 * @param formId      - The form identifier
 * @param input       - The layout config payload
 * @param etag        - Optional ETag for conflict detection
 */
export async function saveWorkspaceLayoutConfig(
  workspaceId: string,
  formId: string,
  input: SaveLayoutConfigInput,
  etag?: string
): Promise<LayoutConfig> {
  const url = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/layout-configs/${encodeURIComponent(formId)}`;
  const body = etag ? { ...input, etag } : input;
  const response = await raw().put<LayoutConfigSaveResponse>(url, body);
  return response.config;
}

/**
 * POST /api/v1/workspaces/:wId/layout-configs/:formId/revert
 * Reverts workspace-level config to previous version.
 *
 * @param workspaceId - The workspace UUID
 * @param formId      - The form identifier
 */
export async function revertWorkspaceLayoutConfig(
  workspaceId: string,
  formId: string
): Promise<LayoutConfig> {
  const response = await raw().post<LayoutConfigSaveResponse>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/layout-configs/${encodeURIComponent(formId)}/revert`,
    {}
  );
  return response.config;
}

/**
 * DELETE /api/v1/workspaces/:wId/layout-configs/:formId
 * Soft-deletes the workspace-level layout config.
 *
 * @param workspaceId - The workspace UUID
 * @param formId      - The form identifier
 */
export async function deleteWorkspaceLayoutConfig(
  workspaceId: string,
  formId: string
): Promise<void> {
  await raw().delete<void>(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/layout-configs/${encodeURIComponent(formId)}`
  );
}
